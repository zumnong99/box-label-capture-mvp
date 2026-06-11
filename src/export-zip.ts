import JSZip from 'jszip'
import { getPhotosForSession } from './indexed-photo-store'
import { buildManifest, buildManifestCsv } from './manifest'
import { getCapturedImageKey } from './photo-keys'
import type { PersistedPhotoRecord } from './indexed-photo-store'
import type { SessionState } from './types'

export type ExportProgress = {
  phase: 'collecting' | 'zipping' | 'ready' | 'error'
  percent: number
  message: string
}

export type ExportResult = {
  blob: Blob
  fileName: string
  sessionId: string
  totalPhotos: number
  missingPhotos: number
}

export type ExportSummary = {
  sessionId: string
  totalCarts: number
  totalExpectedBoxes: number
  totalCapturedBoxes: number
  photosAvailable: number
  missingPhotos: number
  incompleteCartNos: string[]
  totalPhotoSizeBytes: number
  zipFileName: string
}

export type ExportProgressCallback = (progress: ExportProgress) => void

function getCapturedBoxKeys(session: SessionState): Set<string> {
  const keys = new Set<string>()

  session.carts.forEach((cart) => {
    cart.boxes.forEach((box) => {
      if (box.status === 'captured') {
        keys.add(getCapturedImageKey(session.sessionId, cart.cartNo, box.boxNo))
      }
    })
  })

  return keys
}

function sortPhotos(photos: PersistedPhotoRecord[]): PersistedPhotoRecord[] {
  return [...photos].sort((left, right) => {
    const cartCompare = left.cartNo.localeCompare(right.cartNo)

    if (cartCompare !== 0) {
      return cartCompare
    }

    return left.boxNo - right.boxNo
  })
}

export function buildExportSummary(
  session: SessionState,
  photos: PersistedPhotoRecord[],
): ExportSummary {
  const photoKeys = new Set(photos.map((photo) => photo.key))
  const capturedBoxKeys = getCapturedBoxKeys(session)
  const missingPhotos = [...capturedBoxKeys].filter(
    (key) => !photoKeys.has(key),
  ).length

  return {
    sessionId: session.sessionId,
    totalCarts: session.carts.length,
    totalExpectedBoxes: session.carts.reduce(
      (total, cart) => total + cart.boxes.length,
      0,
    ),
    totalCapturedBoxes: capturedBoxKeys.size,
    photosAvailable: photos.length,
    missingPhotos,
    incompleteCartNos: session.carts
      .filter((cart) => cart.boxes.some((box) => box.status !== 'captured'))
      .map((cart) => cart.cartNo),
    totalPhotoSizeBytes: photos.reduce(
      (total, photo) => total + photo.sizeBytes,
      0,
    ),
    zipFileName: `${session.sessionId}.zip`,
  }
}

export async function collectExportSummary(
  session: SessionState,
): Promise<ExportSummary> {
  const photos = await getPhotosForSession(session.sessionId)
  return buildExportSummary(session, photos)
}

export async function buildSessionZip(
  session: SessionState,
  onProgress?: ExportProgressCallback,
): Promise<ExportResult> {
  onProgress?.({
    phase: 'collecting',
    percent: 10,
    message: 'IndexedDB에서 사진을 불러오는 중입니다.',
  })

  const photos = sortPhotos(await getPhotosForSession(session.sessionId))
  const summary = buildExportSummary(session, photos)
  const exportedAt = new Date().toISOString()
  const zip = new JSZip()
  const rootFolder = zip.folder(session.sessionId)

  if (!rootFolder) {
    throw new Error('ZIP 루트 폴더를 만들 수 없습니다')
  }

  try {
    rootFolder.file(
      'manifest.json',
      JSON.stringify(buildManifest(session, exportedAt), null, 2),
    )
    rootFolder.file('manifest.csv', buildManifestCsv(session, exportedAt))

    photos.forEach((photo, index) => {
      rootFolder.file(photo.relativePath, photo.blob)
      onProgress?.({
        phase: 'collecting',
        percent: Math.min(40, 15 + Math.round(((index + 1) / photos.length) * 25)),
        message: `${index + 1}개 사진을 ZIP에 추가했습니다.`,
      })
    })
  } catch (error) {
    onProgress?.({
      phase: 'error',
      percent: 0,
      message: 'manifest 또는 사진 파일을 준비하지 못했습니다.',
    })
    throw error
  }

  onProgress?.({
    phase: 'zipping',
    percent: 55,
    message: 'ZIP 파일을 생성하는 중입니다.',
  })

  try {
    const blob = await zip.generateAsync(
      {
        type: 'blob',
        compression: 'DEFLATE',
        compressionOptions: {
          level: 6,
        },
      },
      (metadata) => {
        onProgress?.({
          phase: 'zipping',
          percent: 55 + Math.round(metadata.percent * 0.4),
          message: 'ZIP 파일을 생성하는 중입니다.',
        })
      },
    )

    onProgress?.({
      phase: 'ready',
      percent: 100,
      message: 'ZIP 파일을 생성했습니다.',
    })

    return {
      blob,
      fileName: summary.zipFileName,
      sessionId: session.sessionId,
      totalPhotos: summary.photosAvailable,
      missingPhotos: summary.missingPhotos,
    }
  } catch (error) {
    onProgress?.({
      phase: 'error',
      percent: 0,
      message:
        'ZIP 생성 중 오류가 발생했습니다. 세션을 나누어 내보내는 방식을 권장합니다.',
    })
    throw error
  }
}

export function downloadBlob(blob: Blob, fileName: string): void {
  const objectUrl = URL.createObjectURL(blob)
  const link = document.createElement('a')

  try {
    link.href = objectUrl
    link.download = fileName
    link.style.display = 'none'
    document.body.append(link)
    link.click()
  } finally {
    link.remove()
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
  }
}

export function canShareFiles(file: File): boolean {
  return Boolean(navigator.canShare?.({ files: [file] }))
}

export async function shareZipIfSupported(
  blob: Blob,
  fileName: string,
): Promise<boolean> {
  const file = new File([blob], fileName, {
    type: 'application/zip',
  })

  if (!canShareFiles(file)) {
    return false
  }

  await navigator.share({
    files: [file],
    title: fileName,
    text: '박스 라벨 촬영 세션 ZIP 파일입니다.',
  })
  return true
}

export function formatExportProgress(progress: ExportProgress): string {
  return `${progress.percent}% · ${progress.message}`
}
