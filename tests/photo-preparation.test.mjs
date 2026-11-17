import assert from 'node:assert/strict'
import test from 'node:test'
import { loadModule, setGlobal } from './helpers.mjs'

const { capturePhotoForStorage } = await loadModule('photo-preparation')

function jpeg(width, height, orientation = 1) {
  const exif = new Uint8Array(36)
  exif.set([0xff, 0xe1, 0, 34, 0x45, 0x78, 0x69, 0x66, 0, 0])
  const view = new DataView(exif.buffer)
  view.setUint16(10, 0x4949)
  view.setUint16(12, 42, true)
  view.setUint32(14, 8, true)
  view.setUint16(18, 1, true)
  view.setUint16(20, 0x0112, true)
  view.setUint16(22, 3, true)
  view.setUint32(24, 1, true)
  view.setUint16(28, orientation, true)
  return new Blob([new Uint8Array([0xff, 0xd8]), exif, new Uint8Array([
    0xff, 0xc0, 0, 11, 8, height >> 8, height & 255, width >> 8, width & 255, 1, 1, 0x11, 0,
    0xff, 0xda, 0, 8, 1, 1, 0, 0, 63, 0, 0, 0xff, 0xd9,
  ])], { type: 'image/jpeg' })
}

function setup(t, photo) {
  const draws = []
  const canvas = { getContext: () => ({ drawImage: (...args) => draws.push(args) }), toBlob: (done) => done(new Blob(['encoded'], { type: 'image/jpeg' })) }
  const video = { videoWidth: 1920, videoHeight: 1080, readyState: 2 }
  const track = { readyState: 'live' }
  const stream = { getVideoTracks: () => [track] }
  setGlobal(t, 'document', { createElement: () => canvas })
  setGlobal(t, 'ImageCapture', class { async takePhoto() { return photo } })
  t.mock.method(console, 'warn', () => {})
  return { draws, canvas, video, stream, track }
}

test('일반 촬영은 카메라 JPEG의 픽셀 크기와 바이트를 그대로 저장하고 디코딩하지 않는다', async (t) => {
  const photo = jpeg(4032, 3024)
  const fixture = setup(t, photo)
  setGlobal(t, 'createImageBitmap', () => { throw new Error('원본 저장에서 디코딩하면 안 됨') })
  const result = await capturePhotoForStorage(fixture.video, fixture.stream)
  try {
    assert.equal(result.usedOriginal, true)
    assert.equal(result.image.blob, photo)
    assert.deepEqual([result.image.width, result.image.height], [4032, 3024])
    assert.equal(result.image.sizeBytes, photo.size)
    assert.deepEqual(fixture.draws, [])
  } finally { URL.revokeObjectURL(result.image.objectUrl) }
})

test('EXIF 회전·반전 8가지는 JPEG를 재변환하지 않고 표시 크기와 함께 보존한다', async (t) => {
  setGlobal(t, 'createImageBitmap', () => { throw new Error('EXIF 원본 저장에서 디코딩하면 안 됨') })
  for (let orientation = 1; orientation <= 8; orientation++) {
    const photo = jpeg(640, 480, orientation)
    const fixture = setup(t, photo)
    const result = await capturePhotoForStorage(fixture.video, fixture.stream)
    try {
      assert.equal(result.usedOriginal, true)
      assert.equal(result.image.blob, photo)
      assert.equal(result.image.exifOrientation, orientation)
      assert.equal(result.fallbackReason, null)
      assert.deepEqual([result.image.width, result.image.height], orientation >= 5 ? [480, 640] : [640, 480])
      assert.deepEqual([result.image.originalWidth, result.image.originalHeight], [640, 480])
      assert.deepEqual(fixture.draws, [])
    } finally { URL.revokeObjectURL(result.image.objectUrl) }
  }
})

test('4096px 초과 정지사진은 기존 비율대로 축소한다', async (t) => {
  const fixture = setup(t, jpeg(4608, 3456))
  setGlobal(t, 'createImageBitmap', async () => ({ width: 4608, height: 3456, close() {} }))
  const result = await capturePhotoForStorage(fixture.video, fixture.stream)
  try {
    assert.equal(result.usedOriginal, false)
    assert.match(result.fallbackReason, /4096/)
    assert.deepEqual([result.image.width, result.image.height], [4096, 3072])
  } finally { URL.revokeObjectURL(result.image.objectUrl) }
})

test('정지사진 API가 없으면 현재 영상 프레임을 저장한다', async (t) => {
  const fixture = setup(t, null)
  setGlobal(t, 'ImageCapture', undefined)
  const result = await capturePhotoForStorage(fixture.video, fixture.stream)
  try {
    assert.equal(result.usedOriginal, false)
    assert.match(result.fallbackReason, /영상 프레임/)
    assert.equal(fixture.draws[0][0], fixture.video)
  } finally { URL.revokeObjectURL(result.image.objectUrl) }
})

test('정지사진 디코딩 실패는 영상으로 복구하지만 끊긴 영상은 저장하지 않는다', async (t) => {
  const fixture = setup(t, new Blob(['unreadable JPEG metadata']))
  setGlobal(t, 'createImageBitmap', async () => { throw new Error('decode failed') })
  const result = await capturePhotoForStorage(fixture.video, fixture.stream)
  try { assert.equal(fixture.draws[0][0], fixture.video) }
  finally { URL.revokeObjectURL(result.image.objectUrl) }
  fixture.track.readyState = 'ended'
  await assert.rejects(capturePhotoForStorage(fixture.video, fixture.stream), /연결이 끊겼습니다/)
})

test('큰 회전 사진을 축소한 결과는 EXIF 방향 1로 정규화된다', async (t) => {
  const fixture = setup(t, jpeg(4608, 3456, 6))
  let closed = false
  setGlobal(t, 'createImageBitmap', async () => ({ width: 3456, height: 4608, close() { closed = true } }))
  const result = await capturePhotoForStorage(fixture.video, fixture.stream)
  try {
    assert.equal(result.usedOriginal, false)
    assert.match(result.fallbackReason, /4096/)
    assert.deepEqual([result.image.width, result.image.height], [3072, 4096])
    assert.equal(result.image.exifOrientation, 1)
    assert.equal(closed, true)
  } finally { URL.revokeObjectURL(result.image.objectUrl) }
})
