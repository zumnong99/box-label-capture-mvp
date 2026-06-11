import {
  BOX_ORDER,
  DEFAULT_CART_NO,
  EXPECTED_BOX_COUNT,
  LAYOUT_TYPE,
  SESSION_SEQUENCE,
} from './constants'
import { getRelativeImagePath } from './filenames'
import type { BoxState, CartState, SessionState } from './types'

function padNumber(value: number, size: number): string {
  return String(value).padStart(size, '0')
}

function formatSessionDate(date: Date): string {
  const year = date.getFullYear()
  const month = padNumber(date.getMonth() + 1, 2)
  const day = padNumber(date.getDate(), 2)
  return `${year}${month}${day}`
}

export function createSessionId(
  date = new Date(),
  sequence = SESSION_SEQUENCE,
): string {
  return `session_${formatSessionDate(date)}_${padNumber(sequence, 3)}`
}

export function createBoxFilePath(cartNo: string, boxNo: number): string {
  return getRelativeImagePath(cartNo, boxNo)
}

export function createCart(cartNo = DEFAULT_CART_NO): CartState {
  const boxes: BoxState[] = BOX_ORDER.map((box) => ({
    boxNo: box.boxNo,
    position: {
      row: box.row,
      col: box.col,
    },
    status: 'pending',
    retakeCount: 0,
    capturedAt: null,
    filePath: createBoxFilePath(cartNo, box.boxNo),
    imageWidth: null,
    imageHeight: null,
    imageSizeBytes: null,
    mimeType: null,
  }))

  return {
    cartNo,
    expectedBoxCount: EXPECTED_BOX_COUNT,
    layoutType: LAYOUT_TYPE,
    currentBoxNo: 1,
    boxes,
    completedAt: null,
  }
}

function getCartSequence(cartNo: string): number {
  return Number.parseInt(cartNo, 10)
}

function formatCartNo(sequence: number): string {
  return padNumber(sequence, 3)
}

export function createSession(now = new Date()): SessionState {
  const cart = createCart()

  return {
    sessionId: createSessionId(now),
    createdAt: now.toISOString(),
    activeCartNo: cart.cartNo,
    carts: [cart],
  }
}

export function getActiveCart(session: SessionState): CartState {
  return (
    session.carts.find((cart) => cart.cartNo === session.activeCartNo) ??
    session.carts[0]
  )
}

export function getCurrentBox(session: SessionState): BoxState {
  const cart = getActiveCart(session)
  return (
    cart.boxes.find((box) => box.boxNo === cart.currentBoxNo) ?? cart.boxes[0]
  )
}

export function isCartComplete(cart: CartState): boolean {
  return cart.boxes.every((box) => box.status === 'captured')
}

export function getNextUncapturedBoxNo(
  cart: CartState,
  startAfter: number,
): number | null {
  const laterBox = cart.boxes.find(
    (box) => box.boxNo > startAfter && box.status !== 'captured',
  )

  if (laterBox) {
    return laterBox.boxNo
  }

  return cart.boxes.find((box) => box.status !== 'captured')?.boxNo ?? null
}

function updateActiveCart(
  session: SessionState,
  updater: (cart: CartState) => CartState,
): SessionState {
  const activeCart = getActiveCart(session)

  return {
    ...session,
    carts: session.carts.map((cart) =>
      cart.cartNo === activeCart.cartNo ? updater(cart) : cart,
    ),
  }
}

function withCompletion(cart: CartState, completedAt: string): CartState {
  return {
    ...cart,
    completedAt: isCartComplete(cart) ? cart.completedAt ?? completedAt : null,
  }
}

export function moveToBox(
  session: SessionState,
  boxNo: number,
): SessionState {
  return updateActiveCart(session, (cart) => {
    const exists = cart.boxes.some((box) => box.boxNo === boxNo)
    return exists ? { ...cart, currentBoxNo: boxNo } : cart
  })
}

export function moveToPreviousBox(session: SessionState): SessionState {
  const currentBoxNo = getActiveCart(session).currentBoxNo
  return moveToBox(session, Math.max(1, currentBoxNo - 1))
}

export function moveToNextBox(session: SessionState): SessionState {
  const currentBoxNo = getActiveCart(session).currentBoxNo
  return moveToBox(session, Math.min(EXPECTED_BOX_COUNT, currentBoxNo + 1))
}

export function moveToNextCart(session: SessionState): SessionState {
  const activeCart = getActiveCart(session)
  const nextCartSequence = getCartSequence(activeCart.cartNo) + 1
  const nextCartNo = formatCartNo(nextCartSequence)
  const existingCart = session.carts.find((cart) => cart.cartNo === nextCartNo)

  if (existingCart) {
    return {
      ...session,
      activeCartNo: existingCart.cartNo,
    }
  }

  return {
    ...session,
    activeCartNo: nextCartNo,
    carts: [...session.carts, createCart(nextCartNo)],
  }
}

export function captureCurrentBox(
  session: SessionState,
  capturedAt = new Date().toISOString(),
  imageMetadata?: {
    imageWidth: number
    imageHeight: number
    imageSizeBytes: number
    mimeType: 'image/jpeg'
  },
): SessionState {
  return updateActiveCart(session, (cart) => {
    const nextBoxes = cart.boxes.map((box) =>
      box.boxNo === cart.currentBoxNo
        ? {
            ...box,
            status: 'captured' as const,
            capturedAt,
            imageWidth: imageMetadata?.imageWidth ?? box.imageWidth ?? null,
            imageHeight: imageMetadata?.imageHeight ?? box.imageHeight ?? null,
            imageSizeBytes:
              imageMetadata?.imageSizeBytes ?? box.imageSizeBytes ?? null,
            mimeType: imageMetadata?.mimeType ?? box.mimeType ?? null,
          }
        : box,
    )

    const nextCart = {
      ...cart,
      boxes: nextBoxes,
    }

    const nextUncapturedBoxNo = getNextUncapturedBoxNo(
      nextCart,
      cart.currentBoxNo,
    )

    return withCompletion(
      {
        ...nextCart,
        currentBoxNo: nextUncapturedBoxNo ?? cart.currentBoxNo,
      },
      capturedAt,
    )
  })
}

export function retakeCurrentBox(
  session: SessionState,
  capturedAt = new Date().toISOString(),
  imageMetadata?: {
    imageWidth: number
    imageHeight: number
    imageSizeBytes: number
    mimeType: 'image/jpeg'
  },
): SessionState {
  return updateActiveCart(session, (cart) => {
    const nextBoxes = cart.boxes.map((box) =>
      box.boxNo === cart.currentBoxNo
        ? {
            ...box,
            status: 'captured' as const,
            retakeCount:
              box.status === 'captured' ? box.retakeCount + 1 : box.retakeCount,
            capturedAt,
            imageWidth: imageMetadata?.imageWidth ?? box.imageWidth ?? null,
            imageHeight: imageMetadata?.imageHeight ?? box.imageHeight ?? null,
            imageSizeBytes:
              imageMetadata?.imageSizeBytes ?? box.imageSizeBytes ?? null,
            mimeType: imageMetadata?.mimeType ?? box.mimeType ?? null,
          }
        : box,
    )

    return withCompletion(
      {
        ...cart,
        boxes: nextBoxes,
      },
      capturedAt,
    )
  })
}
