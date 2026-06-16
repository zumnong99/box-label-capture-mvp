import './style.css'
import {
  isCameraSupported,
  isSecureContextForCamera,
  startCameraPreview,
  stopCameraPreview,
} from './camera'
import { captureVideoFrame } from './capture'
import {
  buildSessionZip,
  canShareFiles,
  collectExportSummary,
  downloadBlob,
  formatExportProgress,
  shareZipIfSupported,
  type ExportProgress,
  type ExportResult,
  type ExportSummary,
} from './export-zip'
import { getImageFilename } from './filenames'
import {
  buildPersistedPhotoRecord,
  deletePhotosForSession,
  getPhotosForSession,
  getStorageEstimate,
  isIndexedDbSupported,
  savePhoto,
} from './indexed-photo-store'
import {
  clearCapturedImages,
  getCapturedImage,
  getCapturedImageKey,
  setCapturedImage,
  setPersistedPhotoRecord,
} from './photo-store'
import {
  captureCurrentBox,
  createSession,
  getActiveCart,
  getCurrentBox,
  moveToNextCart,
  moveToNextBox,
  moveToPreviousBox,
  retakeCurrentBox,
} from './state'
import { buildManifest, buildManifestCsv } from './manifest'
import { clearStoredSession, loadSession, saveSession } from './storage'
import type { CapturedImage } from './capture'
import type { SessionState } from './types'

type ManifestPreviewMode = 'json' | 'csv'
type StatusTone = 'idle' | 'loading' | 'running' | 'warning' | 'error'

const appElement = document.querySelector<HTMLDivElement>('#app')
const APP_BUILD_LABEL = 'box-label-capture-mvp 0.0.0'

if (!appElement) {
  throw new Error('앱 루트 요소를 찾을 수 없습니다.')
}

const app = appElement

let session: SessionState = loadSession()
let exportPanelVisible = false
let manifestMode: ManifestPreviewMode = 'json'
let cameraStream: MediaStream | null = null
let cameraStatusMessage = '카메라 대기 중'
let cameraStatusTone: StatusTone = 'idle'
let cameraIsStarting = false
let captureStatusMessage = ''
let captureStatusTone: StatusTone = 'idle'
let photoStorageStatusMessage = isIndexedDbSupported()
  ? 'IndexedDB 저장소 확인 중'
  : '이 브라우저에서는 사진 영구 저장을 사용할 수 없습니다. 새로고침하면 사진이 사라질 수 있습니다.'
let photoStorageStatusTone: StatusTone = isIndexedDbSupported()
  ? 'loading'
  : 'warning'
let photoStorageEstimateMessage = ''
let photoStorageEstimate: { usage?: number; quota?: number } = {}
let diagnosticsPhotoCount: number | null = null
let photoRestoreCompleted = false
let exportSummary: ExportSummary | null = null
let exportResult: ExportResult | null = null
let exportProgress: ExportProgress | null = null
let exportIsBuilding = false
let exportStatusMessage = ''
let exportStatusTone: StatusTone = 'idle'

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function commitSession(nextSession: SessionState): void {
  session = nextSession
  saveSession(session)
  render()
}

function getManifestPreview(): string {
  const exportedAt = new Date().toISOString()

  if (manifestMode === 'csv') {
    return buildManifestCsv(session, exportedAt)
  }

  return JSON.stringify(buildManifest(session, exportedAt), null, 2)
}

function getCurrentImageKey(): string {
  const cart = getActiveCart(session)
  const box = getCurrentBox(session)
  return getCapturedImageKey(session.sessionId, cart.cartNo, box.boxNo)
}

function getImageMetadata(image: CapturedImage): {
  imageWidth: number
  imageHeight: number
  imageSizeBytes: number
  mimeType: 'image/jpeg'
} {
  return {
    imageWidth: image.width,
    imageHeight: image.height,
    imageSizeBytes: image.sizeBytes,
    mimeType: image.mimeType,
  }
}

