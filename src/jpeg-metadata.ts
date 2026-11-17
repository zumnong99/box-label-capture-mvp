export type JpegMetadata = { width: number; height: number; orientation: number }

function readOrientation(bytes: Uint8Array, start: number, end: number): number | null {
  const signature = [0x45, 0x78, 0x69, 0x66, 0, 0]
  if (!signature.every((value, index) => bytes[start + index] === value)) return 1
  const base = start + 6
  if (base + 8 > end) return null
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const order = view.getUint16(base)
  if (order !== 0x4949 && order !== 0x4d4d) return null
  const little = order === 0x4949
  if (view.getUint16(base + 2, little) !== 42) return null
  const directory = base + view.getUint32(base + 4, little)
  if (directory < base + 8 || directory + 2 > end) return null
  const entries = view.getUint16(directory, little)
  if (directory + 2 + entries * 12 > end) return null
  for (let index = 0; index < entries; index++) {
    const entry = directory + 2 + index * 12
    if (view.getUint16(entry, little) !== 0x0112) continue
    if (view.getUint16(entry + 2, little) !== 3 || view.getUint32(entry + 4, little) !== 1) return null
    const orientation = view.getUint16(entry + 8, little)
    return orientation >= 1 && orientation <= 8 ? orientation : null
  }
  return 1
}

// Read only the header. Unknown/truncated metadata must use the existing encoder.
export async function readJpegMetadata(blob: Blob): Promise<JpegMetadata | null> {
  const bytes = new Uint8Array(await blob.slice(0, 256 * 1024).arrayBuffer())
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return null
  let offset = 2
  let width = 0
  let height = 0
  let orientation = 1
  while (offset < bytes.length) {
    if (bytes[offset++] !== 0xff) return null
    while (bytes[offset] === 0xff) offset++
    const marker = bytes[offset++]
    if (marker === 0xda) return width && height ? { width, height, orientation } : null
    if (marker === 0xd9 || marker === undefined) return null
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue
    if (offset + 2 > bytes.length) return null
    const length = bytes[offset] * 256 + bytes[offset + 1]
    const end = offset + length
    if (length < 2 || end > bytes.length) return null
    if (marker === 0xe1) {
      const value = readOrientation(bytes, offset + 2, end)
      if (value === null) return null
      if (value !== 1) orientation = value
    }
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      if (length < 8) return null
      height = bytes[offset + 3] * 256 + bytes[offset + 4]
      width = bytes[offset + 5] * 256 + bytes[offset + 6]
    }
    offset = end
  }
  return null
}
