import { supabase } from './supabase'
import type { BoardRecord, BoardSceneSnapshot, LoadedBoardScene } from '../types/board'

export const defaultBoardSlug = 'main'
const boardSelectColumns = 'id,title,slug,scene_json,is_public,owner_id,created_at,updated_at'

const createEmptyBoardScene = (): BoardSceneSnapshot => ({
  type: 'excalidraw',
  version: 2,
  source: 'pinwall',
  elements: [],
  appState: {},
  files: {},
  updated_at: new Date().toISOString(),
})

const isSceneObject = (scene: unknown): scene is Partial<BoardSceneSnapshot> =>
  Boolean(scene && typeof scene === 'object' && !Array.isArray(scene))

const normalizeScene = (scene: unknown): BoardSceneSnapshot => {
  const emptyScene = createEmptyBoardScene()

  if (!isSceneObject(scene)) {
    return emptyScene
  }

  return {
    type: 'excalidraw',
    version: typeof scene.version === 'number' ? scene.version : emptyScene.version,
    source: 'pinwall',
    elements: Array.isArray(scene.elements) ? scene.elements : emptyScene.elements,
    appState: isSceneObject(scene.appState) ? (scene.appState as Record<string, unknown>) : emptyScene.appState,
    files: isSceneObject(scene.files) ? (scene.files as BoardSceneSnapshot['files']) : emptyScene.files,
    updated_at: typeof scene.updated_at === 'string' ? scene.updated_at : emptyScene.updated_at,
  }
}

export const loadBoardScene = async (slug = defaultBoardSlug): Promise<LoadedBoardScene> => {
  if (!supabase) {
    throw new Error('Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.')
  }

  const { data, error } = await supabase
    .from('boards')
    .select(boardSelectColumns)
    .eq('slug', slug)

  if (error) {
    throw new Error(`Could not load board scene: ${error.message}`)
  }

  if (!data || data.length === 0) {
    throw new Error(`Could not load board scene: no boards row found for slug "${slug}".`)
  }

  if (data.length > 1) {
    throw new Error(`Could not load board scene: expected one boards row for slug "${slug}", found ${data.length}.`)
  }

  const board = data[0] as BoardRecord

  return {
    boardId: board.id,
    slug: board.slug,
    scene: normalizeScene(board.scene_json),
  }
}

export const saveBoardScene = async (boardId: string, scene: BoardSceneSnapshot) => {
  if (!supabase) {
    throw new Error('Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.')
  }

  const nextScene: BoardSceneSnapshot = {
    ...scene,
    updated_at: new Date().toISOString(),
  }

  const payload = {
    scene_json: nextScene,
    updated_at: nextScene.updated_at,
  }

  const { data, error } = await supabase
    .from('boards')
    .update(payload, { count: 'exact' })
    .eq('id', boardId)
    .select(boardSelectColumns)

  if (error) {
    throw new Error(`Could not save board scene: ${error.message}`)
  }

  if (!data || data.length === 0) {
    throw new Error(`Could not save board scene: no boards row matched id "${boardId}". Check the loaded board id and boards update RLS policy.`)
  }

  if (data.length > 1) {
    throw new Error(`Could not save board scene: expected one boards row for id "${boardId}", found ${data.length}.`)
  }

  const board = data[0] as BoardRecord

  return {
    boardId: board.id,
    slug: board.slug,
    scene: normalizeScene(board.scene_json),
  } satisfies LoadedBoardScene
}

export const createDefaultBoardScene = async (ownerId: string, slug = defaultBoardSlug): Promise<LoadedBoardScene> => {
  if (!supabase) {
    throw new Error('Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.')
  }

  const scene = createEmptyBoardScene()

  const { data, error } = await supabase
    .from('boards')
    .insert(
      {
        title: 'Main board',
        slug,
        scene_json: scene,
        is_public: true,
        owner_id: ownerId,
        updated_at: scene.updated_at,
      },
    )
    .select(boardSelectColumns)

  if (error) {
    throw new Error(`Could not create board scene: ${error.message}`)
  }

  if (!data || data.length === 0) {
    throw new Error(`Could not create board scene: insert returned zero rows for slug "${slug}". Check boards insert RLS policy.`)
  }

  if (data.length > 1) {
    throw new Error(`Could not create board scene: expected one inserted boards row for slug "${slug}", found ${data.length}.`)
  }

  const board = data[0] as BoardRecord

  return {
    boardId: board.id,
    slug: board.slug,
    scene: normalizeScene(board.scene_json),
  }
}
