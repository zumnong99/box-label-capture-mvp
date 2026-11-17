import assert from 'node:assert/strict'
import test from 'node:test'
import { loadModule } from './helpers.mjs'

const { readJpegMetadata } = await loadModule('jpeg-metadata')

function segment(marker, payload) {
  const length = payload.length + 2
  return [0xff, marker, length >> 8, length & 255, ...payload]
}

function exif(orientation, little = true) {
  const bytes = new Uint8Array(32)
  bytes.set([0x45, 0x78, 0x69, 0x66, 0, 0])
  const view = new DataView(bytes.buffer)
  view.setUint16(6, little ? 0x4949 : 0x4d4d)
  view.setUint16(8, 42, little)
  view.setUint32(10, 8, little)
  view.setUint16(14, 1, little)
  view.setUint16(16, 0x0112, little)
  view.setUint16(18, 3, little)
  view.setUint32(20, 1, little)
  view.setUint16(24, orientation, little)
  return bytes
}

function jpeg({ width = 4032, height = 3024, metadata = [], marker = 0xc0 } = {}) {
  return new Blob([new Uint8Array([
    0xff, 0xd8, ...metadata,
    ...segment(marker, [8, height >> 8, height & 255, width >> 8, width & 255, 1, 1, 0x11, 0]),
    ...segment(0xda, [1, 1, 0, 0, 63, 0]), 0, 0xff, 0xd9,
  ])], { type: 'image/jpeg' })
}

test('EXIF 없는 JPEG의 실제 픽셀 크기를 읽는다', async () => {
  assert.deepEqual(await readJpegMetadata(jpeg()), { width: 4032, height: 3024, orientation: 1 })
  assert.deepEqual(await readJpegMetadata(jpeg({ width: 3024, height: 4032, marker: 0xc2 })), { width: 3024, height: 4032, orientation: 1 })
})

test('두 바이트 순서에서 EXIF 회전과 반전을 감지한다', async () => {
  for (const little of [true, false]) {
    for (let orientation = 1; orientation <= 8; orientation++) {
      assert.equal((await readJpegMetadata(jpeg({ metadata: segment(0xe1, exif(orientation, little)) }))).orientation, orientation)
    }
  }
})

test('XMP APP1과 무관한 세그먼트가 있어도 JPEG 크기를 읽는다', async () => {
  const metadata = [...segment(0xe1, new TextEncoder().encode('http://ns.adobe.com/xap/1.0/')), ...segment(0xe0, [0, 1, 2])]
  assert.equal((await readJpegMetadata(jpeg({ metadata }))).width, 4032)
})

test('잘못된 EXIF, 잘린 JPEG, 다른 형식은 원본 저장에 사용하지 않는다', async () => {
  const invalidOffset = exif(1)
  new DataView(invalidOffset.buffer).setUint32(10, 0xffffffff, true)
  const inputs = [
    new Blob(['not a JPEG']), new Blob([new Uint8Array([0xff, 0xd8])]),
    jpeg({ metadata: segment(0xe1, invalidOffset) }), jpeg({ metadata: segment(0xe1, exif(9)) }),
    jpeg({ width: 0 }), jpeg().slice(0, 10),
  ]
  for (const blob of inputs) assert.equal(await readJpegMetadata(blob), null)
})

test('큰 헤더를 추측하지 않고 기존 변환에 맡긴다', async () => {
  const metadata = Array.from({ length: 5 }, () => segment(0xe2, new Uint8Array(65530))).flat()
  assert.equal(await readJpegMetadata(jpeg({ metadata })), null)
})
