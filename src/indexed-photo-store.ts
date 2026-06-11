import { createObjectUrl, type CapturedImage } from './capture'
import { getImageFilename, getRelativeImagePath } from './filenames'
import { getCapturedImageKey } from './photo-keys'

const DATABASE_NAME = 'box-label-capture-mvp'
const DATABASE_VERSION = 1
const PHOTO_STORE_NAME = 'photos'
const SESSION_INDEX_NAME = 'sessionId'

export type PersistedPhotoRecord = {
  key: string
  sessionId: string
  cartNo: string
  boxNo: number
  blob: Blob
  mimeType: 'image/jpeg'
  width: number
  height: number
  originalWidth: number
  originalHeight: number
  sizeBytes: number
  capturedAt: string
  retakeCount: number
  fileName: string
  relativePath: string
}

export type PersistedPhotoRecordInput = {
  sessionId: string
  cartNo: string
  boxNo: number
  image: CapturedImage
  retakeCount: number
}

export function isIndexedDbSupported(): boolean {
  return 'indexedDB' in window
}

export function buildPersistedPhotoRecord({
  sessionId,
  cartNo,
  boxNo,
  image,
  retakeCount,
}: PersistedPhotoRecordInput): PersistedPhotoRecord {
  return {
    key: getCapturedImageKey(sessionId, cartNo, boxNo),
    sessionId,
    cartNo,
    boxNo,
    blob: image.blob,
    mimeType: image.mimeType,
    width: image.width,
    height: image.height,
    originalWidth: image.originalWidth,
    originalHeight: image.originalHeight,
    sizeBytes: image.sizeBytes,
    capturedAt: image.capturedAt,
    retakeCount,
    fileName: getImageFilename(cartNo, boxNo),
    relativePath: getRelativeImagePath(cartNo, boxNo),
  }
}

export function createCapturedImageFromRecord(
  record: PersistedPhotoRecord,
): CapturedImage {
  return {
    blob: record.blob,
    objectUrl: createObjectUrl(record.blob),
    mimeType: record.mimeType,
    width: record.width,
    height: record.height,
    originalWidth: record.originalWidth,
    originalHeight: record.originalHeight,
    sizeBytes: record.sizeBytes,
    capturedAt: record.capturedAt,
  }
}

function openPhotoDatabase(): Promise<IDBDatabase> {
  if (!isIndexedDbSupported()) {
    return Promise.reject(new Error('IndexedDB를 사용할 수 없습니다'))
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION)

    request.onerror = () => {
      reject(new Error('사진 저장소를 열 수 없습니다'))
    }

    request.onblocked = () => {
      reject(new Error('사진 저장소가 다른 탭에서 사용 중입니다'))
    }

    request.onupgradeneeded = () => {
      const db = request.result

      if (!db.objectStoreNames.contains(PHOTO_STORE_NAME)) {
        const store = db.createObjectStore(PHOTO_STORE_NAME, {
          keyPath: 'key',
        })
        store.createIndex(SESSION_INDEX_NAME, SESSION_INDEX_NAME, {
          unique: false,
        })
      }
    }

    request.onsuccess = () => {
      resolve(request.result)
    }
  })
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onerror = () => {
      reject(request.error ?? new Error('IndexedDB 요청이 실패했습니다'))
    }

    request.onsuccess = () => {
      resolve(request.result)
    }
  })
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.onabort = () => {
      reject(transaction.error ?? new Error('IndexedDB 작업이 취소되었습니다'))
    }

    transaction.onerror = () => {
      reject(transaction.error ?? new Error('IndexedDB 작업이 실패했습니다'))
    }

    transaction.oncomplete = () => {
      resolve()
    }
  })
}

async function withPhotoStore<T>(
  mode: IDBTransactionMode,
  callback: (store: IDBObjectStore) => Promise<T>,
): Promise<T> {
  const db = await openPhotoDatabase()
  const transaction = db.transaction(PHOTO_STORE_NAME, mode)
  const store = transaction.objectStore(PHOTO_STORE_NAME)
  const done = transactionDone(transaction)

  try {
    const result = await callback(store)
    await done
    return result
  } catch (error) {
    try {
      await done
    } catch {
      // The original request error is clearer for callers.
    }
    throw error
  } finally {
    db.close()
  }
}

export async function savePhoto(record: PersistedPhotoRecord): Promise<void> {
  await withPhotoStore('readwrite', async (store) => {
    await requestToPromise(store.put(record))
  })
}

export async function getPhoto(
  key: string,
): Promise<PersistedPhotoRecord | null> {
  return withPhotoStore('readonly', async (store) => {
    const result = await requestToPromise<PersistedPhotoRecord | undefined>(
      store.get(key),
    )
    return result ?? null
  })
}

export async function getPhotosForSession(
  sessionId: string,
): Promise<PersistedPhotoRecord[]> {
  return withPhotoStore('readonly', async (store) => {
    const index = store.index(SESSION_INDEX_NAME)
    return requestToPromise<PersistedPhotoRecord[]>(
      index.getAll(IDBKeyRange.only(sessionId)),
    )
  })
}

export async function deletePhoto(key: string): Promise<void> {
  await withPhotoStore('readwrite', async (store) => {
    await requestToPromise(store.delete(key))
  })
}

export async function deletePhotosForSession(sessionId: string): Promise<void> {
  await withPhotoStore('readwrite', async (store) => {
    const index = store.index(SESSION_INDEX_NAME)

    await new Promise<void>((resolve, reject) => {
      const request = index.openCursor(IDBKeyRange.only(sessionId))

      request.onerror = () => {
        reject(request.error ?? new Error('사진 삭제 요청이 실패했습니다'))
      }

      request.onsuccess = () => {
        const cursor = request.result

        if (!cursor) {
          resolve()
          return
        }

        cursor.delete()
        cursor.continue()
      }
    })
  })
}

export async function clearAllPhotos(): Promise<void> {
  await withPhotoStore('readwrite', async (store) => {
    await requestToPromise(store.clear())
  })
}

export async function getStorageEstimate(): Promise<{
  usage?: number
  quota?: number
}> {
  if (!navigator.storage?.estimate) {
    return {}
  }

  const estimate = await navigator.storage.estimate()
  return {
    usage: estimate.usage,
    quota: estimate.quota,
  }
}

export async function requestPersistentStorage(): Promise<boolean | null> {
  if (!navigator.storage?.persist) {
    return null
  }

  return navigator.storage.persist()
}