function formatFileSize(sizeBytes: number): string {
  if (sizeBytes >= 1024 * 1024) {
    return `${(sizeBytes / 1024 / 1024).toFixed(2)} MB`
  }

  return `${Math.max(1, Math.round(sizeBytes / 1024))} KB`
}

function formatStorageEstimate(usage?: number, quota?: number): string {
  if (usage === undefined || quota === undefined) {
    return ''
  }

  return `저장소 사용량 약 ${formatFileSize(usage)} / ${formatFileSize(quota)}`
}

function formatYesNo(value: boolean): string {
  return value ? '예' : '아니오'
}

function formatDiagnosticValue(value: string | number | null): string {
  if (value === null || value === '') {
    return '확인 불가'
  }

  return String(value)
}

function isDownloadLinkSupported(): boolean {
  return 'download' in document.createElement('a')
}

function isWebShareSupported(): boolean {
  return typeof navigator.share === 'function'
}

function isFileShareSupported(): boolean {
  try {
    return canShareFiles(
      new File(['diagnostic'], 'diagnostic.txt', {
        type: 'text/plain',
      }),
    )
  } catch {
    return false
  }
}

function renderDiagnosticsPanel(): string {
  const cart = getActiveCart(session)
  const currentBox = getCurrentBox(session)
  const storageEstimateText = formatStorageEstimate(
    photoStorageEstimate.usage,
    photoStorageEstimate.quota,
  )
  const indexedPhotoCount =
    diagnosticsPhotoCount === null ? null : `${diagnosticsPhotoCount}개`

  return `
    <details class="diagnostics-panel">
      <summary>진단 정보</summary>
      <dl>
        <div>
          <dt>앱 빌드</dt>
          <dd>${APP_BUILD_LABEL}</dd>
        </div>
        <div>
          <dt>세션</dt>
          <dd>${escapeHtml(session.sessionId)}</dd>
        </div>
        <div>
          <dt>현재 위치</dt>
          <dd>카트 ${escapeHtml(cart.cartNo)} · 박스 ${currentBox.boxNo}</dd>
        </div>
        <div>
          <dt>보안 컨텍스트</dt>
          <dd>${formatYesNo(window.isSecureContext)}</dd>
        </div>
        <div>
          <dt>카메라 실행 가능</dt>
          <dd>${formatYesNo(isSecureContextForCamera() && isCameraSupported())}</dd>
        </div>
        <div>
          <dt>카메라 API</dt>
          <dd>${formatYesNo(isCameraSupported())}</dd>
        </div>
        <div>
          <dt>IndexedDB</dt>
          <dd>${formatYesNo(isIndexedDbSupported())}</dd>
        </div>
        <div>
          <dt>저장소 사용량</dt>
          <dd>${escapeHtml(formatDiagnosticValue(storageEstimateText))}</dd>
        </div>
        <div>
          <dt>세션 사진</dt>
          <dd>${escapeHtml(formatDiagnosticValue(indexedPhotoCount))}</dd>
        </div>
        <div>
          <dt>다운로드 링크</dt>
          <dd>${formatYesNo(isDownloadLinkSupported())}</dd>
        </div>
        <div>
          <dt>Web Share API</dt>
          <dd>${formatYesNo(isWebShareSupported())}</dd>
        </div>
        <div>
          <dt>파일 공유</dt>
          <dd>${formatYesNo(isFileShareSupported())}</dd>
        </div>
        <div>
          <dt>현재 URL</dt>
          <dd>${escapeHtml(window.location.href)}</dd>
        </div>
        <div>
          <dt>현재 pathname</dt>
          <dd>${escapeHtml(window.location.pathname)}</dd>
        </div>
        <div>
          <dt>Vite base</dt>
          <dd>${escapeHtml(import.meta.env.BASE_URL)}</dd>
        </div>
      </dl>
    </details>
  `
}

function getLargeExportWarning(summary: ExportSummary): string {
  const largePhotoCount = summary.photosAvailable >= 24
  const largePhotoSize = summary.totalPhotoSizeBytes >= 100 * 1024 * 1024

  if (!largePhotoCount && !largePhotoSize) {
    return ''
  }

  return '사진 수나 용량이 크면 iPhone에서 ZIP 생성이 느리거나 실패할 수 있습니다. 카트 수가 많으면 중간 내보내기를 권장합니다.'
}

