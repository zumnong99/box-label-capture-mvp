export type CameraErrorReason =
  | 'unsupported'
  | 'insecure_context'
  | 'permission_denied'
  | 'not_found'
  | 'unreadable'
  | 'unknown'

export interface CameraStartSuccess {
  ok: true
  stream: MediaStream
  message: string
}

export interface CameraStartFailure {
  ok: false
  stream: null
  reason: CameraErrorReason
  message: string
}

export type CameraStartResult = CameraStartSuccess | CameraStartFailure

// ideal 은 협상 힌트라 높게 요청해도 안전: 기기가 지원하는 가장 가까운
// 프리셋으로 떨어진다 (예: 4032x3024 -> 3088x2320 -> 1920x1080).
// 4:3은 Fold8 광각 센서와 기존 iPhone 모두에서 고해상도 프리셋을 받기 좋다.
// 라벨 OCR 은 픽셀이 깡패: 1080p(2MP)는 라벨이 작게 찍히면 판독 한계선.
const REAR_CAMERA_CONSTRAINTS: MediaStreamConstraints = {
  audio: false,
  video: {
    facingMode: { ideal: 'environment' },
    width: { ideal: 4032 },
    height: { ideal: 3024 },
    aspectRatio: { ideal: 4 / 3 },
    frameRate: { ideal: 30, max: 30 },
  },
}

const FALLBACK_CAMERA_CONSTRAINTS: MediaStreamConstraints = {
  audio: false,
  video: true,
}

export function isCameraSupported(): boolean {
  return Boolean(navigator.mediaDevices?.getUserMedia)
}

export function isSecureContextForCamera(): boolean {
  const localHostnames = new Set(['localhost', '127.0.0.1', '::1'])
  return window.isSecureContext || localHostnames.has(window.location.hostname)
}

function getCameraFailure(error: unknown): CameraStartFailure {
  if (error instanceof DOMException) {
    if (error.name === 'NotAllowedError') {
      return {
        ok: false,
        stream: null,
        reason: 'permission_denied',
        message: '카메라 권한이 거부되었습니다',
      }
    }

    if (error.name === 'SecurityError') {
      return {
        ok: false,
        stream: null,
        reason: 'insecure_context',
        message:
          'HTTPS 또는 localhost 환경에서 실행해야 카메라를 사용할 수 있습니다',
      }
    }

    if (
      error.name === 'NotFoundError' ||
      error.name === 'DevicesNotFoundError'
    ) {
      return {
        ok: false,
        stream: null,
        reason: 'not_found',
        message: '사용할 수 있는 카메라를 찾을 수 없습니다',
      }
    }

    if (
      error.name === 'NotReadableError' ||
      error.name === 'TrackStartError' ||
      error.name === 'AbortError'
    ) {
      return {
        ok: false,
        stream: null,
        reason: 'unreadable',
        message: '카메라를 시작할 수 없습니다. 다른 앱에서 사용 중일 수 있습니다',
      }
    }
  }

  return {
    ok: false,
    stream: null,
    reason: 'unknown',
    message: '알 수 없는 카메라 오류가 발생했습니다',
  }
}

function shouldTryFallback(error: unknown): boolean {
  if (!(error instanceof DOMException)) {
    return true
  }

  return error.name !== 'NotAllowedError' && error.name !== 'SecurityError'
}

function describeStreamResolution(stream: MediaStream): string {
  const settings = stream.getVideoTracks()[0]?.getSettings()

  if (settings?.width && settings?.height) {
    return ` (${settings.width}×${settings.height})`
  }

  return ''
}

type FoldableCameraCapabilities = MediaTrackCapabilities & {
  zoom?: MediaSettingsRange
  focusMode?: string[]
  exposureMode?: string[]
}

type FoldableCameraConstraintSet = MediaTrackConstraintSet & {
  zoom?: number
  focusMode?: string
  exposureMode?: string
}

