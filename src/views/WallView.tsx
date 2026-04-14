import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import ReactMarkdown from 'react-markdown'
import rehypeSanitize from 'rehype-sanitize'
import remarkGfm from 'remark-gfm'
import { BringToFront, RotateCcwSquare, RotateCwSquare, Search, SquarePen, X } from 'lucide-react'
import '../App.css'
import type { Session } from '@supabase/supabase-js'
import { signInOwner } from '../lib/authRepository'
import { createNote, deleteNote, loadNotes, updateNote, updateNotePosition } from '../lib/notesRepository'
import type { DragState, NoteDraft, PinNote } from '../types'

const minimumWallSize = { width: 2200, height: 1400 }
const wallPadding = { x: 720, y: 480 }
const dragThreshold = 6
const noteColors = ['#fff2a8', '#ffd1dc', '#cdf2ca', '#cde7ff', '#f5d6ff']
const ownerLoginEmail = 'boquanchai@gmail.com'
const emptyDraft = (zIndex: number): NoteDraft => ({
  title: '',
  content: '',
  tags: [],
  x: 170 + Math.round(Math.random() * 360),
  y: 130 + Math.round(Math.random() * 260),
  z_index: zIndex,
  rotation: Math.round(Math.random() * 10) - 5,
  width: 260,
  height: 220,
  color: noteColors[Math.floor(Math.random() * noteColors.length)],
  is_public: true,
})

