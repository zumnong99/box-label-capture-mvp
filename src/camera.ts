export type CameraErrorReason =
  | 'unsupported'
  | 'insecure_context'
  | 'permission_denied'
  | 'not_found'
  | 'unreadable'
  | 'cancelled'
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

function getCameraRequests(deviceId?: string): MediaStreamConstraints[] {
  const camera: MediaTrackConstraints = deviceId
    ? { deviceId: { exact: deviceId } }
    : { facingMode: { ideal: 'environment' } }

  // 해상도는 희망값만 요청하고, 실패하면 같은 카메라의 해상도 조건을 푼다.
  const requests: MediaStreamConstraints[] = [
    {
      audio: false,
      video: {
        ...camera,
        width: { ideal: 4096 },
        height: { ideal: 3072 },
        frameRate: { ideal: 30 },
      },
    },
    { audio: false, video: camera },
  ]

  // 직접 선택한 카메라가 없을 때만 브라우저 기본 카메라까지 허용한다.
  if (!deviceId) requests.push({ audio: false, video: true })
  return requests
}

export async function getAvailableCameras(): Promise<MediaDeviceInfo[]> {
  if (!navigator.mediaDevices?.enumerateDevices) return []

  try {
    const devices = await navigator.mediaDevices.enumerateDevices()
    return devices.filter((device) => device.kind === 'videoinput' && device.deviceId)
  } catch {
    // 목록 조회를 막는 브라우저에서도 기본 촬영은 계속 사용할 수 있다.
    return []
  }
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
        message: '카메라 권한을 허용한 뒤 다시 시작해 주세요. 앱 안에서 열었다면 Safari 또는 Chrome에서 직접 열어 주세요.',
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
      error.name === 'DevicesNotFoundError' ||
      error.name === 'OverconstrainedError'
    ) {
      return {
        ok: false,
        stream: null,
        reason: 'not_found',
        message: '사용할 수 있는 카메라를 찾지 못했습니다. 카메라 연결과 선택을 확인한 뒤 다시 시작해 주세요.',
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

type CameraCapabilities = MediaTrackCapabilities & {
  zoom?: MediaSettingsRange
  focusMode?: string[]
  exposureMode?: string[]
}

type CameraConstraintSet = MediaTrackConstraintSet & {
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
    const capabilities = track.getCapabilities() as CameraCapabilities
    const adjustments: CameraConstraintSet[] = []

    // 기기가 지원하는 경우에만 기본 배율과 연속 초점/노출을 적용한다.
    const minimumZoom = capabilities.zoom?.min
    const maximumZoom = capabilities.zoom?.max

    if (
      typeof minimumZoom === 'number' &&
      typeof maximumZoom === 'number' &&
      minimumZoom <= 1 &&
      maximumZoom >= 1
    ) {
      adjustments.push({ zoom: 1 })
    }

    if (capabilities.focusMode?.includes('continuous')) {
      adjustments.push({ focusMode: 'continuous' })
    }

    if (capabilities.exposureMode?.includes('continuous')) {
      adjustments.push({ exposureMode: 'continuous' })
    }

    for (const adjustment of adjustments) {
      try {
        await track.applyConstraints({ advanced: [adjustment] } as MediaTrackConstraints)
      } catch {
        // 한 기능을 거부해도 다른 최적화와 미리보기는 계속 진행한다.
      }
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
  const ratio = videoElement.videoWidth / videoElement.videoHeight
  frame.style.setProperty('--camera-stream-ratio', String(ratio))
  frame.style.setProperty('--camera-guide-width', `${70 * Math.min(1, 1 / ratio)}%`)
}

function checkCancellation(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException('Camera start cancelled', 'AbortError')
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
  deviceId?: string,
  signal?: AbortSignal,
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
      message: '이 브라우저에서는 카메라를 사용할 수 없습니다. Safari 또는 Chrome에서 직접 열어 주세요.',
    }
  }

  let lastError: unknown
  for (const constraints of getCameraRequests(deviceId)) {
    let stream: MediaStream | null = null
    try {
      checkCancellation(signal)
      stream = await navigator.mediaDevices.getUserMedia(constraints)
      checkCancellation(signal)
      await optimizeRearCamera(stream)
      checkCancellation(signal)
      await playPreview(videoElement, stream)
      checkCancellation(signal)
      return {
        ok: true,
        stream,
        message: `카메라 미리보기 실행 중${describeStreamResolution(stream)}`,
      }
    } catch (error) {
      stopCameraPreview(stream)
      if (videoElement.srcObject === stream) videoElement.srcObject = null
      if (signal?.aborted) {
        return { ok: false, stream: null, reason: 'cancelled', message: '카메라 시작을 취소했습니다.' }
      }
      lastError = error
      if (!shouldTryFallback(error)) break
    }
  }

  return getCameraFailure(lastError)
}

export function stopCameraPreview(stream: MediaStream | null): void {
  stream?.getTracks().forEach((track) => {
    track.stop()
  })
}