async function optimizeRearCamera(stream: MediaStream): Promise<void> {
  const track = stream.getVideoTracks()[0]

  if (!track?.getCapabilities) {
    return
  }

  try {
    const capabilities = track.getCapabilities() as FoldableCameraCapabilities
    const settings: FoldableCameraConstraintSet = {}

    // Fold8의 논리 후면 카메라는 0.5배 초광각과 1배 광각을 함께 노출할 수 있다.
    // 라벨 촬영은 왜곡과 가장자리 흐림이 적은 1배 광각을 우선한다.
    const minimumZoom = capabilities.zoom?.min
    const maximumZoom = capabilities.zoom?.max

    if (
      typeof minimumZoom === 'number' &&
      typeof maximumZoom === 'number' &&
      minimumZoom <= 1 &&
      maximumZoom >= 1
    ) {
      settings.zoom = 1
    }

    if (capabilities.focusMode?.includes('continuous')) {
      settings.focusMode = 'continuous'
    }

    if (capabilities.exposureMode?.includes('continuous')) {
      settings.exposureMode = 'continuous'
    }

    if (Object.keys(settings).length > 0) {
      await track.applyConstraints({
        advanced: [settings],
      } as MediaTrackConstraints)
    }
  } catch (error) {
    // 브라우저마다 지원 제약이 달라 실패해도 기본 후면 카메라는 유지한다.
    console.warn('Rear camera optimization was not applied', error)
  }
}

function syncPreviewAspectRatio(videoElement: HTMLVideoElement): void {
  const frame = videoElement.parentElement

  if (!frame || videoElement.videoWidth === 0 || videoElement.videoHeight === 0) {
    return
  }

  frame.style.setProperty(
    '--camera-stream-aspect',
    `${videoElement.videoWidth} / ${videoElement.videoHeight}`,
  )
}

async function playPreview(
  videoElement: HTMLVideoElement,
  stream: MediaStream,
): Promise<void> {
  videoElement.autoplay = true
  videoElement.muted = true
  videoElement.playsInline = true
  videoElement.onresize = () => syncPreviewAspectRatio(videoElement)
  videoElement.srcObject = stream
  await videoElement.play()
  syncPreviewAspectRatio(videoElement)
}

export async function startCameraPreview(
  videoElement: HTMLVideoElement,
): Promise<CameraStartResult> {
  if (!isSecureContextForCamera()) {
    return {
      ok: false,
      stream: null,
      reason: 'insecure_context',
      message:
        'HTTPS 또는 localhost 환경에서 실행해야 카메라를 사용할 수 있습니다',
    }
  }

  if (!isCameraSupported()) {
    return {
      ok: false,
      stream: null,
      reason: 'unsupported',
      message: '이 브라우저에서는 카메라를 사용할 수 없습니다',
    }
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia(
      REAR_CAMERA_CONSTRAINTS,
    )
    try {
      await optimizeRearCamera(stream)
      await playPreview(videoElement, stream)
    } catch (playError) {
      stopCameraPreview(stream)
      throw playError
    }

    return {
      ok: true,
      stream,
      message: `카메라 미리보기 실행 중${describeStreamResolution(stream)}`,
    }
  } catch (preferredError) {
    console.error('Rear camera preview failed', preferredError)

    if (!shouldTryFallback(preferredError)) {
      return getCameraFailure(preferredError)
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia(
        FALLBACK_CAMERA_CONSTRAINTS,
      )
      try {
        await playPreview(videoElement, stream)
      } catch (playError) {
        stopCameraPreview(stream)
        throw playError
      }

      return {
        ok: true,
        stream,
        message: `카메라 미리보기 실행 중${describeStreamResolution(stream)}`,
      }
    } catch (fallbackError) {
      console.error('Camera preview fallback failed', fallbackError)
      return getCameraFailure(fallbackError)
    }
  }
}

export function stopCameraPreview(stream: MediaStream | null): void {
  stream?.getTracks().forEach((track) => {
    track.stop()
  })
}
