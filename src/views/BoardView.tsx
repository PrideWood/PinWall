import { CaptureUpdateAction, Excalidraw, serializeAsJSON } from '@excalidraw/excalidraw'
import '@excalidraw/excalidraw/index.css'
import { useCallback, useEffect, useRef, useState } from 'react'
import '../App.css'
import type { Session } from '@supabase/supabase-js'
import { getOwnerSession, onOwnerSessionChange } from '../lib/authRepository'
import {
  fetchBoardImageDataUrl,
  listBoardImages,
  uploadBoardImageData,
  type BoardImageRecord,
} from '../lib/boardImagesRepository'
import { createDefaultBoardScene, loadBoardScene, saveBoardScene } from '../lib/boardsRepository'
import type { BoardSceneSnapshot } from '../types/board'
import type { ExcalidrawElement, ExcalidrawImageElement, FileId } from '@excalidraw/excalidraw/element/types'
import type { BinaryFileData, BinaryFiles, ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types'

type SaveStatus = 'idle' | 'saving' | 'saved' | 'failed'
type UploadStatus = 'idle' | 'uploading' | 'ready' | 'failed'
type PendingSceneSave = {
  scene: BoardSceneSnapshot
  signature: string
}
type BoardImageMetadata = {
  storagePath: string
  publicUrl: string
}

const getSceneSignature = (scene: BoardSceneSnapshot) =>
  JSON.stringify({
    type: scene.type,
    version: scene.version,
    source: scene.source,
    elements: scene.elements,
    appState: scene.appState,
    files: scene.files,
  })

const createBoardSnapshot = (
  elements: BoardSceneSnapshot['elements'],
  appState: BoardSceneSnapshot['appState'],
  files: BoardSceneSnapshot['files'],
) => {
  const serializedScene = JSON.parse(serializeAsJSON(elements, appState, files, 'database')) as BoardSceneSnapshot
  const scene = {
    ...serializedScene,
    files: serializedScene.files ?? {},
    updated_at: new Date().toISOString(),
  }
  return {
    scene,
    signature: getSceneSignature(scene),
  }
}

const withSaveTimeout = <T,>(savePromise: Promise<T>) =>
  Promise.race<T>([
    savePromise,
    new Promise<T>((_, reject) => {
      window.setTimeout(() => reject(new Error('Board save timed out after 12 seconds.')), 12000)
    }),
  ])

const isImageElementWithFile = (element: ExcalidrawElement): element is ExcalidrawImageElement & { fileId: FileId } =>
  element.type === 'image' && Boolean(element.fileId)

const getBoardImageMetadata = (element: ExcalidrawElement): BoardImageMetadata | null => {
  const customData = element.customData

  if (!customData || typeof customData.storagePath !== 'string' || typeof customData.publicUrl !== 'string') {
    return null
  }

  return {
    storagePath: customData.storagePath,
    publicUrl: customData.publicUrl,
  }
}

const createRestoredImageFile = async (image: BoardImageRecord): Promise<BinaryFileData> => ({
  id: image.excalidraw_file_id as FileId,
  dataURL: await fetchBoardImageDataUrl(image),
  mimeType: image.mime_type as BinaryFileData['mimeType'],
  created: Date.parse(image.created_at) || Date.now(),
  lastRetrieved: Date.now(),
})

const restoreBoardImageFiles = async (scene: BoardSceneSnapshot, boardId: string) => {
  const boardImages = await listBoardImages(boardId)
  const imagesByFileId = new Map(boardImages.map((image) => [image.excalidraw_file_id, image]))
  const imageFileIdsInScene = new Set(
    scene.elements
      .filter((element): element is ExcalidrawImageElement & { fileId: FileId } =>
        isImageElementWithFile(element as ExcalidrawElement),
      )
      .map((element) => element.fileId),
  )
  const restoredFiles = await Promise.all(
    [...imageFileIdsInScene]
      .filter((fileId) => imagesByFileId.has(fileId))
      .map((fileId) => createRestoredImageFile(imagesByFileId.get(fileId)!)),
  )
  const files = restoredFiles.reduce<BinaryFiles>(
    (nextFiles, file) => ({
      ...nextFiles,
      [file.id]: file,
    }),
    { ...scene.files } as BinaryFiles,
  )
  const elements = scene.elements.map((element) => {
    const sceneElement = element as ExcalidrawElement

    if (!isImageElementWithFile(sceneElement)) {
      return element
    }

    const image = imagesByFileId.get(sceneElement.fileId)

    if (!image) {
      return element
    }

    return {
      ...sceneElement,
      link: sceneElement.link ?? image.public_url,
      customData: {
        ...sceneElement.customData,
        storagePath: image.storage_path,
        publicUrl: image.public_url,
      },
    }
  })

  return {
    scene: {
      ...scene,
      elements: elements as BoardSceneSnapshot['elements'],
      files,
    },
    boardImages,
  }
}

export function BoardView() {
  const [initialScene, setInitialScene] = useState<BoardSceneSnapshot | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const [uploadStatus, setUploadStatus] = useState<UploadStatus>('idle')
  const [uploadMessage, setUploadMessage] = useState<string | null>(null)
  const [ownerSession, setOwnerSession] = useState<Session | null>(null)
  const boardIdRef = useRef<string | null>(null)
  const ownerSessionRef = useRef<Session | null>(null)
  const excalidrawApiRef = useRef<ExcalidrawImperativeAPI | null>(null)
  const uploadedImageFileIdsRef = useRef<Set<string>>(new Set())
  const uploadingImageFileIdsRef = useRef<Set<string>>(new Set())
  const savedSceneSignatureRef = useRef<string | null>(null)
  const queuedSceneSignatureRef = useRef<string | null>(null)
  const pendingSceneRef = useRef<PendingSceneSave | null>(null)
  const saveTimerRef = useRef<number | null>(null)
  const savedStatusTimerRef = useRef<number | null>(null)
  const isMountedRef = useRef(true)

  const setBoardSaveStatus = useCallback((nextStatus: SaveStatus) => {
    if (savedStatusTimerRef.current) {
      window.clearTimeout(savedStatusTimerRef.current)
      savedStatusTimerRef.current = null
    }

    setSaveStatus(nextStatus)

    if (nextStatus === 'saved') {
      savedStatusTimerRef.current = window.setTimeout(() => {
        savedStatusTimerRef.current = null
        if (isMountedRef.current) {
          setSaveStatus((currentStatus) => (currentStatus === 'saved' ? 'idle' : currentStatus))
        }
      }, 1600)
    }
  }, [])

  const persistScene = useCallback(async ({ scene, signature }: PendingSceneSave) => {
    const boardId = boardIdRef.current

    if (!ownerSessionRef.current) {
      return
    }

    if (!boardId) {
      if (isMountedRef.current) {
        setBoardSaveStatus('failed')
      }
      return
    }

    if (isMountedRef.current) {
      setBoardSaveStatus('saving')
    }

    try {
      await withSaveTimeout(saveBoardScene(boardId, scene))
      savedSceneSignatureRef.current = signature
      queuedSceneSignatureRef.current = null
      if (isMountedRef.current) {
        setBoardSaveStatus('saved')
      }
    } catch {
      queuedSceneSignatureRef.current = null
      if (isMountedRef.current) {
        setBoardSaveStatus('failed')
      }
    }
  }, [setBoardSaveStatus])

  const queueSceneSave = useCallback(
    (nextSave: PendingSceneSave) => {
      pendingSceneRef.current = nextSave

      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current)
      }

      saveTimerRef.current = window.setTimeout(() => {
        const pendingSave = pendingSceneRef.current
        pendingSceneRef.current = null
        saveTimerRef.current = null

        if (pendingSave) {
          void persistScene(pendingSave)
        }
      }, 1500)
    },
    [persistScene],
  )

  const persistCurrentScene = useCallback(() => {
    const api = excalidrawApiRef.current

    if (!api || !ownerSessionRef.current) {
      return
    }

    const { scene, signature } = createBoardSnapshot(api.getSceneElements(), api.getAppState(), api.getFiles())
    queuedSceneSignatureRef.current = signature
    queueSceneSave({ scene, signature })
  }, [queueSceneSave])

  const attachImageMetadataToScene = useCallback(
    (fileId: FileId, metadata: BoardImageMetadata) => {
      const api = excalidrawApiRef.current

      if (!api) {
        return
      }

      const nextElements = api.getSceneElements().map((element) => {
        const sceneElement = element as ExcalidrawElement

        if (!isImageElementWithFile(sceneElement) || sceneElement.fileId !== fileId) {
          return element
        }

        return {
          ...sceneElement,
          customData: {
            ...sceneElement.customData,
            storagePath: metadata.storagePath,
            publicUrl: metadata.publicUrl,
          },
          link: metadata.publicUrl,
          updated: Date.now(),
          version: sceneElement.version + 1,
          versionNonce: Math.floor(Math.random() * 2_147_483_647),
        }
      })

      api.updateScene({
        elements: nextElements,
        captureUpdate: CaptureUpdateAction.EVENTUALLY,
      })
      persistCurrentScene()
    },
    [persistCurrentScene],
  )

  const persistNewImageFiles = useCallback(
    async (elements: readonly ExcalidrawElement[], files: BinaryFiles) => {
      const session = ownerSessionRef.current
      const boardId = boardIdRef.current

      if (!session || !boardId) {
        return
      }

      const imageElements = elements.filter(isImageElementWithFile)
      const newImageElements = imageElements.filter((element) => {
        const fileId = element.fileId

        return (
          !getBoardImageMetadata(element) &&
          !uploadedImageFileIdsRef.current.has(fileId) &&
          !uploadingImageFileIdsRef.current.has(fileId) &&
          Boolean(files[fileId]?.dataURL)
        )
      })

      if (newImageElements.length === 0) {
        return
      }

      setUploadStatus('uploading')
      setUploadMessage('Uploading board image...')

      for (const imageElement of newImageElements) {
        const fileId = imageElement.fileId
        const file = files[fileId]

        if (!file?.dataURL) {
          continue
        }

        uploadingImageFileIdsRef.current.add(fileId)

        try {
          const uploadedImage = await uploadBoardImageData({
            boardId,
            ownerId: session.user.id,
            excalidrawFileId: fileId,
            dataURL: file.dataURL,
            mimeType: file.mimeType,
          })

          uploadingImageFileIdsRef.current.delete(fileId)
          uploadedImageFileIdsRef.current.add(fileId)
          attachImageMetadataToScene(fileId, {
            storagePath: uploadedImage.storagePath,
            publicUrl: uploadedImage.publicUrl,
          })

          if (isMountedRef.current) {
            setUploadStatus('ready')
            setUploadMessage('Board image saved.')
            window.setTimeout(() => {
              if (isMountedRef.current) {
                setUploadStatus((currentStatus) => (currentStatus === 'ready' ? 'idle' : currentStatus))
                setUploadMessage((currentMessage) => (currentMessage === 'Board image saved.' ? null : currentMessage))
              }
            }, 2200)
          }
        } catch (error) {
          uploadingImageFileIdsRef.current.delete(fileId)
          if (isMountedRef.current) {
            setUploadStatus('failed')
            setUploadMessage(error instanceof Error ? error.message : 'Image upload failed.')
          }
        }
      }
    },
    [attachImageMetadataToScene],
  )

  useEffect(() => {
    isMountedRef.current = true

    getOwnerSession()
      .catch(() => null)
      .then((session) => {
        ownerSessionRef.current = session
        if (isMountedRef.current) {
          setOwnerSession(session)
        }

        return loadBoardScene().catch((error) => {
          if (session && error instanceof Error && error.message.includes('no boards row found')) {
            return createDefaultBoardScene(session.user.id)
          }

          throw error
        })
      })
      .then((loadedBoard) => {
        boardIdRef.current = loadedBoard.boardId
        return restoreBoardImageFiles(loadedBoard.scene, loadedBoard.boardId).then((restoredBoard) => ({
          ...loadedBoard,
          scene: restoredBoard.scene,
          boardImages: restoredBoard.boardImages,
        }))
      })
      .then((loadedBoard) => {
        if (isMountedRef.current) {
          uploadedImageFileIdsRef.current = new Set(loadedBoard.boardImages.map((image) => image.excalidraw_file_id))
          savedSceneSignatureRef.current = getSceneSignature(loadedBoard.scene)
          queuedSceneSignatureRef.current = null
          setInitialScene(loadedBoard.scene)
          setBoardSaveStatus(ownerSessionRef.current ? 'saved' : 'idle')
        }
      })
      .catch((error) => {
        if (isMountedRef.current) {
          setLoadError(error instanceof Error ? error.message : 'Could not load board scene.')
          setBoardSaveStatus('failed')
        }
      })

    return () => {
      isMountedRef.current = false

      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current)
        saveTimerRef.current = null
      }

      if (savedStatusTimerRef.current) {
        window.clearTimeout(savedStatusTimerRef.current)
        savedStatusTimerRef.current = null
      }

      const pendingSave = pendingSceneRef.current
      const boardId = boardIdRef.current
      pendingSceneRef.current = null

      if (pendingSave && boardId) {
        void saveBoardScene(boardId, pendingSave.scene).catch(() => undefined)
      }
    }
  }, [setBoardSaveStatus])

  useEffect(() => {
    try {
      return onOwnerSessionChange((session) => {
        ownerSessionRef.current = session
        setOwnerSession(session)

        if (!session) {
          setBoardSaveStatus('idle')
        } else if (initialScene) {
          setBoardSaveStatus('saved')
        }
      })
    } catch {
      window.setTimeout(() => {
        setLoadError('Could not watch owner session.')
      }, 0)
    }
  }, [initialScene, setBoardSaveStatus])

  const saveStatusLabel =
    saveStatus === 'saving' ? 'Saving...' : saveStatus === 'failed' ? 'Save failed' : saveStatus === 'saved' ? 'Saved' : ''
  const uploadStatusLabel =
    uploadStatus === 'uploading' ? 'Uploading...' : uploadStatus === 'failed' ? 'Upload failed' : uploadStatus === 'ready' ? 'Image added' : ''

  return (
    <main className="pinwall-shell board-shell">
      <section className="board-stage" aria-label="PinWall sketch board">
        {(uploadStatusLabel || uploadMessage) && (
          <div className="board-upload-panel">
            <div className={`board-upload-status is-${uploadStatus}`} role="status" aria-live="polite">
              <strong>{uploadStatusLabel}</strong>
              {uploadMessage && <span>{uploadMessage}</span>}
            </div>
          </div>
        )}

        {saveStatusLabel && (
          <div className={`board-save-status is-${saveStatus}`} role="status" aria-live="polite">
            {saveStatusLabel}
          </div>
        )}

        {loadError ? (
          <div className="board-message">
            <strong>Could not load the board.</strong>
            <span>{loadError}</span>
          </div>
        ) : initialScene ? (
          <Excalidraw
            excalidrawAPI={(api) => {
              excalidrawApiRef.current = api
            }}
            initialData={initialScene}
            viewModeEnabled={!ownerSession}
            onChange={(elements, appState, files) => {
              if (!ownerSessionRef.current) {
                return
              }

              void persistNewImageFiles(elements as readonly ExcalidrawElement[], files)

              const { scene: latestScene, signature } = createBoardSnapshot(elements, appState, files)

              if (signature === savedSceneSignatureRef.current || signature === queuedSceneSignatureRef.current) {
                return
              }

              queuedSceneSignatureRef.current = signature
              queueSceneSave({ scene: latestScene, signature })
            }}
          />
        ) : (
          <div className="board-message">Loading board...</div>
        )}
      </section>
    </main>
  )
}