function formatTimestamp(value: string | null): string {
  if (!value) {
    return '-'
  }

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return value
  }

  return date.toLocaleString('ko-KR', {
    dateStyle: 'short',
    timeStyle: 'medium',
  })
}

function getCaptureErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message
  }

  return '알 수 없는 촬영 오류가 발생했습니다'
}

function isBoxCapturedInState(cartNo: string, boxNo: number): boolean {
  const cart = session.carts.find((candidate) => candidate.cartNo === cartNo)
  const box = cart?.boxes.find((candidate) => candidate.boxNo === boxNo)
  return box?.status === 'captured'
}

function renderManifestPanel(): string {
  if (!exportPanelVisible) {
    return ''
  }

  const summary = exportSummary
  const progressText = exportProgress
    ? formatExportProgress(exportProgress)
    : exportStatusMessage || '사진 ZIP을 준비합니다.'
  const incompleteCarts =
    summary && summary.incompleteCartNos.length > 0
      ? summary.incompleteCartNos.join(', ')
      : '없음'
  const noPhotosWarning =
    summary && summary.photosAvailable === 0
      ? '<p class="export-warning">내보낼 사진이 없습니다.</p>'
      : ''
  const incompleteWarning =
    summary && summary.incompleteCartNos.length > 0
      ? '<p class="export-warning">미완료 카트가 있습니다. 그래도 내보낼 수 있습니다.</p>'
      : ''
  const largeExportWarning = summary ? getLargeExportWarning(summary) : ''
  const shareSupported = exportResult
    ? canShareFiles(
        new File([exportResult.blob], exportResult.fileName, {
          type: 'application/zip',
        }),
      )
    : false
  const packageSummary = summary
    ? `사진 ${summary.photosAvailable}개 + manifest.json + manifest.csv`
    : '사진 ZIP을 준비하는 중입니다.'

  return `
    <section class="manifest-panel" aria-label="사진 ZIP 내보내기">
      <div class="section-heading">
        <div>
          <h2>사진 ZIP 내보내기</h2>
          <p>${escapeHtml(packageSummary)}</p>
        </div>
      </div>
      <div class="export-status ${exportStatusTone}" role="status">
        <strong>${escapeHtml(progressText)}</strong>
      </div>
      ${
        exportResult || summary
          ? `
            <div class="export-filename">
              <span>ZIP 파일명</span>
              <strong>${escapeHtml(
                exportResult ? exportResult.fileName : summary!.zipFileName,
              )}</strong>
            </div>
          `
          : ''
      }
      ${
        summary
          ? `
            <dl class="export-summary">
              <div>
                <dt>카트 수</dt>
                <dd>${summary.totalCarts}</dd>
              </div>
              <div>
                <dt>예상 박스</dt>
                <dd>${summary.totalExpectedBoxes}</dd>
              </div>
              <div>
                <dt>촬영 완료</dt>
                <dd>${summary.totalCapturedBoxes}</dd>
              </div>
              <div>
                <dt>저장 사진</dt>
                <dd>${summary.photosAvailable}</dd>
              </div>
              <div>
                <dt>누락 사진</dt>
                <dd>${summary.missingPhotos}</dd>
              </div>
              <div>
                <dt>사진 용량</dt>
                <dd>${formatFileSize(summary.totalPhotoSizeBytes)}</dd>
              </div>
              <div>
                <dt>미완료 카트</dt>
                <dd>${escapeHtml(incompleteCarts)}</dd>
              </div>
            </dl>
          `
          : '<p class="export-empty">내보내기 요약을 계산하는 중입니다.</p>'
      }
      ${noPhotosWarning}
      ${incompleteWarning}
      ${
        largeExportWarning
          ? `<p class="export-warning">${largeExportWarning}</p>`
          : ''
      }
      ${
        exportResult
          ? `
            <div class="export-actions">
              <button type="button" data-action="download-zip">ZIP 다운로드</button>
              <button
                type="button"
                data-action="share-zip"
                ${shareSupported ? '' : 'disabled'}
              >
                ${
                  shareSupported
                    ? '공유로 보내기'
                    : '이 브라우저에서는 파일 공유를 지원하지 않습니다.'
                }
              </button>
            </div>
          `
          : ''
      }
      <details class="manifest-preview">
        <summary>manifest 미리보기</summary>
        <div class="segmented-control" aria-label="매니페스트 형식">
          <button
            class="${manifestMode === 'json' ? 'is-selected' : ''}"
            type="button"
            data-manifest-mode="json"
          >
            JSON
          </button>
          <button
            class="${manifestMode === 'csv' ? 'is-selected' : ''}"
            type="button"
            data-manifest-mode="csv"
          >
            CSV
          </button>
        </div>
        <pre>${escapeHtml(getManifestPreview())}</pre>
      </details>
    </section>
  `
}

