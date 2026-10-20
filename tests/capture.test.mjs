import assert from 'node:assert/strict'
import test from 'node:test'
import { loadModule, setGlobal } from './helpers.mjs'

const { captureCameraImage } = await loadModule('capture')

function setup(t, width = 1080, height = 1920) {
  const draws = []
  const context = { drawImage: (...args) => draws.push(args) }
  const canvas = { getContext: () => context, toBlob: (done) => done(new Blob(['jpeg'], { type: 'image/jpeg' })) }
  const video = { videoWidth: width, videoHeight: height, readyState: 2 }
  const track = { readyState: 'live', getSettings: () => ({ width, height }) }
  const stream = { getVideoTracks: () => [track] }
  setGlobal(t, 'document', { createElement: () => canvas })
  setGlobal(t, 'ImageCapture', undefined)
  setGlobal(t, 'createImageBitmap', undefined)
  t.mock.method(console, 'warn', () => {})
  return { video, stream, canvas, draws, track }
}

async function capture(fixture, options) {
  const result = await captureCameraImage(fixture.video, fixture.stream, options)
  URL.revokeObjectURL(result.objectUrl)
  return result
}

test('정지사진/bitmap API 없이도 세로 영상 전체를 JPEG로 저장한다', async (t) => {
  const fixture = setup(t)
  const result = await capture(fixture)
  assert.equal(result.width, 1080)
  assert.equal(result.height, 1920)
  assert.equal(fixture.draws[0][0], fixture.video)
  assert.deepEqual(fixture.draws[0].slice(1), [0, 0, 1080, 1920])
  assert.equal(result.mimeType, 'image/jpeg')
  assert.equal(fixture.canvas.width, 0)
})

test('고해상도 영상은 가로세로 비율을 유지하며 축소한다', async (t) => {
  const fixture = setup(t, 7680, 4320)
  const result = await capture(fixture, { maxLongEdge: 4096, jpegQuality: 0.96 })
  assert.equal(result.width, 4096)
  assert.equal(result.height, 2304)
  assert.equal(result.originalWidth, 7680)
})

test('사진 기능 조회가 실패해도 기본 정지사진 촬영을 시도한다', async (t) => {
  const fixture = setup(t)
  let takes = 0
  let closed = false
  setGlobal(t, 'ImageCapture', class {
    async getPhotoCapabilities() { throw new Error('partial support') }
    async takePhoto(settings) { assert.equal(settings, undefined); takes++; return new Blob() }
  })
  setGlobal(t, 'createImageBitmap', async () => ({ width: 3024, height: 4032, close() { closed = true } }))
  const result = await capture(fixture)
  assert.equal(takes, 1)
  assert.equal(result.width, 3024)
  assert.equal(result.height, 4032)
  assert.equal(closed, true)
})

test('기기 고유 비율로 요청하고 사진 설정 거부 시 기본 촬영으로 재시도한다', async (t) => {
  const fixture = setup(t, 1920, 1080)
  const requests = []
  setGlobal(t, 'ImageCapture', class {
    async getPhotoCapabilities() {
      return { imageWidth: { min: 640, max: 3840, step: 1 }, imageHeight: { min: 480, max: 2160, step: 1 } }
    }
    async takePhoto(settings) {
      requests.push(settings)
      if (settings) throw new DOMException('', 'NotSupportedError')
      return new Blob()
    }
  })
  setGlobal(t, 'createImageBitmap', async () => ({ width: 3840, height: 2160, close() {} }))
  const result = await capture(fixture)
  assert.deepEqual(requests, [{ imageWidth: 3840, imageHeight: 2160 }, undefined])
  assert.equal(result.width / result.height, 16 / 9)
})

test('정지사진 촬영 실패 시 영상 프레임으로 복구한다', async (t) => {
  const fixture = setup(t)
  setGlobal(t, 'ImageCapture', class { async takePhoto() { throw new Error('camera rejected') } })
  setGlobal(t, 'createImageBitmap', async () => { throw new Error('should not decode') })
  const result = await capture(fixture)
  assert.equal(result.width, 1080)
  assert.equal(fixture.draws[0][0], fixture.video)
})

test('세로 미리보기에서도 사진 센서 방향에 맞는 해상도를 요청한다', async (t) => {
  const fixture = setup(t, 1080, 1920)
  let request
  setGlobal(t, 'ImageCapture', class {
    async getPhotoCapabilities() {
      return { imageWidth: { min: 640, max: 4000 }, imageHeight: { min: 480, max: 3000 } }
    }
    async takePhoto(settings) { request = settings; return new Blob() }
  })
  setGlobal(t, 'createImageBitmap', async () => ({ width: 3000, height: 4000, close() {} }))
  const result = await capture(fixture)
  assert.deepEqual(request, { imageWidth: 4000, imageHeight: 3000 })
  assert.equal(result.width, 3000)
  assert.equal(result.height, 4000)
})

test('JPEG 생성 실패 시에도 bitmap과 canvas 메모리를 해제한다', async (t) => {
  const fixture = setup(t)
  let closed = false
  setGlobal(t, 'ImageCapture', class { async takePhoto() { return new Blob() } })
  setGlobal(t, 'createImageBitmap', async () => ({ width: 2000, height: 1500, close() { closed = true } }))
  fixture.canvas.toBlob = (done) => done(null)
  await assert.rejects(capture(fixture), /JPEG Blob/)
  assert.equal(closed, true)
  assert.equal(fixture.canvas.width, 0)
  assert.equal(fixture.canvas.height, 0)
})

test('연결이 끊긴 카메라의 마지막 프레임은 저장하지 않는다', async (t) => {
  const fixture = setup(t)
  fixture.track.readyState = 'ended'
  await assert.rejects(capture(fixture), /카메라 연결/)
  assert.equal(fixture.draws.length, 0)
})
