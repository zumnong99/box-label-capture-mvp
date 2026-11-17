import './style.css'
import { captureCameraPhotoBlob, DEFAULT_CAPTURE_OPTIONS } from './capture'
import { startCameraPreview, stopCameraPreview } from './camera'
import { median, runCaptureBenchmark } from './capture-benchmark'
import type { BenchmarkResult, BenchmarkSample } from './capture-benchmark'
import { downloadBlob } from './export-zip'
import { readJpegMetadata } from './jpeg-metadata'
import type { PreparationMode } from './photo-preparation'

const root = document.querySelector<HTMLDivElement>('#app')!
let source: Blob | null = null
let sourceUrl: string | null = null
let camera: MediaStream | null = null
let cameraStartController: AbortController | null = null
let busy = false
let acquisitionMs: number | null = null

root.innerHTML = `
  <main class="benchmark-shell">
    <a href="?">← 촬영 화면으로</a>
    <h1>촬영 속도 비교 시험</h1>
    <p>같은 사진으로 기존 JPEG 변환과 원본 우선 저장을 각각 5회 비교합니다.
    실제 촬영 데이터와 분리된 시험 저장소를 사용합니다.</p>
    <section class="benchmark-card">
      <h2>1. 시험 사진 준비</h2>
      <p>평소처럼 라벨을 촬영하세요. 카메라를 사용할 수 없으면 JPEG 파일을 선택할 수 있습니다.</p>
      <div class="benchmark-actions">
        <button type="button" data-action="start">카메라 시작</button>
        <button type="button" data-action="sample" disabled>시험 사진 촬영</button>
        <button type="button" data-action="stop" disabled>카메라 중지</button>
      </div>
      <video class="benchmark-video" data-video playsinline autoplay muted hidden></video>
      <p data-camera-status role="status"></p>
      <label class="benchmark-file">JPEG 파일로 비교 <input data-file type="file" accept="image/jpeg"></label>
      <img class="benchmark-preview" data-source-preview alt="시험에 사용할 사진" hidden />
      <p data-source-status>아직 시험 사진이 없습니다.</p>
    </section>
    <section class="benchmark-card">
      <h2>2. 같은 사진으로 비교</h2>
      <p>방식별 준비 실행 1회는 제외하고, 실행 순서를 번갈아 측정합니다.
      회전 보정 또는 4096px 초과 축소가 필요하면 원본 우선도 기존 변환을 사용합니다.</p>
      <button class="primary-action" type="button" data-action="run" disabled>5회 속도 비교</button>
      <p data-progress role="status" aria-live="polite"></p>
      <div data-results></div>
    </section>
  </main>
`

const video = root.querySelector<HTMLVideoElement>('[data-video]')!
const progress = root.querySelector<HTMLElement>('[data-progress]')!
const cameraStatus = root.querySelector<HTMLElement>('[data-camera-status]')!
const resultsElement = root.querySelector<HTMLElement>('[data-results]')!
const sourceStatus = root.querySelector<HTMLElement>('[data-source-status]')!
const fileInput = root.querySelector<HTMLInputElement>('[data-file]')!
const preview = root.querySelector<HTMLImageElement>('[data-source-preview]')!

function escape(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
}
function bytes(value: number): string { return `${(value / 1024 / 1024).toFixed(2)} MB` }
function milliseconds(value: number): string { return `${value.toFixed(1)} ms` }
function button(action: string): HTMLButtonElement { return root.querySelector(`[data-action="${action}"]`)! }
function syncControls(): void {
  button('start').disabled = busy || camera !== null
  button('sample').disabled = busy || camera === null
  button('stop').disabled = busy || camera === null
  button('run').disabled = busy || source === null
  fileInput.disabled = busy
}
function stopCamera(): void {
  cameraStartController?.abort()
  cameraStartController = null
  stopCameraPreview(camera)
  camera = null
  video.srcObject = null
  video.hidden = true
  syncControls()
}
async function setSource(blob: Blob): Promise<void> {
  const metadata = await readJpegMetadata(blob)
  const signature = new Uint8Array(await blob.slice(0, 2).arrayBuffer())
  if (signature[0] !== 0xff || signature[1] !== 0xd8) throw new Error('JPEG 사진을 선택해 주세요.')
  stopCamera()
  if (sourceUrl) URL.revokeObjectURL(sourceUrl)
  source = blob
  sourceUrl = URL.createObjectURL(blob)
  preview.src = sourceUrl
  preview.hidden = false
  resultsElement.innerHTML = ''
  progress.textContent = ''
  sourceStatus.textContent = (metadata
    ? `${metadata.width} × ${metadata.height}px · ${bytes(blob.size)} · EXIF 방향 ${metadata.orientation}`
    : `${bytes(blob.size)} · 크기·방향 확인이 필요해 기존 변환으로 비교합니다.`)
    + (acquisitionMs === null ? ' · 파일 선택' : ` · 사진 획득 ${milliseconds(acquisitionMs)}`)
  syncControls()
}

async function startCamera(): Promise<void> {
  busy = true
  syncControls()
  cameraStatus.textContent = '카메라를 준비하고 있습니다.'
  video.hidden = false
  try {
    cameraStartController = new AbortController()
    const started = await startCameraPreview(video, undefined, cameraStartController.signal)
    cameraStartController = null
    camera = started.stream
    cameraStatus.textContent = started.message
    if (!started.ok) video.hidden = true
  } catch (error) { cameraStatus.textContent = String(error) }
  finally { busy = false; syncControls() }
}
button('start').addEventListener('click', () => { void startCamera() })
button('stop').addEventListener('click', stopCamera)