function renderPhotoPreview(): string {
  const cart = getActiveCart(session)
  const currentBox = getCurrentBox(session)
  const image = getCapturedImage(getCurrentImageKey())
  const expectedFilename = getImageFilename(cart.cartNo, currentBox.boxNo)
  const missingRuntimePreview =
    photoRestoreCompleted && currentBox.status === 'captured' && image === null
  const pendingRestore =
    !photoRestoreCompleted && currentBox.status === 'captured' && image === null
  const storageState = image
    ? image.persisted
      ? '사진 저장됨 · IndexedDB 저장 완료'
      : '사진 임시 보관 중'
    : '사진 없음'

  const statusHtml = captureStatusMessage
    ? `<div class="capture-status ${captureStatusTone}" role="status">${escapeHtml(
        captureStatusMessage,
      )}</div>`
    : ''

  const previewBody = image
    ? `
      <div class="photo-preview-layout">
        <img
          class="photo-preview-image"
          src="${escapeHtml(image.objectUrl)}"
          alt="${currentBox.boxNo}번 박스 촬영 미리보기"
        />
        <div class="photo-save-state ${image.persisted ? 'saved' : 'warning'}">
          ${storageState}
        </div>
        <dl class="photo-metadata">
          <div>
            <dt>이미지 크기</dt>
            <dd>${image.width} × ${image.height}px</dd>
          </div>
          <div>
            <dt>파일 크기</dt>
            <dd>${formatFileSize(image.sizeBytes)}</dd>
          </div>
          <div>
            <dt>촬영 시각</dt>
            <dd>${formatTimestamp(image.capturedAt)}</dd>
          </div>
          <div>
            <dt>재촬영 횟수</dt>
            <dd>${currentBox.retakeCount}</dd>
          </div>
          <div>
            <dt>예상 파일명</dt>
            <dd>${expectedFilename}</dd>
          </div>
        </dl>
      </div>
    `
    : `
      <p class="photo-empty">아직 촬영된 사진이 없습니다.</p>
      ${
        missingRuntimePreview
          ? `<p class="photo-warning">촬영 상태는 남아 있지만 저장된 사진을 찾을 수 없습니다. 다시 촬영하세요.</p>`
          : ''
      }
      ${
        pendingRestore
          ? `<p class="photo-warning">저장된 사진을 확인하는 중입니다.</p>`
          : ''
      }
    `

  return `
    <section class="photo-section" aria-label="현재 박스 사진 미리보기">
      <div class="section-heading">
        <div>
          <h2>현재 박스 사진</h2>
          <p>${currentBox.boxNo}번 · ${expectedFilename}</p>
        </div>
      </div>
      <div class="storage-status ${photoStorageStatusTone}">
        <strong>${photoStorageStatusMessage}</strong>
        ${
          photoStorageEstimateMessage
            ? `<span>${photoStorageEstimateMessage}</span>`
            : ''
        }
      </div>
      ${statusHtml}
      ${previewBody}
    </section>
  `
}

