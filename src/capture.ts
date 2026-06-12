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
  jpegQuality: 0.92,
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

export async function captureVideoFrame(
  videoElement: HTMLVideoElement,
  options: CaptureOptions = DEFAULT_CAPTURE_OPTIONS,
): Promise<CapturedImage> {
  const originalWidth = videoElement.videoWidth
  const originalHeight = videoElement.videoHeight

  if (originalWidth === 0 || originalHeight === 0) {
    throw new Error('카메라 영상이 아직 준비되지 않았습니다')
  }

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
    throw new Error('캔버스 작업 영역을 만들 수 없습니다')
  }

  context.drawImage(videoElement, 0, 0, width, height)

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