async function takeSample(): Promise<void> {
  if (!camera) return
  busy = true
  syncControls()
  cameraStatus.textContent = '시험 사진을 촬영하고 있습니다.'
  try {
    const start = performance.now()
    const photo = await captureCameraPhotoBlob(camera, DEFAULT_CAPTURE_OPTIONS.maxLongEdge)
    acquisitionMs = performance.now() - start
    if (!photo) throw new Error('이 브라우저에서 정지사진을 가져오지 못했습니다. JPEG 파일 선택으로 비교해 주세요.')
    await setSource(photo)
    cameraStatus.textContent = '사진 준비 완료 · 비교 중에는 카메라를 중지합니다.'
  } catch (error) { cameraStatus.textContent = error instanceof Error ? error.message : String(error) }
  finally { busy = false; syncControls() }
}
button('sample').addEventListener('click', () => { void takeSample() })

async function selectFile(): Promise<void> {
  const file = fileInput.files?.[0]
  if (!file) return
  busy = true
  syncControls()
  try { acquisitionMs = null; await setSource(file) }
  catch (error) { sourceStatus.textContent = error instanceof Error ? error.message : String(error) }
  finally { fileInput.value = ''; busy = false; syncControls() }
}
fileInput.addEventListener('change', () => { void selectFile() })

function renderResults(report: BenchmarkResult): void {
  const modes: PreparationMode[] = ['reencode', 'original']
  const samples = modes.map((mode) => report.samples.filter((sample) => sample.mode === mode))
  const rows: [string, keyof BenchmarkSample, (value: number) => string][] = [
    ['사진 처리（디코딩·변환 포함）', 'processingMs', milliseconds],
    ['내부 저장（DB 연결·완료 대기 포함）', 'saveMs', milliseconds],
    ['ZIP 생성（DB 재조회·사진 1장·manifest 2개）', 'zipMs', milliseconds],
    ['전체（처리 시작 → ZIP 준비 완료）', 'totalMs', milliseconds],
    ['사진 파일 크기', 'photoBytes', bytes],
    ['ZIP 파일 크기', 'zipBytes', bytes],
  ]
  const baseline = median(samples[0].map((sample) => sample.totalMs))
  const original = median(samples[1].map((sample) => sample.totalMs))
  const change = baseline ? ((baseline - original) / baseline) * 100 : 0
  const reasons = [...new Set(samples[1].map((sample) => sample.fallbackReason).filter((reason) => reason !== null))]
  const usedOriginal = samples[1].every((sample) => sample.usedOriginal)
  resultsElement.innerHTML = `
    <h3>측정 결과 · 각 ${report.rounds}회 중앙값</h3>
    <p>원본 우선의 전체 시간이
      ${Math.abs(change).toFixed(1)}% ${change >= 0 ? '짧았습니다' : '길었습니다'}.</p>
    <p>${usedOriginal ? '원본 우선은 JPEG 재변환을 생략했습니다.' : escape(reasons.join(' / '))}</p>
    <div class="benchmark-table-scroll"><table>
      <thead><tr><th>항목</th><th>기존 변환</th><th>원본 우선</th></tr></thead>
      <tbody>${rows.map(([label, key, format]) => `<tr><th>${label}</th>${samples.map((group) => `<td>${format(median(group.map((sample) => sample[key] as number)))}</td>`).join('')}</tr>`).join('')}
      <tr><th>저장 해상도</th>${samples.map((group) => `<td>${group[0].width} × ${group[0].height}</td>`).join('')}</tr></tbody>
    </table></div>
    <p>사진 획득은 동일한 입력을 쓰기 위해 한 번만 수행합니다. 위 시간에는 촬영·다운로드·화면 갱신 시간이 포함되지 않습니다.
    실제 다음 촬영 버튼 간격과는 다릅니다. 사진 처리 시간과 전체 시간을 함께 비교하세요.</p>
    <h3>3. ZIP으로 사진 확인</h3>
    <p>각 ZIP은 마지막 측정의 사진 1장과 manifest.json·manifest.csv를 기존 앱과 같은 폴더 구조로 포함합니다.
    라벨 글자·바코드·방향을 비교해 주세요.</p>
    <div class="benchmark-actions">
      <button type="button" data-download="reencode">기존 방식 ZIP 저장</button>
      <button type="button" data-download="original">원본 우선 ZIP 저장</button>
      <button type="button" data-download="report">측정 결과 JSON 저장</button>
    </div>
  `
  resultsElement.querySelectorAll<HTMLButtonElement>('[data-download]').forEach((element) => {
    element.addEventListener('click', () => {
      const mode = element.dataset.download
      if (mode === 'report') {
        const { archives: _, ...data } = report
        downloadBlob(new Blob([JSON.stringify({ ...data, acquisitionMs, measurement: 'same JPEG; one warm-up per mode; alternating order; one-photo ZIP; excludes acquisition/download/UI' }, null, 2)], { type: 'application/json' }), 'capture-speed-comparison.json')
      } else {
        const archive = report.archives[mode as PreparationMode]
        downloadBlob(archive.blob, `speed-test-${mode}.zip`)
      }
    })
  })
}

async function runComparison(): Promise<void> {
  if (!source || busy) return
  busy = true
  stopCamera()
  resultsElement.innerHTML = ''
  syncControls()
  try {
    const result = await runCaptureBenchmark(source, 5, (message) => { progress.textContent = message })
    renderResults(result)
    progress.textContent = '비교 완료 · 시험 사진은 시험 저장소에서 삭제했습니다.'
  } catch (error) { progress.textContent = error instanceof Error ? error.message : String(error) }
  finally { busy = false; syncControls() }
}
button('run').addEventListener('click', () => { void runComparison() })

window.addEventListener('pagehide', () => { stopCamera(); if (sourceUrl) URL.revokeObjectURL(sourceUrl) })
