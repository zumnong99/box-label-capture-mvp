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
  // 스트림이 4:3 고해상도(최대 4032)로 협상될 수 있어 깎지 않도록 여유
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

async function captureProcessedStill(
  stream: MediaStream,
): Promise<ImageBitmap | null> {
  const ImageCaptureClass = (
    globalThis as typeof globalThis & { ImageCapture?: ImageCaptureConstructor }
  ).ImageCapture
  const track = stream.getVideoTracks()[0]

  if (!ImageCaptureClass || !track || track.readyState !== 'live') {
    return null
  }

  try {
    const imageCapture = new ImageCaptureClass(track)
    const capabilities = imageCapture.getPhotoCapabilities
      ? await imageCapture.getPhotoCapabilities()
      : null
    const trackSettings = track.getSettings()
    const capabilityWidth = capabilities?.imageWidth?.max
    const capabilityHeight = capabilities?.imageHeight?.max
    const referenceWidth = capabilityWidth ?? trackSettings.width ?? 4032
    const referenceHeight = capabilityHeight ?? trackSettings.height ?? 3024
    const longEdge = Math.min(Math.max(referenceWidth, referenceHeight), 4032)
    const shortEdge = Math.round(longEdge * 0.75)
    const sensorIsLandscape = referenceWidth >= referenceHeight
    const requestedWidth = sensorIsLandscape ? longEdge : shortEdge
    const requestedHeight = sensorIsLandscape ? shortEdge : longEdge
    const blob = await imageCapture.takePhoto({
      imageWidth: clampToRange(requestedWidth, capabilities?.imageWidth),
      imageHeight: clampToRange(requestedHeight, capabilities?.imageHeight),
    })

    return await createImageBitmap(blob, { imageOrientation: 'from-image' })
  } catch (error) {
    // 부분 지원 브라우저나 제조사 카메라가 PhotoSettings를 거부하면
    // 같은 고해상도 스트림 프레임으로 안전하게 폴백한다.
    console.warn('Processed still capture failed; using video frame', error)
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

  // Android/Chromium에서는 동영상 프레임보다 제조사 ISP의 노이즈 제거와
  // 정지사진 처리가 적용되는 ImageCapture를 우선한다. Safari는 기존 프레임
  // 캡처로 폴백하므로 iPhone 호환성도 유지된다.
  const frame =
    (await captureProcessedStill(stream)) ??
    (await createImageBitmap(videoElement))
  const originalWidth = frame.width
  const originalHeight = frame.height

  const { width, height } = resizeDimensions(
    originalWidth,
    originalHeight,
    options.maxLongEdge,
  )
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height

  const context = canvas.getContext('2d')

  if (!context) {
    frame.close()
    throw new Error('캔버스 작업 영역을 만들 수 없습니다')
  }

  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  // 폴드 커버 미리보기는 중앙을 크게 보여 주지만 저장은 센서의 전체 3:4
  // 프레임을 유지한다. label_scan의 기존 입력 범위와 검출률을 보존하기 위함이다.
  context.drawImage(frame, 0, 0, width, height)
  frame.close()

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
}
