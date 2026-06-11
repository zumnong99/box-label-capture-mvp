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
