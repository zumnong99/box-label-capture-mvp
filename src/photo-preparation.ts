import { captureCameraPhotoBlob, createObjectUrl, DEFAULT_CAPTURE_OPTIONS, encodeCameraFrame } from './capture'
import type { CapturedImage, CaptureOptions } from './capture'
import { readJpegMetadata } from './jpeg-metadata'

export type PreparationMode = 'reencode' | 'original'
export type PreparedPhoto = {
  image: CapturedImage
  usedOriginal: boolean
  fallbackReason: string | null
}

function assertCameraReady(video: HTMLVideoElement, stream: MediaStream): void {
  if (video.videoWidth === 0 || video.videoHeight === 0) {
    throw new Error('카메라 영상이 아직 준비되지 않았습니다')
  }
  if (stream.getVideoTracks()[0]?.readyState !== 'live' || video.readyState < 2) {
    throw new Error('카메라 연결이 끊겼습니다. 카메라를 다시 시작해 주세요.')
  }
}

// Production capture uses the same original-first preparation as the experiment.
// Preserve EXIF orientation; decode/encode only for resizing or unreadable metadata.
export async function capturePhotoForStorage(
  video: HTMLVideoElement,
  stream: MediaStream,
  options: CaptureOptions = DEFAULT_CAPTURE_OPTIONS,
): Promise<PreparedPhoto> {
  assertCameraReady(video, stream)
  const photo = await captureCameraPhotoBlob(stream, options.maxLongEdge)
  if (photo) {
    try {
      return await preparePhoto(photo, 'original', options)
    } catch (error) {
      console.warn('Still preparation failed; using video frame', error)
    }
  }

  assertCameraReady(video, stream)
  return {
    image: await encodeCameraFrame(video, video.videoWidth, video.videoHeight, options),
    usedOriginal: false,
    fallbackReason: '정지사진을 사용할 수 없어 영상 프레임으로 저장',
  }
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
    else if (Math.max(metadata.width, metadata.height) > options.maxLongEdge) {
      fallbackReason = `${options.maxLongEdge}px 제한을 맞추기 위해 기존 변환 사용`
    } else {
      // No decode, resampling, or additional JPEG compression in this branch.
      const jpeg = blob.type === 'image/jpeg' ? blob : blob.slice(0, blob.size, 'image/jpeg')
      const swapsAxes = metadata.orientation >= 5
      return {
        usedOriginal: true,
        fallbackReason: null,
        image: {
          blob: jpeg,
          objectUrl: createObjectUrl(jpeg),
          mimeType: 'image/jpeg',
          // Match the displayed size after applying EXIF, without touching pixels.
          width: swapsAxes ? metadata.height : metadata.width,
          height: swapsAxes ? metadata.width : metadata.height,
          originalWidth: metadata.width,
          originalHeight: metadata.height,
          exifOrientation: metadata.orientation,
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
