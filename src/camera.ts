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

const REAR_CAMERA_CONSTRAINTS: MediaStreamConstraints = {
  audio: false,
  video: {
    facingMode: { ideal: 'environment' },
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

async function playPreview(
  videoElement: HTMLVideoElement,
  stream: MediaStream,
): Promise<void> {
  videoElement.autoplay = true
  videoElement.muted = true
  videoElement.playsInline = true
  videoElement.srcObject = stream
  await videoElement.play()
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
      await playPreview(videoElement, stream)
    } catch (playError) {
      stopCameraPreview(stream)
      throw playError
    }

    return {
      ok: true,
      stream,
      message: '카메라 미리보기 실행 중',
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
        message: '카메라 미리보기 실행 중',
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
