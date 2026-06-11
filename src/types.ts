export type LayoutType = '2x4'
export type CaptureStatus = 'pending' | 'captured'

export interface LayoutPosition {
  row: number
  col: number
}

export interface BoxState {
  boxNo: number
  position: LayoutPosition
  status: CaptureStatus
  retakeCount: number
  capturedAt: string | null
  filePath: string
}

export interface CartState {
  cartNo: string
  expectedBoxCount: number
  layoutType: LayoutType
  currentBoxNo: number
  boxes: BoxState[]
  completedAt: string | null
}

export interface SessionState {
  sessionId: string
  createdAt: string
  activeCartNo: string
  carts: CartState[]
}
