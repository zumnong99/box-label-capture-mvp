import type { PersistedPhotoRecord } from './indexed-photo-store'

function sortPhotoRecords(
  records: PersistedPhotoRecord[],
): PersistedPhotoRecord[] {
  return [...records].sort((left, right) => {
    const cartComparison = left.cartNo.localeCompare(right.cartNo)

    if (cartComparison !== 0) {
      return cartComparison
    }

    return left.boxNo - right.boxNo
  })
}

export function createShareablePhotoFiles(
  records: PersistedPhotoRecord[],
): File[] {
  return sortPhotoRecords(records).map(
    (record) =>
      new File([record.blob], record.fileName, {
        type: record.mimeType,
        lastModified: new Date(record.capturedAt).getTime(),
      }),
  )
}

export function canSharePhotoFiles(files: File[]): boolean {
  if (files.length === 0 || typeof navigator.canShare !== 'function') {
    return false
  }

  try {
    return navigator.canShare({ files })
  } catch {
    return false
  }
}

export async function sharePhotoFiles(
  files: File[],
  title: string,
): Promise<void> {
  if (!canSharePhotoFiles(files) || typeof navigator.share !== 'function') {
    throw new DOMException(
      '이 브라우저에서는 선택한 사진 파일을 공유할 수 없습니다.',
      'NotSupportedError',
    )
  }

  // 파일과 함께 text/url을 전달하면 일부 Android 공유 대상이 목록에서
  // 제외될 수 있어, 사진 파일과 제목만 시스템 공유 시트로 보낸다.
  await navigator.share({ files, title })
}
