import type { NoteDraft, PinNote } from '../types'
import { getMissingSupabaseEnvVars, hasSupabaseConfig, supabase } from './supabase'

type SupabaseNoteRow = Partial<Omit<PinNote, 'tags'>> & {
  id: string
  content: string | null
  tags: string | string[] | null
}

type NotePositionPayload = {
  x: number
  y: number
  rotation: number
  z_index: number
  updated_at: string
}

const now = () => new Date().toISOString()
const fallbackColor = '#fff2a8'

export const requiredNoteColumns = [
  'id',
  'title',
  'content',
  'tags',
  'x',
  'y',
  'z_index',
  'rotation',
  'width',
  'height',
  'color',
  'is_public',
  'owner_id',
  'created_at',
  'updated_at',
] as const

const selectColumns = requiredNoteColumns.join(',')

const toFiniteNumber = (value: unknown, fallback: number) => {
  const parsed = Number(value)

  if (Number.isFinite(parsed)) {
    return parsed
  }

  return fallback
}

const parseTags = (tags: SupabaseNoteRow['tags']) => {
  if (Array.isArray(tags)) {
    return tags.map((tag) => tag.trim()).filter(Boolean)
  }

  if (!tags) {
    return []
  }

  return tags
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean)
}

const normalizeNote = (row: SupabaseNoteRow): PinNote => ({
  id: row.id,
  title: row.title ?? null,
  content: row.content ?? '',
  tags: parseTags(row.tags ?? null),
  x: toFiniteNumber(row.x, 120),
  y: toFiniteNumber(row.y, 120),
  z_index: toFiniteNumber(row.z_index, 1),
  rotation: toFiniteNumber(row.rotation, 0),
  width: toFiniteNumber(row.width, 260),
  height: toFiniteNumber(row.height, 220),
  color: row.color || fallbackColor,
  is_public: Boolean(row.is_public),
  owner_id: row.owner_id ?? null,
  created_at: row.created_at ?? now(),
  updated_at: row.updated_at ?? now(),
})

const serializeTags = (tags: string[]) => tags.map((tag) => tag.trim()).filter(Boolean).join(', ')

