import type { CapturedImage } from './capture'
import {
  createCapturedImageFromRecord,
  type PersistedPhotoRecord,
} from './indexed-photo-store'
export { getCapturedImageKey } from './photo-keys'

export type RuntimeCapturedImage = CapturedImage & {
  persisted: boolean
}

const capturedImages = new Map<string, RuntimeCapturedImage>()

export function setCapturedImage(
  key: string,
  image: CapturedImage,
  options: { persisted: boolean },
): void {
  const existingImage = capturedImages.get(key)

  if (existingImage && existingImage.objectUrl !== image.objectUrl) {
    URL.revokeObjectURL(existingImage.objectUrl)
  }

  capturedImages.set(key, {
    ...image,
    persisted: options.persisted,
  })
}

export function setPersistedPhotoRecord(
  record: PersistedPhotoRecord,
): RuntimeCapturedImage {
  const image = createCapturedImageFromRecord(record)
  setCapturedImage(record.key, image, { persisted: true })
  return getCapturedImage(record.key) as RuntimeCapturedImage
}

export function markCapturedImagePersisted(key: string): void {
  const image = capturedImages.get(key)

  if (image) {
    image.persisted = true
  }
}

export function getCapturedImage(key: string): RuntimeCapturedImage | null {
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
