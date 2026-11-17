export type CaptureOptions = {
  maxLongEdge: number
  jpegQuality: number
}

export type CapturedImage = {
  blob: Blob
  objectUrl: string
  mimeType: 'image/jpeg'
  width: number
  height: number
  originalWidth: number
  originalHeight: number
  sizeBytes: number
  capturedAt: string
}

export const DEFAULT_CAPTURE_OPTIONS: CaptureOptions = {
  // 기기의 원본 비율을 유지하고 고해상도 센서의 출력만 제한한다.
  maxLongEdge: 4096,
  jpegQuality: 0.96,
}

type PhotoSettings = {
  imageWidth?: number
  imageHeight?: number
}

type PhotoCapabilities = {
  imageWidth?: MediaSettingsRange
  imageHeight?: MediaSettingsRange
}

type ImageCaptureApi = {
  getPhotoCapabilities?: () => Promise<PhotoCapabilities>
  takePhoto: (settings?: PhotoSettings) => Promise<Blob>
}

type ImageCaptureConstructor = new (track: MediaStreamTrack) => ImageCaptureApi

function clampToRange(value: number, range?: MediaSettingsRange): number {
  const minimum = range?.min
  const maximum = range?.max

  if (typeof minimum !== 'number' || typeof maximum !== 'number') {
    return Math.max(1, Math.round(value))
  }

  const clamped = Math.min(maximum, Math.max(minimum, value))
  const step = range?.step || 1
  const stepped = minimum + Math.round((clamped - minimum) / step) * step

  return Math.min(maximum, Math.max(minimum, Math.round(stepped)))
}

export async function captureCameraPhotoBlob(
  stream: MediaStream,
  maxLongEdge: number,
): Promise<Blob | null> {
  const ImageCaptureClass = (
    globalThis as typeof globalThis & { ImageCapture?: ImageCaptureConstructor }
  ).ImageCapture
  const track = stream.getVideoTracks()[0]

  if (
    !ImageCaptureClass ||
    !track ||
    track.readyState !== 'live'
  ) {
    return null
  }

  try {
    const imageCapture = new ImageCaptureClass(track)
    // 기능 조회만 실패하는 부분 지원 브라우저에서도 기본 정지사진은 시도한다.
    const capabilities = await imageCapture.getPhotoCapabilities?.().catch(() => null)
    const maximumWidth = capabilities?.imageWidth?.max
    const maximumHeight = capabilities?.imageHeight?.max
    let blob: Blob

    if (maximumWidth && maximumHeight) {
      // 사진 센서와 회전된 미리보기의 방향은 다를 수 있다. 사진 범위를 기준으로
      // 비율을 유지하고, 제조사가 조합을 거부하면 기본 사진 설정으로 재시도한다.
      const ratio = maximumWidth / maximumHeight
      const height = Math.min(
        maximumHeight,
        maximumWidth / ratio,
        maxLongEdge / Math.max(1, ratio),
      )
      try {
        blob = await imageCapture.takePhoto({
          imageWidth: clampToRange(height * ratio, capabilities?.imageWidth),
          imageHeight: clampToRange(height, capabilities?.imageHeight),
        })
      } catch {
        blob = await imageCapture.takePhoto()
      }
    } else {
      blob = await imageCapture.takePhoto()
    }

    return blob
  } catch (error) {
    // 정지사진 촬영을 지원하지 않으면 영상 프레임을 사용한다.
    console.warn('Processed still capture failed; using video frame', error)
    return null
  }
}

async function captureProcessedStill(
  stream: MediaStream,
  maxLongEdge: number,
): Promise<ImageBitmap | null> {
  if (typeof createImageBitmap !== 'function') return null
  const blob = await captureCameraPhotoBlob(stream, maxLongEdge)
  if (!blob) return null
  try {
    return await createImageBitmap(blob, { imageOrientation: 'from-image' })
  } catch (error) {
    console.warn('Still decoding failed; using video frame', error)
    return null
  }
}

export function resizeDimensions(
  sourceWidth: number,
  sourceHeight: number,
  maxLongEdge: number,
): { width: number; height: number } {
  const longEdge = Math.max(sourceWidth, sourceHeight)

  if (longEdge <= maxLongEdge) {
    return {
      width: sourceWidth,
      height: sourceHeight,
    }
  }

  const scale = maxLongEdge / longEdge

  return {
    width: Math.max(1, Math.round(sourceWidth * scale)),
    height: Math.max(1, Math.round(sourceHeight * scale)),
  }
}

export function canvasToJpegBlob(
  canvas: HTMLCanvasElement,
  quality: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('JPEG Blob을 생성할 수 없습니다'))
          return
        }

        resolve(blob)
      },
      'image/jpeg',
      quality,
    )
  })
}

export function createObjectUrl(blob: Blob): string {
  return URL.createObjectURL(blob)
}

export async function captureCameraImage(
  videoElement: HTMLVideoElement,
  stream: MediaStream,
  options: CaptureOptions = DEFAULT_CAPTURE_OPTIONS,
): Promise<CapturedImage> {
  if (videoElement.videoWidth === 0 || videoElement.videoHeight === 0) {
    throw new Error('카메라 영상이 아직 준비되지 않았습니다')
  }

  if (stream.getVideoTracks()[0]?.readyState !== 'live' || videoElement.readyState < 2) {
    throw new Error('카메라 연결이 끊겼습니다. 카메라를 다시 시작해 주세요.')
  }

  const frame = await captureProcessedStill(stream, options.maxLongEdge)
  if (!frame && (stream.getVideoTracks()[0]?.readyState !== 'live' || videoElement.readyState < 2)) {
    throw new Error('카메라 연결이 끊겼습니다. 카메라를 다시 시작해 주세요.')
  }
  // 영상은 직접 canvas에 그려 createImageBitmap(video) 미지원 기기도 처리한다.
  try {
    return await encodeCameraFrame(
      frame ?? videoElement,
      frame?.width ?? videoElement.videoWidth,
      frame?.height ?? videoElement.videoHeight,
      options,
    )
  } finally {
    frame?.close()
  }
}

// Normal capture and the comparison experiment use exactly the same encoder.
export async function encodeCameraFrame(
  source: CanvasImageSource,
  originalWidth: number,
  originalHeight: number,
  options: CaptureOptions = DEFAULT_CAPTURE_OPTIONS,
): Promise<CapturedImage> {
  const { width, height } = resizeDimensions(
    originalWidth,
    originalHeight,
    options.maxLongEdge,
  )
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height

  const context = canvas.getContext('2d')

  try {
    if (!context) {
      throw new Error('캔버스 작업 영역을 만들 수 없습니다')
    }

    context.imageSmoothingEnabled = true
    context.imageSmoothingQuality = 'high'
    context.drawImage(source, 0, 0, width, height)

    const blob = await canvasToJpegBlob(canvas, options.jpegQuality)
    const objectUrl = createObjectUrl(blob)

    return {
      blob,
      objectUrl,
      mimeType: 'image/jpeg',
      width,
      height,
      originalWidth,
      originalHeight,
      sizeBytes: blob.size,
      capturedAt: new Date().toISOString(),
    }
  } finally {
    canvas.width = 0
    canvas.height = 0
  }
}
