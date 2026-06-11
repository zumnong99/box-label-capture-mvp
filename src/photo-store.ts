import type { CapturedImage } from './capture'

const capturedImages = new Map<string, CapturedImage>()

export function getCapturedImageKey(
  sessionId: string,
  cartNo: string,
  boxNo: number,
): string {
  return `${sessionId}::${cartNo}::${boxNo}`
}

export function setCapturedImage(key: string, image: CapturedImage): void {
  const existingImage = capturedImages.get(key)

  if (existingImage && existingImage.objectUrl !== image.objectUrl) {
    URL.revokeObjectURL(existingImage.objectUrl)
  }

  capturedImages.set(key, image)
}

export function getCapturedImage(key: string): CapturedImage | null {
  return capturedImages.get(key) ?? null
}

export function deleteCapturedImage(key: string): void {
  const existingImage = capturedImages.get(key)

  if (existingImage) {
    URL.revokeObjectURL(existingImage.objectUrl)
    capturedImages.delete(key)
  }
}

export function clearCapturedImages(): void {
  capturedImages.forEach((image) => {
    URL.revokeObjectURL(image.objectUrl)
  })
  capturedImages.clear()
}
