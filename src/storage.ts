import { STORAGE_KEY } from './constants'
import { createSession } from './state'
import type { SessionState } from './types'

function isSessionState(value: unknown): value is SessionState {
  if (!value || typeof value !== 'object') {
    return false
  }

  const candidate = value as Partial<SessionState>
  return (
    typeof candidate.sessionId === 'string' &&
    typeof candidate.createdAt === 'string' &&
    typeof candidate.activeCartNo === 'string' &&
    Array.isArray(candidate.carts)
  )
}

export function loadStoredSession(): SessionState | null {
  const rawSession = localStorage.getItem(STORAGE_KEY)

  if (!rawSession) {
    return null
  }

  try {
    const parsedSession: unknown = JSON.parse(rawSession)
    return isSessionState(parsedSession) ? parsedSession : null
  } catch {
    return null
  }
}

export function loadSession(): SessionState {
  return loadStoredSession() ?? createSession()
}

export function saveSession(session: SessionState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session))
}

export function clearStoredSession(): void {
  localStorage.removeItem(STORAGE_KEY)
}