function syncCameraVideo(): void {
  const videoElement =
    app.querySelector<HTMLVideoElement>('[data-camera-preview]')

  if (!videoElement) {
    return
  }

  videoElement.autoplay = true
  videoElement.muted = true
  videoElement.playsInline = true

  if (cameraStream && videoElement.srcObject !== cameraStream) {
    videoElement.srcObject = cameraStream
    videoElement.play().catch((error: unknown) => {
      console.error('Camera preview playback failed', error)
    })
  }
}

function stopActiveCamera(
  message = '카메라 대기 중',
  shouldRender = true,
): void {
  stopCameraPreview(cameraStream)
  cameraStream = null
  cameraIsStarting = false
  cameraStatusMessage = message
  cameraStatusTone = 'idle'

  if (shouldRender) {
    render()
  }
}

async function captureForCurrentBox(mode: 'capture' | 'retake'): Promise<void> {
  const cart = getActiveCart(session)
  const currentBox = getCurrentBox(session)
  const videoElement =
    app.querySelector<HTMLVideoElement>('[data-camera-preview]')

  if (!cameraStream || !videoElement) {
    captureStatusMessage =
      mode === 'retake'
        ? '재촬영하려면 카메라 미리보기를 먼저 시작하세요.'
        : '카메라 미리보기를 먼저 시작하세요.'
    captureStatusTone = 'error'
    render()
    return
  }

  try {
    const image = await captureVideoFrame(videoElement)
    const key = getCapturedImageKey(session.sessionId, cart.cartNo, currentBox.boxNo)
    const nextRetakeCount =
      mode === 'retake' && currentBox.status === 'captured'
        ? currentBox.retakeCount + 1
        : currentBox.retakeCount
    const record = buildPersistedPhotoRecord({
      sessionId: session.sessionId,
      cartNo: cart.cartNo,
      boxNo: currentBox.boxNo,
      image,
      retakeCount: nextRetakeCount,
    })

    let persisted = false

    try {
      if (!isIndexedDbSupported()) {
        throw new Error('IndexedDB를 사용할 수 없습니다')
      }

      await savePhoto(record)
      persisted = true
      setCapturedImage(key, image, { persisted: true })
      photoStorageStatusMessage = 'IndexedDB 저장 완료'
      photoStorageStatusTone = 'running'
      void refreshStorageEstimate()
    } catch (saveError) {
      console.error('Photo persistence failed', saveError)
      setCapturedImage(key, image, { persisted: false })
      photoStorageStatusMessage = '사진 저장에 실패했습니다'
      photoStorageStatusTone = 'warning'
    }

    captureStatusMessage =
      persisted
        ? mode === 'retake' && currentBox.status === 'captured'
          ? `${currentBox.boxNo}번 사진을 재촬영하고 저장했습니다.`
          : `${currentBox.boxNo}번 사진을 촬영하고 저장했습니다.`
        : '사진은 촬영되었지만 브라우저 저장에 실패했습니다. 새로고침하면 사라질 수 있습니다.'
    captureStatusTone = persisted ? 'running' : 'warning'

    const metadata = getImageMetadata(image)
    const nextSession =
      mode === 'retake' && currentBox.status === 'captured'
        ? retakeCurrentBox(session, image.capturedAt, metadata)
        : captureCurrentBox(session, image.capturedAt, metadata)

    commitSession(nextSession)

    if (persisted) {
      void refreshDiagnosticsPhotoCount()
    }
  } catch (error) {
    console.error('Image capture failed', error)
    captureStatusMessage = getCaptureErrorMessage(error)
    captureStatusTone = 'error'
    render()
  }
}

async function refreshStorageEstimate(): Promise<void> {
  try {
    const estimate = await getStorageEstimate()
    photoStorageEstimate = estimate
    photoStorageEstimateMessage = formatStorageEstimate(
      estimate.usage,
      estimate.quota,
    )
    render()
  } catch (error) {
    console.error('Storage estimate failed', error)
  }
}

