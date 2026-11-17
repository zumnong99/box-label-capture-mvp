import assert from 'node:assert/strict'
import test from 'node:test'
import { loadModule } from './helpers.mjs'

const { buildManifest, buildManifestCsv } = await loadModule('manifest')
const { captureCurrentBox, createSession, moveToPreviousBox, retakeCurrentBox } = await loadModule('state')
const { buildPersistedPhotoRecord, createCapturedImageFromRecord } = await loadModule('indexed-photo-store')

const time = '2026-11-17T00:00:00.000Z'
const metadata = { imageWidth: 480, imageHeight: 640, imageSizeBytes: 1234, mimeType: 'image/jpeg', imageExifOrientation: 6 }

test('JSON·CSV는 표시 크기와 원본 EXIF 방향을 유지하고 기존 CSV 열 순서를 유지한다', () => {
  const session = captureCurrentBox(createSession(), time, metadata)
  const boxes = buildManifest(session, time).carts[0].boxes
  assert.equal(boxes[0].image_width, 480)
  assert.equal(boxes[0].image_height, 640)
  assert.equal(boxes[0].exif_orientation, 6)
  assert.equal(boxes[1].exif_orientation, null)
  const [header, row] = buildManifestCsv(session, time).split('\n')
  assert.equal(header.split(',')[13], 'exported_at')
  assert.equal(header.split(',')[14], 'exif_orientation')
  assert.equal(row.split(',').at(-1), '"6"')
})

test('이전 사진의 방향은 1로 해석하고 재촬영은 이전 회전 값을 덮어쓴다', () => {
  const normal = { ...metadata }
  delete normal.imageExifOrientation
  const legacy = captureCurrentBox(createSession(), time, normal)
  delete legacy.carts[0].boxes[0].imageExifOrientation
  assert.equal(buildManifest(legacy, time).carts[0].boxes[0].exif_orientation, 1)
  const rotated = captureCurrentBox(createSession(), time, metadata)
  const retaken = retakeCurrentBox(moveToPreviousBox(rotated), time, normal)
  assert.equal(buildManifest(retaken, time).carts[0].boxes[0].exif_orientation, 1)
})

test('IndexedDB 레코드 복원은 EXIF 방향과 파일 픽셀 크기를 보존한다', () => {
  const image = {
    blob: new Blob(['jpeg']), objectUrl: 'blob:test', mimeType: 'image/jpeg',
    width: 480, height: 640, originalWidth: 640, originalHeight: 480,
    sizeBytes: 4, capturedAt: time, exifOrientation: 6,
  }
  const record = buildPersistedPhotoRecord({ sessionId: 'session_test', cartNo: '001', boxNo: 1, image, retakeCount: 0 })
  const restored = createCapturedImageFromRecord(record)
  try {
    assert.equal(restored.exifOrientation, 6)
    assert.equal(restored.originalWidth, 640)
    assert.equal(restored.width, 480)
    assert.equal(restored.blob, image.blob)
  } finally { URL.revokeObjectURL(restored.objectUrl) }
  delete record.exifOrientation
  const legacy = createCapturedImageFromRecord(record)
  try { assert.equal(legacy.exifOrientation, 1) }
  finally { URL.revokeObjectURL(legacy.objectUrl) }
})
