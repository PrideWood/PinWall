import { Excalidraw, serializeAsJSON } from '@excalidraw/excalidraw'
import '@excalidraw/excalidraw/index.css'
import { useCallback, useEffect, useRef, useState } from 'react'
import '../App.css'
import type { Session } from '@supabase/supabase-js'
import { getOwnerSession, onOwnerSessionChange } from '../lib/authRepository'
import { createDefaultBoardScene, loadBoardScene, saveBoardScene } from '../lib/boardsRepository'
import type { BoardSceneSnapshot } from '../types/board'

type SaveStatus = 'idle' | 'saving' | 'saved' | 'failed'
type PendingSceneSave = {
  scene: BoardSceneSnapshot
  signature: string
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

export function BoardView() {
  const [initialScene, setInitialScene] = useState<BoardSceneSnapshot | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const [ownerSession, setOwnerSession] = useState<Session | null>(null)
  const boardIdRef = useRef<string | null>(null)
  const ownerSessionRef = useRef<Session | null>(null)
  const savedSceneSignatureRef = useRef<string | null>(null)
  const queuedSceneSignatureRef = useRef<string | null>(null)
  const pendingSceneRef = useRef<PendingSceneSave | null>(null)
  const saveTimerRef = useRef<number | null>(null)
  const isMountedRef = useRef(true)

  const persistScene = useCallback(async ({ scene, signature }: PendingSceneSave) => {
    const boardId = boardIdRef.current

    if (!ownerSessionRef.current) {
      return
    }

    if (!boardId) {
      if (isMountedRef.current) {
        setSaveStatus('failed')
      }
      return
    }

    if (isMountedRef.current) {
      setSaveStatus('saving')
    }

    try {
      await withSaveTimeout(saveBoardScene(boardId, scene))
      savedSceneSignatureRef.current = signature
      queuedSceneSignatureRef.current = null
      if (isMountedRef.current) {
        setSaveStatus('saved')
      }
    } catch {
      queuedSceneSignatureRef.current = null
      if (isMountedRef.current) {
        setSaveStatus('failed')
      }
    }
  }, [])

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
        if (isMountedRef.current) {
          boardIdRef.current = loadedBoard.boardId
          savedSceneSignatureRef.current = getSceneSignature(loadedBoard.scene)
          queuedSceneSignatureRef.current = null
          setInitialScene(loadedBoard.scene)
          setSaveStatus(ownerSessionRef.current ? 'saved' : 'idle')
        }
      })
      .catch((error) => {
        if (isMountedRef.current) {
          setLoadError(error instanceof Error ? error.message : 'Could not load board scene.')
          setSaveStatus('failed')
        }
      })

    return () => {
      isMountedRef.current = false

      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current)
        saveTimerRef.current = null
      }

      const pendingSave = pendingSceneRef.current
      const boardId = boardIdRef.current
      pendingSceneRef.current = null

      if (pendingSave && boardId) {
        void saveBoardScene(boardId, pendingSave.scene).catch(() => undefined)
      }
    }
  }, [])

  useEffect(() => {
    try {
      return onOwnerSessionChange((session) => {
        ownerSessionRef.current = session
        setOwnerSession(session)

        if (!session) {
          setSaveStatus('idle')
        } else if (initialScene) {
          setSaveStatus('saved')
        }
      })
    } catch {
      window.setTimeout(() => {
        setLoadError('Could not watch owner session.')
      }, 0)
    }
  }, [initialScene])

  const saveStatusLabel =
    saveStatus === 'saving' ? 'Saving...' : saveStatus === 'failed' ? 'Save failed' : saveStatus === 'saved' ? 'Saved' : ''

  return (
    <main className="pinwall-shell board-shell">
      <section className="board-stage" aria-label="PinWall sketch board">
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
            initialData={initialScene}
            viewModeEnabled={!ownerSession}
            onChange={(elements, appState, files) => {
              if (!ownerSessionRef.current) {
                return
              }

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
