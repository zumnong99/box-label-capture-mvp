export function getCapturedImageKey(
  sessionId: string,
  cartNo: string,
  boxNo: number,
): string {
  return `${sessionId}:${cartNo}:${boxNo}`
}
