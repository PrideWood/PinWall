export type NoteColor = '#fff2a8' | '#ffd1dc' | '#cdf2ca' | '#cde7ff' | '#f5d6ff'

export type PinNote = {
  id: string
  title: string | null
  content: string
  tags: string[]
  x: number
  y: number
  z_index: number
  rotation: number
  width: number
  height: number
  color: NoteColor | string
  is_public: boolean
  owner_id: string | null
  created_at: string
  updated_at: string
}

export type NoteDraft = Omit<PinNote, 'id' | 'owner_id' | 'created_at' | 'updated_at'>

export type DragState =
  | {
      type: 'note'
      noteId: string
      pointerId: number
      startClientX: number
      startClientY: number
      startX: number
      startY: number
    }
  | {
      type: 'wall'
      pointerId: number
      startClientX: number
      startClientY: number
      startOffsetX: number
      startOffsetY: number
    }