const toStrictNumber = (value: unknown, fieldName: string) => {
  const parsed = Number(value)

  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid note payload: ${fieldName} must be a finite number.`)
  }

  return parsed
}

const toInteger = (value: unknown, fieldName: string) => Math.round(toStrictNumber(value, fieldName))

const toNotePayload = (note: NoteDraft | PinNote) => ({
  title: note.title?.trim() || null,
  content: note.content,
  tags: serializeTags(note.tags),
  x: toInteger(note.x, 'x'),
  y: toInteger(note.y, 'y'),
  z_index: toInteger(note.z_index, 'z_index'),
  rotation: toStrictNumber(note.rotation, 'rotation'),
  width: toInteger(note.width, 'width'),
  height: toInteger(note.height, 'height'),
  color: note.color,
  is_public: note.is_public,
})

const toNotePositionPayload = (note: Pick<PinNote, 'x' | 'y' | 'rotation' | 'z_index'>): NotePositionPayload => ({
  x: toInteger(note.x, 'x'),
  y: toInteger(note.y, 'y'),
  rotation: toStrictNumber(note.rotation, 'rotation'),
  z_index: toInteger(note.z_index, 'z_index'),
  updated_at: now(),
})

const describeSupabaseError = (error: unknown) => {
  if (!error || typeof error !== 'object') {
    return String(error)
  }

  const supabaseError = error as {
    code?: string
    message?: string
    details?: string
    hint?: string
    name?: string
  }

  return JSON.stringify(
    {
      name: supabaseError.name,
      code: supabaseError.code,
      message: supabaseError.message,
      details: supabaseError.details,
      hint: supabaseError.hint,
    },
    null,
    2,
  )
}

const getMissingNoteColumns = async (client: NonNullable<typeof supabase>) => {
  const checks = await Promise.all(
    requiredNoteColumns.map(async (column) => {
      const { error } = await client.from('notes').select(column).limit(1)

      return error ? { column, error } : null
    }),
  )

  return checks.filter((check): check is NonNullable<typeof check> => Boolean(check))
}

const assertNotesSchema = async (client: NonNullable<typeof supabase>) => {
  const missingColumns = await getMissingNoteColumns(client)

  if (missingColumns.length === 0) {
    return
  }

  const missingColumnNames = missingColumns.map(({ column }) => column)
  const details = missingColumns.map(({ column, error }) => `${column}: ${error.message}`).join('; ')
  throw new Error(`Supabase notes schema mismatch. Missing or unreadable required columns: ${missingColumnNames.join(', ')}. ${details}`)
}

export async function loadNotes(): Promise<PinNote[]> {
  if (!hasSupabaseConfig || !supabase) {
    const error = new Error(`Missing ${getMissingSupabaseEnvVars().join(' and ')}.`)
    throw error
  }

  await assertNotesSchema(supabase)

  const { data, error } = await supabase.from('notes').select(selectColumns).eq('is_public', true).order('z_index')

  console.info('[PinWall notes] load result', {
    count: data?.length ?? 0,
    error,
  })

  if (error) {
    throw error
  }

  return ((data ?? []) as unknown as SupabaseNoteRow[]).map(normalizeNote)
}

export async function createNote(draft: NoteDraft, ownerId: string): Promise<PinNote> {
  if (!hasSupabaseConfig || !supabase) {
    throw new Error(`Missing ${getMissingSupabaseEnvVars().join(' and ')}.`)
  }

  const { data, error } = await supabase
    .from('notes')
    .insert({
      ...toNotePayload(draft),
      owner_id: ownerId,
    })
    .select(selectColumns)
    .single()

  if (error) {
    throw new Error(`Could not create this note. ${error.message}`)
  }

  return normalizeNote(data as unknown as SupabaseNoteRow)
}

export async function updateNote(note: PinNote): Promise<PinNote> {
  if (!hasSupabaseConfig || !supabase) {
    throw new Error(`Missing ${getMissingSupabaseEnvVars().join(' and ')}.`)
  }

  const payload = toNotePayload(note)
  const { data, error } = await supabase.from('notes').update(payload).eq('id', note.id).select(selectColumns).single()

  if (error) {
    throw new Error(`Could not update this note. ${error.message}`)
  }

  return normalizeNote(data as unknown as SupabaseNoteRow)
}

export async function updateNotePosition(note: PinNote): Promise<PinNote> {
  if (!hasSupabaseConfig || !supabase) {
    throw new Error(`Missing ${getMissingSupabaseEnvVars().join(' and ')}.`)
  }

  if (!note.id) {
    throw new Error('Could not update this note position. Missing note id.')
  }

  const payload = toNotePositionPayload(note)
  const query = {
    table: 'notes',
    match: { id: note.id },
    returning: selectColumns,
  }

  console.info('[PinWall notes] position update request', {
    id: note.id,
    query,
    payload,
  })

  const { data, error } = await supabase.from('notes').update(payload).eq('id', note.id).select(selectColumns).maybeSingle()

  console.info('[PinWall notes] position update result', {
    id: note.id,
    data,
    error,
  })

  if (error) {
    console.error('[PinWall notes] position update full error', error)
    throw new Error(`Could not update this note position. ${describeSupabaseError(error)}`)
  }

  if (!data) {
    throw new Error('Could not update this note position. Supabase returned no row for this note id. Check that the note id exists and that the current owner matches owner_id.')
  }

  return normalizeNote(data as unknown as SupabaseNoteRow)
}

export async function deleteNote(noteId: string): Promise<void> {
  if (!hasSupabaseConfig || !supabase) {
    throw new Error(`Missing ${getMissingSupabaseEnvVars().join(' and ')}.`)
  }

  const { error } = await supabase.from('notes').delete().eq('id', noteId)

  if (error) {
    throw new Error(`Could not delete this note. ${error.message}`)
  }
}
