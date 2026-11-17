import { createObjectUrl, DEFAULT_CAPTURE_OPTIONS, encodeCameraFrame } from './capture'
import type { CapturedImage, CaptureOptions } from './capture'
import { readJpegMetadata } from './jpeg-metadata'

export type PreparationMode = 'reencode' | 'original'
export type PreparedPhoto = {
  image: CapturedImage
  usedOriginal: boolean
  fallbackReason: string | null
}

export async function preparePhoto(
  blob: Blob,
  mode: PreparationMode,
  options: CaptureOptions = DEFAULT_CAPTURE_OPTIONS,
): Promise<PreparedPhoto> {
  let fallbackReason: string | null = null
  if (mode === 'original') {
    const metadata = await readJpegMetadata(blob)
    if (!metadata) fallbackReason = 'JPEG 크기·방향을 안전하게 확인할 수 없어 기존 변환 사용'
    else if (metadata.orientation !== 1) fallbackReason = 'EXIF 회전·반전 정규화가 필요해 기존 변환 사용'
    else if (Math.max(metadata.width, metadata.height) > options.maxLongEdge) {
      fallbackReason = `${options.maxLongEdge}px 제한을 맞추기 위해 기존 변환 사용`
    } else {
      // No decode, resampling, or additional JPEG compression in this branch.
      const jpeg = blob.type === 'image/jpeg' ? blob : blob.slice(0, blob.size, 'image/jpeg')
      return {
        usedOriginal: true,
        fallbackReason: null,
        image: {
          blob: jpeg,
          objectUrl: createObjectUrl(jpeg),
          mimeType: 'image/jpeg',
          width: metadata.width,
          height: metadata.height,
          originalWidth: metadata.width,
          originalHeight: metadata.height,
          sizeBytes: jpeg.size,
          capturedAt: new Date().toISOString(),
        },
      }
    }
  }
  const bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' })
  try {
    return { image: await encodeCameraFrame(bitmap, bitmap.width, bitmap.height, options), usedOriginal: false, fallbackReason }
  } finally {
    bitmap.close()
  }
}
