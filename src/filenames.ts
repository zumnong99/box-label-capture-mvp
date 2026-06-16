function padNumber(value: number, size: number): string {
  return String(value).padStart(size, '0')
}

export function getCartFolderName(cartNo: string): string {
  return `cart_${cartNo}`
}

export function getImageFilename(cartNo: string, boxNo: number): string {
  return `${getCartFolderName(cartNo)}_box_${padNumber(boxNo, 2)}.jpg`
}

export function getRelativeImagePath(cartNo: string, boxNo: number): string {
  return `${getCartFolderName(cartNo)}/${getImageFilename(cartNo, boxNo)}`
}

// 세션 ID(session_YYYYMMDD_001)는 순번이 고정이라 같은 날 두 번째 세션도
// 같은 이름이 된다. 내보낸 시각(HHMM)을 붙여 ZIP 끼리 구분되게 한다.
export function getZipFileName(sessionId: string, exportedAt: Date): string {
  const hours = padNumber(exportedAt.getHours(), 2)
  const minutes = padNumber(exportedAt.getMinutes(), 2)
  return `${sessionId}_${hours}${minutes}.zip`
}
