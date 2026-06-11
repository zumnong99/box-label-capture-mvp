import type { CaptureStatus, SessionState } from './types'

export interface ManifestBox {
  box_no: number
  row: number
  col: number
  status: CaptureStatus
  retake_count: number
  file_path: string
  captured_at: string | null
}

export interface ManifestCart {
  cart_no: string
  expected_box_count: number
  layout_type: string
  completed_at: string | null
  boxes: ManifestBox[]
}

export interface SessionManifest {
  session_id: string
  created_at: string
  exported_at: string
  carts: ManifestCart[]
}

export function buildManifest(
  session: SessionState,
  exportedAt: string,
): SessionManifest {
  return {
    session_id: session.sessionId,
    created_at: session.createdAt,
    exported_at: exportedAt,
    carts: session.carts.map((cart) => ({
      cart_no: cart.cartNo,
      expected_box_count: cart.expectedBoxCount,
      layout_type: cart.layoutType,
      completed_at: cart.completedAt,
      boxes: cart.boxes.map((box) => ({
        box_no: box.boxNo,
        row: box.position.row,
        col: box.position.col,
        status: box.status,
        retake_count: box.retakeCount,
        file_path: box.filePath,
        captured_at: box.capturedAt,
      })),
    })),
  }
}

function escapeCsvValue(value: string | number | null): string {
  const text = value === null ? '' : String(value)
  return `"${text.replaceAll('"', '""')}"`
}

export function buildManifestCsv(
  session: SessionState,
  exportedAt: string,
): string {
  const columns = [
    'session_id',
    'cart_no',
    'box_no',
    'row',
    'col',
    'status',
    'retake_count',
    'file_path',
    'captured_at',
    'exported_at',
  ]

  const rows = session.carts.flatMap((cart) =>
    cart.boxes.map((box) =>
      [
        session.sessionId,
        cart.cartNo,
        box.boxNo,
        box.position.row,
        box.position.col,
        box.status,
        box.retakeCount,
        box.filePath,
        box.capturedAt,
        exportedAt,
      ].map(escapeCsvValue),
    ),
  )

  return [columns.join(','), ...rows.map((row) => row.join(','))].join('\n')
}