const notePreview = (content: string) => content.replace(/[#*_`>\-[\]()]/g, '').slice(0, 150)

const noteToDraft = (note: PinNote): NoteDraft => ({
  title: note.title ?? '',
  content: note.content,
  tags: note.tags,
  x: note.x,
  y: note.y,
  z_index: note.z_index,
  rotation: note.rotation,
  width: note.width,
  height: note.height,
  color: note.color,
  is_public: note.is_public,
})

const matchesSearch = (note: PinNote, query: string) => {
  const normalized = query.trim().toLowerCase()
  if (!normalized) return true

  return [note.title ?? '', note.content, note.tags.join(' ')]
    .join(' ')
    .toLowerCase()
    .includes(normalized)
}

type WallViewProps = {
  authNotice: string
  ownerSession: Session | null
  shouldOpenLogin: boolean
  onAuthNotice: (notice: string) => void
  onForgotPassword: () => void
  onLoginRequestHandled: () => void
  onOwnerSessionChange: (session: Session | null) => void
}

export function WallView({ authNotice, ownerSession, shouldOpenLogin, onAuthNotice, onForgotPassword, onLoginRequestHandled, onOwnerSessionChange }: WallViewProps) {
  const wallRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const dragMovedRef = useRef(false)
  const dragStartNoteRef = useRef<PinNote | null>(null)
  const suppressNextClickRef = useRef(false)
  const [notes, setNotes] = useState<PinNote[]>([])
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [draft, setDraft] = useState<NoteDraft | null>(null)
  const [query, setQuery] = useState('')
  const [isLoginOpen, setIsLoginOpen] = useState(false)
  const [ownerPassword, setOwnerPassword] = useState('')
  const [isAuthBusy, setIsAuthBusy] = useState(false)
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false)
  const [isSearchFocused, setIsSearchFocused] = useState(false)
  const [notice, setNotice] = useState('Loading the wall...')
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [dragState, setDragState] = useState<DragState | null>(null)
  const [wallOffset, setWallOffset] = useState({ x: 0, y: 0 })
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 })

  const selectedNote = notes.find((note) => note.id === selectedNoteId) ?? null
  const isAdmin = Boolean(ownerSession)
  const modalDraft = draft ?? (selectedNote ? noteToDraft(selectedNote) : null)
  const matchingNotes = useMemo(() => notes.filter((note) => matchesSearch(note, query)), [notes, query])
  const hasQuery = query.trim().length > 0
  const showEmptyState = !isLoading && !loadError && notes.length === 0
  const maxZ = notes.reduce((highest, note) => Math.max(highest, note.z_index), 0)
  const wallSize = useMemo(
    () => ({
      width: Math.ceil(Math.max(minimumWallSize.width, viewportSize.width + wallPadding.x)),
      height: Math.ceil(Math.max(minimumWallSize.height, viewportSize.height + wallPadding.y)),
    }),
    [viewportSize.height, viewportSize.width],
  )

  const clampWallOffset = (nextOffset: { x: number; y: number }) => ({
    x: Math.max(Math.min(0, viewportSize.width - wallSize.width), Math.min(0, nextOffset.x)),
    y: Math.max(Math.min(0, viewportSize.height - wallSize.height), Math.min(0, nextOffset.y)),
  })

  useEffect(() => {
    loadNotes()
      .then((loadedNotes) => {
        setNotes(loadedNotes)
        setNotice(`Loaded ${loadedNotes.length} public note${loadedNotes.length === 1 ? '' : 's'} from Supabase.`)
      })
      .catch((error: Error) => {
        setLoadError(error.message)
        setNotice('Could not load public notes.')
      })
      .finally(() => {
        setIsLoading(false)
      })
  }, [])

  useEffect(() => {
    if (ownerSession) {
      setNotice('Owner mode is on. Move notes directly on the wall.')
      return
    }

    setIsEditing(false)
    setDraft(null)
  }, [ownerSession])

  useEffect(() => {
    if (authNotice) {
      setNotice(authNotice)
    }
  }, [authNotice])

  useEffect(() => {
    if (!shouldOpenLogin || ownerSession) return

    setIsLoginOpen(true)
    onLoginRequestHandled()
  }, [onLoginRequestHandled, ownerSession, shouldOpenLogin])

  useEffect(() => {
    if (!wallRef.current) return

    const updateViewportSize = () => {
      if (!wallRef.current) return
      const rect = wallRef.current.getBoundingClientRect()
      setViewportSize({ width: rect.width, height: rect.height })
    }

    updateViewportSize()
    const resizeObserver = new ResizeObserver(updateViewportSize)
    resizeObserver.observe(wallRef.current)

    return () => resizeObserver.disconnect()
  }, [])

  const persistNote = async (
    note: PinNote,
    options: {
      rollbackNote?: PinNote
      successNotice?: string
      failureNotice?: string
    } = {},
  ) => {
    if (!ownerSession) {
      setNotice('Log in as owner before changing notes.')
      return
    }

    setNotes((current) => current.map((item) => (item.id === note.id ? note : item)))

    try {
      const saved = await updateNote(note)
      setNotes((current) => current.map((item) => (item.id === saved.id ? saved : item)))
      setNotice(options.successNotice ?? 'Saved to the wall.')
    } catch (error) {
      const rollbackNote = options.rollbackNote

      if (rollbackNote) {
        setNotes((current) => current.map((item) => (item.id === rollbackNote.id ? rollbackNote : item)))
      }

      const errorMessage = error instanceof Error ? error.message : 'Could not save this note.'
      setNotice(options.failureNotice ? `${options.failureNotice} ${errorMessage}` : errorMessage)
    }
  }

  const persistNotePosition = async (note: PinNote, originalNote: PinNote) => {
    if (!ownerSession) {
      setNotice('Log in as owner before moving notes.')
      return
    }

    if (note.owner_id && note.owner_id !== ownerSession.user.id) {
      console.warn('[PinWall drag] owner mismatch before position update', {
        draggedNoteId: note.id,
        noteOwnerId: note.owner_id,
        sessionUserId: ownerSession.user.id,
      })
      setNotice('Could not save the new position. This note is not owned by the current signed-in user.')
      return
    }

    console.info('[PinWall drag] final note position', {
      draggedNoteId: note.id,
      x: note.x,
      y: note.y,
      rotation: note.rotation,
      z_index: note.z_index,
    })

    setNotes((current) => current.map((item) => (item.id === note.id ? note : item)))

    try {
      const saved = await updateNotePosition(note)
      setNotes((current) => current.map((item) => (item.id === saved.id ? saved : item)))
      setNotice('Saved position to the wall.')
    } catch (error) {
      console.error('[PinWall drag] position persistence failed', {
        draggedNoteId: note.id,
        attemptedPosition: {
          x: note.x,
          y: note.y,
          rotation: note.rotation,
          z_index: note.z_index,
        },
        originalPosition: {
          x: originalNote.x,
          y: originalNote.y,
          rotation: originalNote.rotation,
          z_index: originalNote.z_index,
        },
        error,
      })

      const errorMessage = error instanceof Error ? error.message : 'Could not save the new position.'
      setNotice(`Could not save the new position. ${errorMessage}`)
    }
  }

  const openNote = (note: PinNote) => {
    setSelectedNoteId(note.id)
    setDraft(noteToDraft(note))
    setIsEditing(false)
  }

  const handleNoteClick = (note: PinNote) => {
    if (suppressNextClickRef.current) {
      suppressNextClickRef.current = false
      return
    }

    openNote(note)
  }

  const stopNoteToolEvent = (event: React.SyntheticEvent) => {
    event.stopPropagation()
  }

  const startNewNote = () => {
    if (!ownerSession) {
      setNotice('Log in as owner before pinning a new note.')
      setIsLoginOpen(true)
      return
    }

    const nextDraft = emptyDraft(maxZ + 1)
    setDraft(nextDraft)
    setSelectedNoteId(null)
    setIsEditing(true)
  }

  const saveDraft = async () => {
    if (!ownerSession) {
      setNotice('Log in as owner before saving notes.')
      setIsLoginOpen(true)
      return
    }

    if (!draft || !draft.content.trim()) {
      setNotice('Write a little something before pinning it.')
      return
    }

    const normalizedDraft = {
      ...draft,
      title: draft.title?.trim() || null,
      tags: draft.tags.map((tag) => tag.trim()).filter(Boolean),
    }

    try {
      if (selectedNote) {
        const saved = await updateNote({ ...selectedNote, ...normalizedDraft })
        setNotes((current) => current.map((note) => (note.id === saved.id ? saved : note)))
        setSelectedNoteId(saved.id)
      } else {
        const saved = await createNote(normalizedDraft, ownerSession.user.id)
        setNotes((current) => [...current, saved])
        setSelectedNoteId(saved.id)
      }

      setIsEditing(false)
      setNotice('Pinned.')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not save this note.')
    }
  }

  const removeSelectedNote = async () => {
    if (!selectedNote) return

    if (!ownerSession) {
      setNotice('Log in as owner before deleting notes.')
      setIsLoginOpen(true)
      return
    }

    try {
      await deleteNote(selectedNote.id)
      setNotes((current) => current.filter((note) => note.id !== selectedNote.id))
      setSelectedNoteId(null)
      setIsEditing(false)
      setNotice('Note removed.')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not delete this note.')
    }
  }

  const rotateNote = (note: PinNote, amount: number) => {
    void persistNote({ ...note, rotation: Math.max(-15, Math.min(15, note.rotation + amount)) })
  }

  const bringForward = (note: PinNote) => {
    void persistNote({ ...note, z_index: maxZ + 1 })
  }

  const handleWallPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return

    dragMovedRef.current = false
    dragStartNoteRef.current = null
    setDragState({
      type: 'wall',
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startOffsetX: wallOffset.x,
      startOffsetY: wallOffset.y,
    })
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const handleNotePointerDown = (event: React.PointerEvent, note: PinNote) => {
    if (!isAdmin) return
    if ((event.target as HTMLElement).closest('button')) return

    event.stopPropagation()
    dragMovedRef.current = false
    dragStartNoteRef.current = note
    setDragState({
      type: 'note',
      noteId: note.id,
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startX: note.x,
      startY: note.y,
    })
    ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
  }

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragState || event.pointerId !== dragState.pointerId) return

    const deltaX = event.clientX - dragState.startClientX
    const deltaY = event.clientY - dragState.startClientY
    const movedEnough = Math.hypot(deltaX, deltaY) >= dragThreshold

    if (movedEnough) {
      dragMovedRef.current = true
    }

    if (dragState.type === 'wall') {
      if (!movedEnough) return
      setWallOffset(clampWallOffset({ x: dragState.startOffsetX + deltaX, y: dragState.startOffsetY + deltaY }))
      return
    }

    if (!movedEnough) return

    setNotes((current) =>
      current.map((note) =>
        note.id === dragState.noteId
          ? {
              ...note,
              x: Math.max(0, Math.min(wallSize.width - note.width, dragState.startX + deltaX)),
              y: Math.max(0, Math.min(wallSize.height - note.height, dragState.startY + deltaY)),
            }
          : note,
      ),
    )
  }

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragState || event.pointerId !== dragState.pointerId) return

    if (dragState.type === 'note' && dragMovedRef.current) {
      const draggedNote = dragStartNoteRef.current

      if (draggedNote) {
        const deltaX = event.clientX - dragState.startClientX
        const deltaY = event.clientY - dragState.startClientY
        const nextNote = {
          ...draggedNote,
          x: Math.max(0, Math.min(wallSize.width - draggedNote.width, dragState.startX + deltaX)),
          y: Math.max(0, Math.min(wallSize.height - draggedNote.height, dragState.startY + deltaY)),
        }

        void persistNotePosition(nextNote, draggedNote)
      }

      suppressNextClickRef.current = true
    }

    dragStartNoteRef.current = null
    setDragState(null)
  }

  const loginOwner = async () => {
    setIsAuthBusy(true)

    try {
      const session = await signInOwner(ownerLoginEmail, ownerPassword)
      onOwnerSessionChange(session)
      setIsLoginOpen(false)
      setOwnerPassword('')
      onAuthNotice('')
      setNotice('Owner mode is on. Move notes directly on the wall.')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Owner login failed.')
    } finally {
      setIsAuthBusy(false)
    }
  }

  const openForgotPassword = () => {
    setIsLoginOpen(false)
    setOwnerPassword('')
    onForgotPassword()
  }

  const closeModal = () => {
    setSelectedNoteId(null)
    setIsEditing(false)
    setDraft(null)
    setIsDeleteConfirmOpen(false)
  }

  return (
    <main className="pinwall-shell">
      <header className="topbar" aria-label="Wall controls">
        <div className="brand">
          <span className="brand-pin" aria-hidden="true" />
          <div>
            <h1>PinWall</h1>
          </div>
        </div>

        <div className="admin-entry">
          <div className={`search-box ${isSearchFocused || hasQuery ? 'is-active' : ''}`}>
            <button className="search-toggle" type="button" aria-label="Search notes" title="Search notes" onClick={() => searchInputRef.current?.focus()}>
              <Search size={16} strokeWidth={2.1} aria-hidden="true" />
            </button>
            <input
              ref={searchInputRef}
              aria-label="Search notes"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onFocus={() => setIsSearchFocused(true)}
              onBlur={() => setIsSearchFocused(false)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && matchingNotes[0]) openNote(matchingNotes[0])
              }}
              placeholder="search"
            />
          </div>
          {isAdmin ? (
            <>
              <button className="primary-button icon-button" onClick={startNewNote} aria-label="New note" title="New note">
                <SquarePen size={16} strokeWidth={2.1} aria-hidden="true" />
              </button>
            </>
          ) : null}
        </div>
      </header>

      <section
        ref={wallRef}
        className="wall-viewport"
        onPointerDown={handleWallPointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        aria-label="Sticky note wall"
      >
        <div
          className="wall-canvas"
          style={{
            width: wallSize.width,
            height: wallSize.height,
            transform: `translate(${wallOffset.x}px, ${wallOffset.y}px)`,
          }}
        >
          {notes.map((note) => {
            const isMatch = matchesSearch(note, query)
            return (
              <article
                className={`sticky-note ${hasQuery && isMatch ? 'is-match' : ''} ${hasQuery && !isMatch ? 'is-muted' : ''}`}
                key={note.id}
                style={{
                  left: note.x,
                  top: note.y,
                  zIndex: note.z_index,
                  width: note.width,
                  minHeight: note.height,
                  '--note-color': note.color,
                  transform: `rotate(${note.rotation}deg)`,
                } as CSSProperties}
                onClick={() => handleNoteClick(note)}
                onPointerDown={(event) => handleNotePointerDown(event, note)}
              >
                <button className="pin-head" aria-label={`Open ${note.title || 'note'}`} />
                {note.title ? <h2>{note.title}</h2> : null}
                <p>{notePreview(note.content)}</p>
                {note.tags.length > 0 ? <div className="tag-line">{note.tags.map((tag) => `#${tag}`).join(' ')}</div> : null}

                {isAdmin ? (
                  <div
                    className="note-tools"
                    aria-label="Admin note tools"
                    onClick={stopNoteToolEvent}
                    onMouseUp={stopNoteToolEvent}
                    onPointerDown={stopNoteToolEvent}
                    onPointerUp={stopNoteToolEvent}
                  >
                    <button
                      type="button"
                      onClick={(event) => {
                        stopNoteToolEvent(event)
                        rotateNote(note, -2)
                      }}
                      aria-label="Rotate left"
                      title="Rotate left"
                    >
                      <RotateCcwSquare size={14} strokeWidth={2} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={(event) => {
                        stopNoteToolEvent(event)
                        rotateNote(note, 2)
                      }}
                      aria-label="Rotate right"
                      title="Rotate right"
                    >
                      <RotateCwSquare size={14} strokeWidth={2} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={(event) => {
                        stopNoteToolEvent(event)
                        bringForward(note)
                      }}
                      aria-label="Bring to front"
                      title="Bring to front"
                    >
                      <BringToFront size={14} strokeWidth={2} aria-hidden="true" />
                    </button>
                  </div>
                ) : null}
              </article>
            )
          })}
          {isLoading ? (
            <div className="wall-state-note" role="status">
              Loading public notes...
            </div>
          ) : null}
          {loadError ? (
            <div className="wall-state-note is-error" role="alert">
              Could not load public notes. {loadError}
            </div>
          ) : null}
          {showEmptyState ? (
            <div className="wall-state-note is-empty" role="status">
              Loaded successfully, but no public notes were returned. Check that rows in notes have is_public set to true and that RLS allows public reads.
            </div>
          ) : null}
        </div>
      </section>

      <footer className="status-strip">
        <span>{notice}</span>
        {hasQuery ? <span>{matchingNotes.length} bright note{matchingNotes.length === 1 ? '' : 's'}</span> : null}
      </footer>

      {(selectedNote || isEditing) && modalDraft ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={closeModal}>
          <section className="note-modal" role="dialog" aria-modal="true" aria-label="Expanded note" onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-actions">
              <button className="quiet-button" onClick={closeModal}>
                Close
              </button>
              {isAdmin && selectedNote ? (
                <button className="quiet-button danger" onClick={() => setIsDeleteConfirmOpen(true)}>
                  Delete
                </button>
              ) : null}
              {isAdmin && selectedNote ? (
                <button className="primary-button" onClick={() => setIsEditing((current) => !current)}>
                  {isEditing ? 'Preview' : 'Edit'}
                </button>
              ) : null}
              {isAdmin && isEditing ? (
                <button className="primary-button" onClick={saveDraft}>
                  Save
                </button>
              ) : null}
            </div>

            {isEditing && isAdmin ? (
              <div className="editor-pane">
                <label>
                  Title
                  <input
                    value={modalDraft.title ?? ''}
                    onChange={(event) => setDraft({ ...modalDraft, title: event.target.value })}
                    placeholder="Optional title"
                  />
                </label>
                <label>
                  Content
                  <textarea
                    value={modalDraft.content}
                    onChange={(event) => setDraft({ ...modalDraft, content: event.target.value })}
                    placeholder="Write the note here. Basic Markdown is supported."
                    rows={10}
                  />
                </label>
                <label>
                  Tags
                  <input
                    value={modalDraft.tags.join(', ')}
                    onChange={(event) => setDraft({ ...modalDraft, tags: event.target.value.split(',') })}
                    placeholder="wish, idea, memory"
                  />
                </label>
              </div>
            ) : (
              <div className="markdown-body">
                {modalDraft.title ? <h2>{modalDraft.title}</h2> : null}
                <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>
                  {modalDraft.content}
                </ReactMarkdown>
                {modalDraft.tags.length > 0 ? <p className="modal-tags">{modalDraft.tags.map((tag) => `#${tag}`).join(' ')}</p> : null}
              </div>
            )}
          </section>
        </div>
      ) : null}

      {isLoginOpen ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setIsLoginOpen(false)}>
          <section className="login-modal" role="dialog" aria-modal="true" aria-label="Owner login" onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-actions">
              <button className="quiet-button icon-button" onClick={() => setIsLoginOpen(false)} aria-label="Close" title="Close">
                <X size={16} strokeWidth={2.1} aria-hidden="true" />
              </button>
            </div>
            <form
              className="owner-login-form"
              onSubmit={(event) => {
                event.preventDefault()
                void loginOwner()
              }}
            >
              <div className="owner-login-heading">
                <span className="brand-pin" aria-hidden="true" />
                <div>
                  <h2>Owner login</h2>
                  <p className="owner-login-hint">Wesley</p>
                </div>
              </div>
              <label>
                Password
                <input
                  autoFocus
                  aria-label="Owner password"
                  type="password"
                  value={ownerPassword}
                  onChange={(event) => setOwnerPassword(event.target.value)}
                  placeholder="password"
                  autoComplete="current-password"
                  required
                />
              </label>
              <button className="primary-button" type="submit" disabled={isAuthBusy}>
                {isAuthBusy ? 'Signing in...' : 'Enter'}
              </button>
              <button className="link-button" type="button" onClick={openForgotPassword}>
                Forgot password?
              </button>
            </form>
          </section>
        </div>
      ) : null}

      {isDeleteConfirmOpen && selectedNote ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setIsDeleteConfirmOpen(false)}>
          <section className="confirm-modal" role="dialog" aria-modal="true" aria-label="Confirm note deletion" onMouseDown={(event) => event.stopPropagation()}>
            <h2>Delete this note?</h2>
            <p>This will remove the sticky note from the wall. Are you sure?</p>
            <div className="confirm-actions">
              <button className="quiet-button" onClick={() => setIsDeleteConfirmOpen(false)}>
                Keep it
              </button>
              <button className="primary-button danger-action" onClick={removeSelectedNote}>
                Delete
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  )
}