async function refreshDiagnosticsPhotoCount(): Promise<void> {
  if (!isIndexedDbSupported()) {
    diagnosticsPhotoCount = null
    render()
    return
  }

  try {
    const records = await getPhotosForSession(session.sessionId)
    diagnosticsPhotoCount = records.length
    render()
  } catch (error) {
    console.error('Diagnostics photo count failed', error)
    diagnosticsPhotoCount = null
    render()
  }
}

async function restorePersistedPhotosForSession(): Promise<void> {
  if (!isIndexedDbSupported()) {
    diagnosticsPhotoCount = null
    photoRestoreCompleted = true
    render()
    return
  }

  try {
    const records = await getPhotosForSession(session.sessionId)

    records.forEach((record) => {
      setPersistedPhotoRecord(record)

      if (!isBoxCapturedInState(record.cartNo, record.boxNo)) {
        console.warn(
          'IndexedDB photo exists without captured local state',
          record.key,
        )
      }
    })

    diagnosticsPhotoCount = records.length
    photoRestoreCompleted = true
    photoStorageStatusMessage =
      records.length > 0
        ? `${records.length}개 사진을 IndexedDB에서 복원했습니다.`
        : 'IndexedDB 저장 준비 완료'
    photoStorageStatusTone = 'running'
    await refreshStorageEstimate()
    render()
  } catch (error) {
    console.error('Photo restore failed', error)
    diagnosticsPhotoCount = null
    photoRestoreCompleted = true
    photoStorageStatusMessage = '저장된 사진을 불러오지 못했습니다'
    photoStorageStatusTone = 'error'
    render()
  }
}

async function resetSession(): Promise<void> {
  if (!window.confirm('현재 임시 세션을 삭제하고 새 세션을 시작할까요?')) {
    return
  }

  const oldSessionId = session.sessionId

  if (isIndexedDbSupported()) {
    try {
      await deletePhotosForSession(oldSessionId)
      photoStorageStatusMessage = '이전 세션 사진을 삭제했습니다'
      photoStorageStatusTone = 'running'
    } catch (error) {
      console.error('Session photo cleanup failed', error)
      photoStorageStatusMessage = '이전 세션 사진 삭제에 실패했습니다'
      photoStorageStatusTone = 'warning'
    }
  }

  clearStoredSession()
  clearCapturedImages()
  exportPanelVisible = false
  manifestMode = 'json'
  captureStatusMessage = ''
  captureStatusTone = 'idle'
  exportSummary = null
  exportResult = null
  exportProgress = null
  exportIsBuilding = false
  exportStatusMessage = ''
  exportStatusTone = 'idle'
  photoRestoreCompleted = true
  diagnosticsPhotoCount = 0
  commitSession(createSession())
  void refreshStorageEstimate()
}

async function startSessionExport(): Promise<void> {
  if (exportIsBuilding) {
    return
  }

  exportPanelVisible = true
  exportIsBuilding = true
  exportResult = null
  exportProgress = {
    phase: 'collecting',
    percent: 0,
    message: '내보내기 요약을 계산하는 중입니다.',
  }
  exportStatusMessage = '내보내기 요약을 계산하는 중입니다.'
  exportStatusTone = 'loading'
  render()

  try {
    const summary = await collectExportSummary(session)
    exportSummary = summary

    if (summary.photosAvailable === 0) {
      exportIsBuilding = false
      exportProgress = null
      exportStatusMessage = '내보낼 사진이 없습니다.'
      exportStatusTone = 'warning'
      render()
      return
    }

    exportResult = await buildSessionZip(session, (progress) => {
      exportProgress = progress
      exportStatusMessage = progress.message
      exportStatusTone =
        progress.phase === 'ready'
          ? 'running'
          : progress.phase === 'error'
            ? 'error'
            : 'loading'
      render()
    })
    exportIsBuilding = false
    exportStatusMessage = 'ZIP 파일을 생성했습니다.'
    exportStatusTone = 'running'
    render()
  } catch (error) {
    console.error('Session ZIP export failed', error)
    exportIsBuilding = false
    exportStatusMessage =
      'ZIP 생성 중 오류가 발생했습니다. 세션을 나누어 내보내는 방식을 권장합니다.'
    exportStatusTone = 'error'
    render()
  }
}

