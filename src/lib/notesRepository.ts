import type { NoteDraft, PinNote } from '../types'
import { getMissingSupabaseEnvVars, hasSupabaseConfig, supabase } from './supabase'

type SupabaseNoteRow = Partial<Omit<PinNote, 'tags'>> & {
  id: string
  content: string | null
  tags: string | string[] | null
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

const toNotePayload = (note: NoteDraft | PinNote) => ({
  title: note.title?.trim() || null,
  content: note.content,
  tags: serializeTags(note.tags),
  x: note.x,
  y: note.y,
  z_index: note.z_index,
  rotation: note.rotation,
  width: note.width,
  height: note.height,
  color: note.color,
  is_public: note.is_public,
})

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

  const { data, error } = await supabase.from('notes').update(toNotePayload(note)).eq('id', note.id).select(selectColumns).single()

  if (error) {
    throw new Error(`Could not update this note. ${error.message}`)
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
