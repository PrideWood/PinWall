import type { ExcalidrawInitialDataState } from '@excalidraw/excalidraw/types'

export type BoardSceneSnapshot = {
  type: 'excalidraw'
  version: number
  source: 'pinwall'
  elements: NonNullable<ExcalidrawInitialDataState['elements']>
  appState: NonNullable<ExcalidrawInitialDataState['appState']>
  files: NonNullable<ExcalidrawInitialDataState['files']>
  updated_at: string
}

export type BoardRecord = {
  id: string
  title: string
  slug: string
  scene_json: BoardSceneSnapshot
  is_public: boolean
  owner_id: string | null
  created_at: string
  updated_at: string
}

export type LoadedBoardScene = {
  boardId: string
  slug: string
  scene: BoardSceneSnapshot
}
