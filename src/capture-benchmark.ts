import { buildSessionZip } from './export-zip'
import type { ExportResult } from './export-zip'
import { buildPersistedPhotoRecord, deletePhotosForSession, savePhoto } from './indexed-photo-store'
import { preparePhoto } from './photo-preparation'
import type { PreparationMode } from './photo-preparation'
import { captureCurrentBox, createSession } from './state'

export const BENCHMARK_DATABASE = 'box-label-capture-speed-test'
export type BenchmarkSample = {
  mode: PreparationMode
  round: number
  processingMs: number
  saveMs: number
  zipMs: number
  totalMs: number
  photoBytes: number
  zipBytes: number
  width: number
  height: number
  usedOriginal: boolean
  fallbackReason: string | null
}
export type BenchmarkResult = {
  measuredAt: string
  userAgent: string
  source: { bytes: number; type: string }
  rounds: number
  samples: BenchmarkSample[]
  archives: Record<PreparationMode, ExportResult>
}

export function median(values: number[]): number {
  const sorted = [...values].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

// Same Blob, same production encoder/IndexedDB/ZIP code. The private database
// prevents experiments from reading or modifying any real capture session.
export async function runCaptureBenchmark(
  source: Blob,
  rounds = 5,
  onProgress?: (message: string) => void,
): Promise<BenchmarkResult> {
  if (!Number.isInteger(rounds) || rounds < 1 || rounds > 10) throw new Error('시험 횟수는 1~10회여야 합니다.')
  if (!source.size) throw new Error('비어 있는 사진은 시험할 수 없습니다.')
  const samples: BenchmarkSample[] = []
  const archives = {} as Record<PreparationMode, ExportResult>
  const runId = crypto.randomUUID()

  async function run(mode: PreparationMode, round: number): Promise<void> {
    let session = createSession()
    session.sessionId = `speed_test_${runId}_${mode}`
    const start = performance.now()
    const prepared = await preparePhoto(source, mode)
    const processingEnd = performance.now()
    const image = prepared.image
    try {
      const record = buildPersistedPhotoRecord({
        sessionId: session.sessionId, cartNo: '001', boxNo: 1, image, retakeCount: 0,
      })
      const saveStart = performance.now()
      await savePhoto(record, BENCHMARK_DATABASE)
      const saveEnd = performance.now()
      session = captureCurrentBox(session, image.capturedAt, {
        imageWidth: image.width, imageHeight: image.height, imageSizeBytes: image.sizeBytes,
        imageExifOrientation: image.exifOrientation ?? 1, mimeType: image.mimeType,
      })
      const zipStart = performance.now()
      const archive = await buildSessionZip(session, undefined, BENCHMARK_DATABASE)
      const end = performance.now()
      if (round > 0) {
        samples.push({
          mode, round, processingMs: processingEnd - start, saveMs: saveEnd - saveStart,
          zipMs: end - zipStart, totalMs: end - start, photoBytes: image.sizeBytes,
          zipBytes: archive.blob.size, width: image.width, height: image.height,
          usedOriginal: prepared.usedOriginal, fallbackReason: prepared.fallbackReason,
        })
        archives[mode] = archive
      }
    } finally {
      URL.revokeObjectURL(image.objectUrl)
      await deletePhotosForSession(session.sessionId, BENCHMARK_DATABASE)
    }
  }

  onProgress?.('준비 실행 중 · 방식별 1회는 측정에서 제외합니다.')
  await run('reencode', 0)
  await run('original', 0)
  for (let round = 1; round <= rounds; round++) {
    const order: PreparationMode[] = round % 2 ? ['reencode', 'original'] : ['original', 'reencode']
    for (const mode of order) {
      onProgress?.(`${round}/${rounds}회 · ${mode === 'reencode' ? '기존 변환' : '원본 우선'} 측정 중`)
      // Let progress paint; this wait is outside all recorded measurements.
      await new Promise<void>((resolve) => setTimeout(resolve, 30))
      await run(mode, round)
    }
  }
  return {
    measuredAt: new Date().toISOString(), userAgent: navigator.userAgent,
    source: { bytes: source.size, type: source.type }, rounds, samples, archives,
  }
}
