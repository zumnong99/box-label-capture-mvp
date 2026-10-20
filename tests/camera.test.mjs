import assert from 'node:assert/strict'
import test from 'node:test'
import { loadModule, setGlobal } from './helpers.mjs'

const { startCameraPreview, getAvailableCameras } = await loadModule('camera')

function setup(t, getUserMedia) {
  const track = {
    stopped: false,
    getSettings: () => ({ width: 1920, height: 1080 }),
    stop() { this.stopped = true },
  }
  const stream = { getVideoTracks: () => [track], getTracks: () => [track] }
  const video = {
    videoWidth: 1920, videoHeight: 1080, srcObject: null,
    parentElement: { style: { setProperty() {} } },
    async play() {},
  }
  setGlobal(t, 'window', { isSecureContext: true, location: { hostname: 'localhost' } })
  setGlobal(t, 'navigator', { mediaDevices: { getUserMedia: getUserMedia ?? (async () => stream) } })
  return { track, stream, video }
}

test('해상도 협상이 실패해도 후면 카메라 우선을 유지한다', async (t) => {
  const requests = []
  const fixture = setup(t, async (constraints) => {
    requests.push(constraints)
    if (requests.length === 1) throw new DOMException('', 'OverconstrainedError')
    return fixture.stream
  })
  assert.equal((await startCameraPreview(fixture.video)).ok, true)
  assert.equal(requests.length, 2)
  assert.equal(requests[1].video.facingMode.ideal, 'environment')
  assert.equal(requests[1].video.width, undefined)
})

test('후면 요청이 모두 실패하면 기본 카메라로 촬영할 수 있다', async (t) => {
  const fixture = setup(t, async ({ video }) => {
    if (video !== true) throw new DOMException('', 'NotFoundError')
    return fixture.stream
  })
  assert.equal((await startCameraPreview(fixture.video)).ok, true)
})

test('수동 선택한 카메라가 없으면 다른 카메라로 조용히 바꾸지 않는다', async (t) => {
  const requests = []
  const { video } = setup(t, async (constraints) => {
    requests.push(constraints)
    throw new DOMException('', 'NotFoundError')
  })
  assert.equal((await startCameraPreview(video, 'rear-tele')).reason, 'not_found')
  assert.equal(requests.length, 2)
  assert.ok(requests.every(({ video }) => video.deviceId.exact === 'rear-tele'))
})

test('권한 거부는 추가 카메라 요청 없이 안내한다', async (t) => {
  let requests = 0
  const { video } = setup(t, async () => {
    requests++
    throw new DOMException('', 'NotAllowedError')
  })
  assert.equal((await startCameraPreview(video)).reason, 'permission_denied')
  assert.equal(requests, 1)
})

test('줌 최적화 실패가 연속 초점과 노출 설정을 막지 않는다', async (t) => {
  const { track, video } = setup(t)
  track.getCapabilities = () => ({
    zoom: { min: 1, max: 5 }, focusMode: ['continuous'], exposureMode: ['continuous'],
  })
  const settings = []
  track.applyConstraints = async ({ advanced }) => {
    settings.push(advanced[0])
    if ('zoom' in advanced[0]) throw new DOMException('', 'OverconstrainedError')
  }
  assert.equal((await startCameraPreview(video)).ok, true)
  assert.deepEqual(settings, [{ zoom: 1 }, { focusMode: 'continuous' }, { exposureMode: 'continuous' }])
})

test('미리보기 재생 실패 시 획득한 스트림을 해제한다', async (t) => {
  const { track, video } = setup(t)
  video.play = async () => { throw new DOMException('', 'NotAllowedError') }
  assert.equal((await startCameraPreview(video)).ok, false)
  assert.equal(track.stopped, true)
  assert.equal(video.srcObject, null)
})

test('취소 후 늦게 허용된 카메라는 재생하지 않고 해제한다', async (t) => {
  const controller = new AbortController()
  const fixture = setup(t, async () => {
    controller.abort()
    return fixture.stream
  })
  const result = await startCameraPreview(fixture.video, undefined, controller.signal)
  assert.equal(result.reason, 'cancelled')
  assert.equal(fixture.track.stopped, true)
  assert.equal(fixture.video.srcObject, null)
})

test('목록 조회 실패는 기본 카메라 사용을 막지 않는다', async (t) => {
  setup(t)
  navigator.mediaDevices.enumerateDevices = async () => { throw new Error('unavailable') }
  assert.deepEqual(await getAvailableCameras(), [])
})