function render(): void {
  const cart = getActiveCart(session)
  const currentBox = getCurrentBox(session)
  const capturedCount = cart.boxes.filter((box) => box.status === 'captured').length
  const currentStatus = currentBox.status === 'captured' ? '촬영 완료' : '촬영 대기'
  const hasCameraStream = cameraStream !== null
  // 카트별 진행과 별개로, 이 세션에서 IndexedDB에 실제 저장된 사진 수.
  // 촬영이 저장에 성공해야만 올라가므로 화면이 멈췄을 때 실제 촬영 여부 확인용.
  const sessionSavedPhotos =
    diagnosticsPhotoCount !== null ? `${diagnosticsPhotoCount}장` : '확인 중'

  app.innerHTML = `
    <main class="app-shell">
      <header class="session-header">
        <div>
          <p class="eyebrow">박스 라벨 촬영 관리</p>
          <h1>카트 ${cart.cartNo}</h1>
        </div>
        <div class="header-actions">
          <button class="quiet-button" type="button" data-action="reset">
            초기화
          </button>
          <button
            class="quiet-button"
            type="button"
            data-action="next-cart"
          >
            다음 카트
          </button>
        </div>
      </header>

      <section class="status-strip" aria-label="세션 상태">
        <div>
          <span>세션</span>
          <strong>${session.sessionId}</strong>
        </div>
        <div>
          <span>카트 번호</span>
          <strong>${cart.cartNo}</strong>
        </div>
        <div>
          <span>박스 진행</span>
          <strong>현재 ${currentBox.boxNo}번 · ${capturedCount}개 완료</strong>
        </div>
        <div>
          <span>이 세션 촬영</span>
          <strong>${escapeHtml(sessionSavedPhotos)}</strong>
        </div>
      </section>

      <section class="camera-panel" aria-label="카메라 미리보기">
        <div class="camera-preview-frame">
          <video
            class="camera-preview"
            data-camera-preview
            playsinline
            autoplay
            muted
          ></video>
          <div class="camera-empty ${hasCameraStream ? 'is-hidden' : ''}">
            카메라 미리보기
          </div>
          <div class="label-guide" aria-hidden="true"></div>
        </div>
        <div class="camera-status ${cameraStatusTone}" role="status">
          ${cameraStatusMessage}
        </div>
        <div class="camera-capture-bar">
          <button
            class="primary-action"
            type="button"
            data-action="capture"
            ${hasCameraStream ? '' : 'disabled'}
          >
            촬영
          </button>
          <button
            type="button"
            data-action="retake"
            ${hasCameraStream ? '' : 'disabled'}
          >
            재촬영
          </button>
        </div>
        <div class="camera-controls">
          <button
            type="button"
            data-action="camera-start"
            ${hasCameraStream || cameraIsStarting ? 'disabled' : ''}
          >
            카메라 시작
          </button>
          <button
            type="button"
            data-action="camera-stop"
            ${hasCameraStream ? '' : 'disabled'}
          >
            카메라 중지
          </button>
        </div>
        <p class="camera-instruction">라벨 전체가 정사각형 안에 들어오게 촬영</p>
      </section>

      <section class="action-panel" aria-label="촬영 조작">
        <div class="current-box-summary">
          ${currentBox.boxNo}번 ${currentStatus}
        </div>
        <button
          type="button"
          data-action="previous"
          ${currentBox.boxNo === 1 ? 'disabled' : ''}
        >
          이전 박스
        </button>
        <button
          type="button"
          data-action="next"
        >
          다음 박스
        </button>
        <button
          type="button"
          data-action="export"
          ${exportIsBuilding ? 'disabled' : ''}
        >
          사진 ZIP 만들기
        </button>
      </section>

      ${renderPhotoPreview()}

      ${renderManifestPanel()}

      ${renderDiagnosticsPanel()}
    </main>
  `

  bindEvents()
  syncCameraVideo()
}

