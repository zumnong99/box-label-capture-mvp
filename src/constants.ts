export const EXPECTED_BOX_COUNT = 8
export const LAYOUT_TYPE = '2x4'
export const DEFAULT_CART_NO = '001'
export const SESSION_SEQUENCE = 1
export const STORAGE_KEY = 'box-label-capture-mvp.session.v1'

export const BOX_ORDER = [
  { boxNo: 1, row: 1, col: 1 },
  { boxNo: 2, row: 1, col: 2 },
  { boxNo: 3, row: 2, col: 1 },
  { boxNo: 4, row: 2, col: 2 },
  { boxNo: 5, row: 3, col: 1 },
  { boxNo: 6, row: 3, col: 2 },
  { boxNo: 7, row: 4, col: 1 },
  { boxNo: 8, row: 4, col: 2 },
] as const
