import './style.css'
import { startCameraPreview, stopCameraPreview } from './camera'
import {
  captureCurrentBox,
  createSession,
  getActiveCart,
  getCurrentBox,
  isCartComplete,
  moveToBox,
  moveToNextBox,
  moveToPreviousBox,
  retakeCurrentBox,
} from './state'
import { buildManifest, buildManifestCsv } from './manifest'
import { clearStoredSession, loadSession, saveSession } from './storage'
import type { SessionState } from './types'

type ManifestPreviewMode = 'json' | 'csv'
type CameraStatusTone = 'idle' | 'loading' | 'running' | 'error'

const appElement = document.querySelector<HTMLDivElement>('#app')

if (!appElement) {
  throw new Error('앱 루트 요소를 찾을 수 없습니다.')
}

const app = appElement

let session: SessionState = loadSession()
let manifestVisible = false
let manifestMode: ManifestPreviewMode = 'json'
let cameraStream: MediaStream | null = null
let cameraStatusMessage = '카메라 대기 중'
let cameraStatusTone: CameraStatusTone = 'idle'
let cameraIsStarting = false

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

function renderBoxGrid(): string {
  const cart = getActiveCart(session)

  return cart.boxes
    .map((box) => {
      const isCurrent = box.boxNo === cart.currentBoxNo
      const isCaptured = box.status === 'captured'
      const classes = [
        'box-cell',
        isCurrent ? 'is-current' : '',
        isCaptured ? 'is-captured' : '',
      ]
        .filter(Boolean)
        .join(' ')

      return `
        <button
          class="${classes}"
          type="button"
          data-box-no="${box.boxNo}"
          aria-label="${box.boxNo}번 박스로 이동"
        >
          <span class="box-number">${box.boxNo}</span>
          <span class="box-marker">${isCaptured ? '✓' : isCurrent ? '현재' : ''}</span>
        </button>
      `
    })
    .join('')
}

function renderManifestPanel(): string {
  if (!manifestVisible) {
    return ''
  }

  return `
    <section class="manifest-panel" aria-label="매니페스트 미리보기">
      <div class="section-heading">
        <h2>매니페스트 미리보기</h2>
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
      </div>
      <pre>${escapeHtml(getManifestPreview())}</pre>
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

function render(): void {
  const cart = getActiveCart(session)
  const currentBox = getCurrentBox(session)
  const capturedCount = cart.boxes.filter((box) => box.status === 'captured').length
  const complete = isCartComplete(cart)
  const currentStatus = currentBox.status === 'captured' ? '촬영 완료' : '촬영 대기'
  const hasCameraStream = cameraStream !== null

  app.innerHTML = `
    <main class="app-shell">
      <header class="session-header">
        <div>
          <p class="eyebrow">박스 라벨 촬영 관리</p>
          <h1>카트 ${cart.cartNo}</h1>
        </div>
        <button class="quiet-button" type="button" data-action="reset">
          새 세션 시작
        </button>
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
          <strong>${currentBox.boxNo} / ${cart.expectedBoxCount}</strong>
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

      <section class="order-section" aria-label="촬영 순서">
        <div class="section-heading">
          <div>
            <h2>촬영 순서</h2>
            <p>${capturedCount}개 완료 · ${currentBox.boxNo}번 ${currentStatus}</p>
          </div>
          ${complete ? '<strong class="complete-badge">카트 완료</strong>' : ''}
        </div>
        <div class="box-grid">${renderBoxGrid()}</div>
      </section>

      <section class="action-panel" aria-label="촬영 조작">
        <button class="primary-action" type="button" data-action="capture">촬영</button>
        <button type="button" data-action="retake">재촬영</button>
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
          ${currentBox.boxNo === cart.expectedBoxCount ? 'disabled' : ''}
        >
          다음 박스
        </button>
        <button type="button" data-action="cart-complete">카트 완료</button>
        <button type="button" data-action="export">세션 내보내기</button>
      </section>

      ${renderManifestPanel()}
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
    const currentBox = getCurrentBox(session)

    if (
      currentBox.status === 'captured' &&
      !window.confirm('현재 박스는 이미 촬영되어 있습니다. 덮어쓸까요?')
    ) {
      return
    }

    commitSession(captureCurrentBox(session))
  })

  app.querySelector('[data-action="retake"]')?.addEventListener('click', () => {
    const currentBox = getCurrentBox(session)

    if (currentBox.status !== 'captured') {
      window.alert('촬영된 박스만 재촬영할 수 있습니다.')
      return
    }

    commitSession(retakeCurrentBox(session))
  })

  app.querySelector('[data-action="previous"]')?.addEventListener('click', () => {
    commitSession(moveToPreviousBox(session))
  })

  app.querySelector('[data-action="next"]')?.addEventListener('click', () => {
    commitSession(moveToNextBox(session))
  })

  app
    .querySelector('[data-action="cart-complete"]')
    ?.addEventListener('click', () => {
      window.alert(
        isCartComplete(getActiveCart(session))
          ? '카트 촬영이 완료되었습니다.'
          : '아직 촬영하지 않은 박스가 있습니다.',
      )
    })

  app.querySelector('[data-action="export"]')?.addEventListener('click', () => {
    manifestVisible = true
    render()
  })

  app.querySelector('[data-action="reset"]')?.addEventListener('click', () => {
    if (!window.confirm('현재 임시 세션을 삭제하고 새 세션을 시작할까요?')) {
      return
    }

    clearStoredSession()
    manifestVisible = false
    manifestMode = 'json'
    commitSession(createSession())
  })

  app.querySelectorAll<HTMLButtonElement>('[data-box-no]').forEach((button) => {
    button.addEventListener('click', () => {
      const boxNo = Number(button.dataset.boxNo)
      commitSession(moveToBox(session, boxNo))
    })
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

window.addEventListener('beforeunload', () => {
  stopActiveCamera('카메라 대기 중', false)
})

document.addEventListener('visibilitychange', () => {
  if (document.hidden && cameraStream) {
    stopActiveCamera('카메라 대기 중')
  }
})