function bindEvents(): void {
  app
    .querySelector('[data-action="camera-start"]')
    ?.addEventListener('click', async () => {
      const videoElement =
        app.querySelector<HTMLVideoElement>('[data-camera-preview]')

      if (!videoElement || cameraIsStarting || cameraStream) {
        return
      }

      cameraIsStarting = true
      cameraStatusMessage = '카메라 권한 요청 중'
      cameraStatusTone = 'loading'
      render()

      const activeVideoElement =
        app.querySelector<HTMLVideoElement>('[data-camera-preview]')

      if (!activeVideoElement) {
        cameraIsStarting = false
        cameraStatusMessage = '카메라 화면을 준비할 수 없습니다'
        cameraStatusTone = 'error'
        render()
        return
      }

      const result = await startCameraPreview(activeVideoElement)
      cameraIsStarting = false

      if (result.ok) {
        cameraStream = result.stream
        cameraStatusMessage = result.message
        cameraStatusTone = 'running'
      } else {
        cameraStream = null
        cameraStatusMessage = result.message
        cameraStatusTone = 'error'
      }

      render()
    })

  app.querySelector('[data-action="camera-stop"]')?.addEventListener('click', () => {
    stopActiveCamera()
  })

  app.querySelector('[data-action="capture"]')?.addEventListener('click', () => {
    void captureForCurrentBox('capture')
  })

  app.querySelector('[data-action="retake"]')?.addEventListener('click', () => {
    void captureForCurrentBox('retake')
  })

  app.querySelector('[data-action="previous"]')?.addEventListener('click', () => {
    commitSession(moveToPreviousBox(session))
  })

  app.querySelector('[data-action="next"]')?.addEventListener('click', () => {
    commitSession(moveToNextBox(session))
  })

  app
    .querySelector('[data-action="next-cart"]')
    ?.addEventListener('click', () => {
      commitSession(moveToNextCart(session))
    })

  app.querySelector('[data-action="export"]')?.addEventListener('click', () => {
    void startSessionExport()
  })

  app
    .querySelector('[data-action="download-zip"]')
    ?.addEventListener('click', () => {
      if (!exportResult) {
        return
      }

      try {
        downloadBlob(exportResult.blob, exportResult.fileName)
        exportStatusMessage = 'ZIP 다운로드를 시작했습니다.'
        exportStatusTone = 'running'
        render()
      } catch (error) {
        console.error('ZIP download failed', error)
        exportStatusMessage = 'ZIP 다운로드에 실패했습니다.'
        exportStatusTone = 'error'
        render()
      }
    })

  app.querySelector('[data-action="share-zip"]')?.addEventListener('click', () => {
    if (!exportResult) {
      return
    }

    void shareZipIfSupported(exportResult.blob, exportResult.fileName)
      .then((shared) => {
        exportStatusMessage = shared
          ? '공유를 완료했습니다.'
          : '이 브라우저에서는 파일 공유를 지원하지 않습니다.'
        exportStatusTone = shared ? 'running' : 'warning'
        render()
      })
      .catch((error: unknown) => {
        console.error('ZIP share failed', error)
        const errorName = error instanceof DOMException ? error.name : ''
        exportStatusMessage =
          errorName === 'AbortError'
            ? '공유가 취소되었습니다.'
            : 'ZIP 공유에 실패했습니다.'
        exportStatusTone = errorName === 'AbortError' ? 'warning' : 'error'
        render()
      })
  })

  app.querySelector('[data-action="reset"]')?.addEventListener('click', () => {
    void resetSession()
  })

  app
    .querySelectorAll<HTMLButtonElement>('[data-manifest-mode]')
    .forEach((button) => {
      button.addEventListener('click', () => {
        manifestMode = button.dataset.manifestMode === 'csv' ? 'csv' : 'json'
        render()
      })
    })
}

saveSession(session)
render()
void restorePersistedPhotosForSession()

window.addEventListener('beforeunload', () => {
  stopActiveCamera('카메라 대기 중', false)
  clearCapturedImages()
})
