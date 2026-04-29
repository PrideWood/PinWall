import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import ReactMarkdown from 'react-markdown'
import rehypeSanitize from 'rehype-sanitize'
import remarkGfm from 'remark-gfm'
import { BringToFront, LocateFixed, Pencil, RotateCwSquare, Search, SendHorizontal, SquarePen, SquareX, Trash2, X } from 'lucide-react'
import '../App.css'
import type { Session } from '@supabase/supabase-js'
import { signInOwner } from '../lib/authRepository'
import { createNote, deleteNote, loadNotes, updateNote, updateNotePosition } from '../lib/notesRepository'
import type { DragState, NoteDraft, PinNote } from '../types'

const minimumWallSize = { width: 2200, height: 1400 }
const wallPadding = { x: 720, y: 480 }
const dragThreshold = 6
const minWallZoom = 0.75
const maxWallZoom = 1.6
const wheelZoomSensitivity = 0.0015
const normalNoticeDurationMs = 1000
const errorNoticeDurationMs = 12000
const noteColors = ['#fff2a8', '#ffd1dc', '#cdf2ca', '#cde7ff', '#f5d6ff']
const ownerLoginEmail = 'boquanchai@gmail.com'
const mobileWallBreakpoint = 780
const defaultNoteSize = { width: 260, height: 220 }
const captureFabStorageKey = 'pinwall.captureFabPosition'
const captureFabSize = 60
const captureFabMargin = { top: 14, right: 14, bottom: 16, left: 14 }
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
const pointerAngleFromCenter = (clientX: number, clientY: number, centerX: number, centerY: number) =>
  (Math.atan2(clientY - centerY, clientX - centerX) * 180) / Math.PI

const normalizeRotation = (rotation: number) => {
  const normalized = ((((rotation + 180) % 360) + 360) % 360) - 180
  return Math.round(normalized * 10) / 10
}

const clampZoom = (zoom: number) => Math.max(minWallZoom, Math.min(maxWallZoom, zoom))

const isErrorNotice = (message: string) => /could not|failed|error|invalid|expired/i.test(message)

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
  resetViewSignal: number
}

export function WallView({
  authNotice,
  ownerSession,
  shouldOpenLogin,
  onAuthNotice,
  onForgotPassword,
  onLoginRequestHandled,
  onOwnerSessionChange,
  resetViewSignal,
}: WallViewProps) {
  const wallRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const captureInputRef = useRef<HTMLTextAreaElement>(null)
  const dragMovedRef = useRef(false)
  const dragStartNoteRef = useRef<PinNote | null>(null)
  const suppressNextClickRef = useRef(false)
  const hasCenteredWallRef = useRef(false)
  const captureFabDragRef = useRef<{
    pointerId: number
    startClientX: number
    startClientY: number
    startX: number
    startY: number
    moved: boolean
  } | null>(null)
  const suppressCaptureFabClickRef = useRef(false)
  const [notes, setNotes] = useState<PinNote[]>([])
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [draft, setDraft] = useState<NoteDraft | null>(null)
  const [query, setQuery] = useState('')
  const [isLoginOpen, setIsLoginOpen] = useState(false)
  const [ownerPassword, setOwnerPassword] = useState('')
  const [isAuthBusy, setIsAuthBusy] = useState(false)
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false)
  const [deleteTargetNoteId, setDeleteTargetNoteId] = useState<string | null>(null)
  const [isSearchFocused, setIsSearchFocused] = useState(false)
  const [isCaptureOpen, setIsCaptureOpen] = useState(false)
  const [captureText, setCaptureText] = useState('')
  const [isCaptureSaving, setIsCaptureSaving] = useState(false)
  const [mobileActionNoteId, setMobileActionNoteId] = useState<string | null>(null)
  const [notice, setNotice] = useState('Loading the wall...')
  const [noticeVersion, setNoticeVersion] = useState(0)
  const [isNoticeVisible, setIsNoticeVisible] = useState(true)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [dragState, setDragState] = useState<DragState | null>(null)
  const [wallOffset, setWallOffset] = useState({ x: 0, y: 0 })
  const [wallZoom, setWallZoom] = useState(1)
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 })
  const [captureFabPosition, setCaptureFabPosition] = useState<{ x: number; y: number } | null>(null)
  const [isCaptureFabDragging, setIsCaptureFabDragging] = useState(false)

  const selectedNote = notes.find((note) => note.id === selectedNoteId) ?? null
  const deleteTargetNote = notes.find((note) => note.id === deleteTargetNoteId) ?? null
  const isAdmin = Boolean(ownerSession)
  const modalDraft = draft ?? (selectedNote ? noteToDraft(selectedNote) : null)
  const matchingNotes = useMemo(() => notes.filter((note) => matchesSearch(note, query)), [notes, query])
  const isMobileWall = viewportSize.width > 0 && viewportSize.width <= mobileWallBreakpoint
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

  const getCenteredWallOffset = useCallback(
    (zoom = wallZoom) => ({
      x: (viewportSize.width - wallSize.width * zoom) / 2,
      y: (viewportSize.height - wallSize.height * zoom) / 2,
    }),
    [viewportSize.height, viewportSize.width, wallSize.height, wallSize.width, wallZoom],
  )

  const clampWallOffset = useCallback(
    (nextOffset: { x: number; y: number }, zoom = wallZoom) => {
      const scaledWidth = wallSize.width * zoom
      const scaledHeight = wallSize.height * zoom
      const centeredOffset = getCenteredWallOffset(zoom)
      const horizontalPanLimit = Math.max(0, (scaledWidth - viewportSize.width) / 2)
      const verticalPanLimit = Math.max(0, (scaledHeight - viewportSize.height) / 2)
      const minX = centeredOffset.x - horizontalPanLimit
      const maxX = centeredOffset.x + horizontalPanLimit
      const minY = centeredOffset.y - verticalPanLimit
      const maxY = centeredOffset.y + verticalPanLimit

      return {
        x: Math.max(minX, Math.min(maxX, nextOffset.x)),
        y: Math.max(minY, Math.min(maxY, nextOffset.y)),
      }
    },
    [getCenteredWallOffset, viewportSize.height, viewportSize.width, wallSize.height, wallSize.width, wallZoom],
  )

  const showNotice = useCallback((message: string) => {
    setNotice(message)
    setIsNoticeVisible(Boolean(message))
    setNoticeVersion((current) => current + 1)
  }, [])

  const clampCaptureFabPosition = useCallback(
    (position: { x: number; y: number }) => {
      const maxX = Math.max(captureFabMargin.left, viewportSize.width - captureFabSize - captureFabMargin.right)
      const maxY = Math.max(captureFabMargin.top, viewportSize.height - captureFabSize - captureFabMargin.bottom)

      return {
        x: Math.round(Math.max(captureFabMargin.left, Math.min(maxX, position.x))),
        y: Math.round(Math.max(captureFabMargin.top, Math.min(maxY, position.y))),
      }
    },
    [viewportSize.height, viewportSize.width],
  )

  useEffect(() => {
    loadNotes()
      .then((loadedNotes) => {
        setNotes(loadedNotes)
        showNotice(`Loaded ${loadedNotes.length} public note${loadedNotes.length === 1 ? '' : 's'} from Supabase.`)
      })
      .catch((error: Error) => {
        setLoadError(error.message)
        showNotice('Could not load public notes.')
      })
      .finally(() => {
        setIsLoading(false)
      })
  }, [showNotice])

  useEffect(() => {
    if (ownerSession) {
      showNotice('Owner mode is on. Move notes directly on the wall.')
      return
    }

    setIsEditing(false)
    setDraft(null)
    setDeleteTargetNoteId(null)
    setMobileActionNoteId(null)
  }, [ownerSession, showNotice])

  useEffect(() => {
    if (!isMobileWall) {
      setMobileActionNoteId(null)
    }
  }, [isMobileWall])

  useEffect(() => {
    if (authNotice) {
      showNotice(authNotice)
    }
  }, [authNotice, showNotice])

  useEffect(() => {
    if (!notice) {
      setIsNoticeVisible(false)
      return
    }

    setIsNoticeVisible(true)
    const hideDelay = isErrorNotice(notice) ? errorNoticeDurationMs : normalNoticeDurationMs
    const timeoutId = window.setTimeout(() => {
      setIsNoticeVisible(false)
    }, hideDelay)

    return () => window.clearTimeout(timeoutId)
  }, [notice, noticeVersion])

  useEffect(() => {
    if (!shouldOpenLogin || ownerSession) return

    setIsLoginOpen(true)
    onLoginRequestHandled()
  }, [onLoginRequestHandled, ownerSession, shouldOpenLogin])

  useEffect(() => {
    if (!isCaptureOpen) return

    const focusTimeout = window.setTimeout(() => {
      captureInputRef.current?.focus()
    }, 80)

    return () => window.clearTimeout(focusTimeout)
  }, [isCaptureOpen])

  useEffect(() => {
    if (!isMobileWall || !viewportSize.width || !viewportSize.height) return

    setCaptureFabPosition((current) => {
      if (current) return clampCaptureFabPosition(current)

      try {
        const savedPosition = window.localStorage.getItem(captureFabStorageKey)
        if (savedPosition) {
          const parsed = JSON.parse(savedPosition) as Partial<{ x: number; y: number }>
          if (typeof parsed.x === 'number' && typeof parsed.y === 'number') {
            return clampCaptureFabPosition({ x: parsed.x, y: parsed.y })
          }
        }
      } catch {
        window.localStorage.removeItem(captureFabStorageKey)
      }

      return clampCaptureFabPosition({
        x: viewportSize.width - captureFabSize - captureFabMargin.right,
        y: viewportSize.height - captureFabSize - captureFabMargin.bottom,
      })
    })
  }, [clampCaptureFabPosition, isMobileWall, viewportSize.height, viewportSize.width])

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

  useEffect(() => {
    if (!viewportSize.width || !viewportSize.height) return

    setWallOffset((current) => {
      if (!hasCenteredWallRef.current) {
        hasCenteredWallRef.current = true
        return getCenteredWallOffset(wallZoom)
      }

      return clampWallOffset(current, wallZoom)
    })
  }, [clampWallOffset, getCenteredWallOffset, viewportSize.height, viewportSize.width, wallZoom])

  const persistNote = async (
    note: PinNote,
    options: {
      rollbackNote?: PinNote
      successNotice?: string
      failureNotice?: string
    } = {},
  ) => {
    if (!ownerSession) {
      showNotice('Log in as owner before changing notes.')
      return
    }

    setNotes((current) => current.map((item) => (item.id === note.id ? note : item)))

    try {
      const saved = await updateNote(note)
      setNotes((current) => current.map((item) => (item.id === saved.id ? saved : item)))
      showNotice(options.successNotice ?? 'Saved to the wall.')
    } catch (error) {
      const rollbackNote = options.rollbackNote

      if (rollbackNote) {
        setNotes((current) => current.map((item) => (item.id === rollbackNote.id ? rollbackNote : item)))
      }

      const errorMessage = error instanceof Error ? error.message : 'Could not save this note.'
      showNotice(options.failureNotice ? `${options.failureNotice} ${errorMessage}` : errorMessage)
    }
  }

  const persistNotePosition = async (note: PinNote, originalNote: PinNote) => {
    if (!ownerSession) {
      showNotice('Log in as owner before moving notes.')
      return
    }

    if (note.owner_id && note.owner_id !== ownerSession.user.id) {
      console.warn('[PinWall drag] owner mismatch before position update', {
        draggedNoteId: note.id,
        noteOwnerId: note.owner_id,
        sessionUserId: ownerSession.user.id,
      })
      showNotice('Could not save the new position. This note is not owned by the current signed-in user.')
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
      showNotice('Saved position to the wall.')
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
      showNotice(`Could not save the new position. ${errorMessage}`)
    }
  }

  const getVisibleDraft = (zIndex: number, content = ''): NoteDraft => {
    const noteWidth = defaultNoteSize.width
    const noteHeight = defaultNoteSize.height
    const screenX = Math.max(24, (viewportSize.width - noteWidth * wallZoom) / 2)
    const screenY = Math.max(24, (viewportSize.height - noteHeight * wallZoom) / 2)
    const visibleX = (screenX - wallOffset.x) / wallZoom
    const visibleY = (screenY - wallOffset.y) / wallZoom

    return {
      title: '',
      content,
      tags: [],
      x: Math.round(Math.max(0, Math.min(wallSize.width - noteWidth, visibleX))),
      y: Math.round(Math.max(0, Math.min(wallSize.height - noteHeight, visibleY))),
      z_index: zIndex,
      rotation: isMobileWall ? -1 : Math.round(Math.random() * 8) - 4,
      width: noteWidth,
      height: noteHeight,
      color: noteColors[Math.floor(Math.random() * noteColors.length)],
      is_public: true,
    }
  }

  const openNote = (note: PinNote) => {
    setMobileActionNoteId(null)
    setSelectedNoteId(note.id)
    setDraft(noteToDraft(note))
    setIsEditing(false)
  }

  const handleNoteClick = (note: PinNote) => {
    if (suppressNextClickRef.current) {
      suppressNextClickRef.current = false
      return
    }

    if (isMobileWall && isAdmin && mobileActionNoteId !== note.id) {
      setMobileActionNoteId(note.id)
      return
    }

    openNote(note)
  }

  const stopNoteToolEvent = (event: React.SyntheticEvent) => {
    event.stopPropagation()
  }

  const startNewNote = () => {
    if (!ownerSession) {
      showNotice('Log in as owner before pinning a new note.')
      setIsLoginOpen(true)
      return
    }

    const nextDraft = isMobileWall ? getVisibleDraft(maxZ + 1) : emptyDraft(maxZ + 1)
    setDraft(nextDraft)
    setSelectedNoteId(null)
    setMobileActionNoteId(null)
    setIsEditing(true)
  }

  const openQuickCapture = () => {
    if (!ownerSession) {
      showNotice('Log in as owner before capturing notes.')
      setIsLoginOpen(true)
      return
    }

    setIsCaptureOpen(true)
  }

  const handleCaptureFabPointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (!isMobileWall || !captureFabPosition) return

    event.stopPropagation()
    captureFabDragRef.current = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startX: captureFabPosition.x,
      startY: captureFabPosition.y,
      moved: false,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const handleCaptureFabPointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    const drag = captureFabDragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return

    event.stopPropagation()
    const deltaX = event.clientX - drag.startClientX
    const deltaY = event.clientY - drag.startClientY
    const movedEnough = Math.hypot(deltaX, deltaY) >= dragThreshold

    if (!movedEnough && !drag.moved) return

    drag.moved = true
    setIsCaptureFabDragging(true)
    setCaptureFabPosition(clampCaptureFabPosition({ x: drag.startX + deltaX, y: drag.startY + deltaY }))
  }

  const finishCaptureFabDrag = (event: React.PointerEvent<HTMLButtonElement>) => {
    const drag = captureFabDragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return

    event.stopPropagation()
    if (drag.moved) {
      const deltaX = event.clientX - drag.startClientX
      const deltaY = event.clientY - drag.startClientY
      const nextPosition = clampCaptureFabPosition({ x: drag.startX + deltaX, y: drag.startY + deltaY })

      setCaptureFabPosition(nextPosition)
      window.localStorage.setItem(captureFabStorageKey, JSON.stringify(nextPosition))
      suppressCaptureFabClickRef.current = true
    }

    captureFabDragRef.current = null
    setIsCaptureFabDragging(false)
  }

  const handleCaptureFabClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (suppressCaptureFabClickRef.current) {
      event.preventDefault()
      suppressCaptureFabClickRef.current = false
      return
    }

    openQuickCapture()
  }

  const closeQuickCapture = () => {
    if (isCaptureSaving) return

    setIsCaptureOpen(false)
    setCaptureText('')
  }

  const saveQuickCapture = async () => {
    if (!ownerSession) {
      showNotice('Log in as owner before capturing notes.')
      setIsLoginOpen(true)
      return
    }

    const content = captureText.trim()

    if (!content) {
      showNotice('Write a quick thought before saving it.')
      return
    }

    setIsCaptureSaving(true)

    try {
      const saved = await createNote(getVisibleDraft(maxZ + 1, content), ownerSession.user.id)
      setNotes((current) => [...current, saved])
      setCaptureText('')
      setIsCaptureOpen(false)
      showNotice('Captured.')
    } catch (error) {
      showNotice(error instanceof Error ? error.message : 'Could not capture this note.')
    } finally {
      setIsCaptureSaving(false)
    }
  }

  const saveDraft = async () => {
    if (!ownerSession) {
      showNotice('Log in as owner before saving notes.')
      setIsLoginOpen(true)
      return
    }

    if (!draft || !draft.content.trim()) {
      showNotice('Write a little something before pinning it.')
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
      showNotice('Pinned.')
    } catch (error) {
      showNotice(error instanceof Error ? error.message : 'Could not save this note.')
    }
  }

  const removeSelectedNote = async () => {
    if (!deleteTargetNote) return

    if (!ownerSession) {
      showNotice('Log in as owner before deleting notes.')
      setIsLoginOpen(true)
      return
    }

    try {
      await deleteNote(deleteTargetNote.id)
      setNotes((current) => current.filter((note) => note.id !== deleteTargetNote.id))
      if (selectedNoteId === deleteTargetNote.id) {
        setSelectedNoteId(null)
      }
      setDeleteTargetNoteId(null)
      setIsDeleteConfirmOpen(false)
      setIsEditing(false)
      showNotice('Note removed.')
    } catch (error) {
      showNotice(error instanceof Error ? error.message : 'Could not delete this note.')
    }
  }

  const bringForward = (note: PinNote) => {
    void persistNote({ ...note, z_index: maxZ + 1 })
  }

  const editNote = (note: PinNote) => {
    setMobileActionNoteId(null)
    setSelectedNoteId(note.id)
    setDraft(noteToDraft(note))
    setIsEditing(true)
  }

  const confirmDeleteNote = (note: PinNote) => {
    setMobileActionNoteId(null)
    setDeleteTargetNoteId(note.id)
    setIsDeleteConfirmOpen(true)
  }

  const resetWallView = () => {
    const defaultZoom = 1
    setWallZoom(defaultZoom)
    setWallOffset(getCenteredWallOffset(defaultZoom))
  }

  useEffect(() => {
    if (!resetViewSignal || !viewportSize.width || !viewportSize.height) return

    const defaultZoom = 1
    hasCenteredWallRef.current = true
    setWallZoom(defaultZoom)
    setWallOffset(getCenteredWallOffset(defaultZoom))
  }, [getCenteredWallOffset, resetViewSignal, viewportSize.height, viewportSize.width])

  const handleWallWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    event.preventDefault()

    const isZoomGesture = event.ctrlKey || event.metaKey

    if (!isZoomGesture) {
      setWallOffset((current) => clampWallOffset({ x: current.x - event.deltaX, y: isMobileWall ? current.y : current.y - event.deltaY }))
      return
    }

    const wallRect = wallRef.current?.getBoundingClientRect()
    if (!wallRect) return

    const currentZoom = wallZoom
    const nextZoom = clampZoom(currentZoom * Math.exp(-event.deltaY * wheelZoomSensitivity))
    const pointerX = event.clientX - wallRect.left
    const pointerY = event.clientY - wallRect.top

    setWallZoom(nextZoom)
    setWallOffset((currentOffset) => {
      const wallPointX = (pointerX - currentOffset.x) / currentZoom
      const wallPointY = (pointerY - currentOffset.y) / currentZoom

      return clampWallOffset(
        {
          x: pointerX - wallPointX * nextZoom,
          y: pointerY - wallPointY * nextZoom,
        },
        nextZoom,
      )
    })
  }

  const handleRotationPointerDown = (event: React.PointerEvent<HTMLButtonElement>, note: PinNote) => {
    if (!isAdmin) return

    stopNoteToolEvent(event)
    dragMovedRef.current = false
    dragStartNoteRef.current = note

    const wallRect = wallRef.current?.getBoundingClientRect()
    const centerX = (wallRect?.left ?? 0) + wallOffset.x + (note.x + note.width / 2) * wallZoom
    const centerY = (wallRect?.top ?? 0) + wallOffset.y + (note.y + note.height / 2) * wallZoom

    setDragState({
      type: 'rotate',
      noteId: note.id,
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      centerX,
      centerY,
      startAngle: pointerAngleFromCenter(event.clientX, event.clientY, centerX, centerY),
      startRotation: note.rotation,
    })
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const handleWallPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement
    if (target.closest('.sticky-note, button, input, textarea, a')) return

    setMobileActionNoteId(null)
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
      setWallOffset(clampWallOffset({ x: dragState.startOffsetX + deltaX, y: isMobileWall ? dragState.startOffsetY : dragState.startOffsetY + deltaY }))
      return
    }

    if (dragState.type === 'rotate') {
      if (!movedEnough) return

      const currentAngle = pointerAngleFromCenter(event.clientX, event.clientY, dragState.centerX, dragState.centerY)
      const angleDelta = currentAngle - dragState.startAngle
      const nextRotation = normalizeRotation(dragState.startRotation + angleDelta)

      setNotes((current) =>
        current.map((note) =>
          note.id === dragState.noteId
            ? {
                ...note,
                rotation: nextRotation,
              }
            : note,
        ),
      )
      return
    }

    if (!movedEnough) return

    const logicalDeltaX = deltaX / wallZoom
    const logicalDeltaY = deltaY / wallZoom

    setNotes((current) =>
      current.map((note) =>
        note.id === dragState.noteId
          ? {
              ...note,
              x: Math.max(0, Math.min(wallSize.width - note.width, dragState.startX + logicalDeltaX)),
              y: Math.max(0, Math.min(wallSize.height - note.height, dragState.startY + logicalDeltaY)),
            }
          : note,
      ),
    )
  }

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragState || event.pointerId !== dragState.pointerId) return

    if (dragState.type === 'rotate' && dragMovedRef.current) {
      const rotatedNote = dragStartNoteRef.current

      if (rotatedNote) {
        const currentAngle = pointerAngleFromCenter(event.clientX, event.clientY, dragState.centerX, dragState.centerY)
        const angleDelta = currentAngle - dragState.startAngle
        const nextNote = {
          ...rotatedNote,
          rotation: normalizeRotation(dragState.startRotation + angleDelta),
        }

        void persistNotePosition(nextNote, rotatedNote)
      }

      suppressNextClickRef.current = true
    }

    if (dragState.type === 'note' && dragMovedRef.current) {
      const draggedNote = dragStartNoteRef.current

      if (draggedNote) {
        const deltaX = event.clientX - dragState.startClientX
        const deltaY = event.clientY - dragState.startClientY
        const logicalDeltaX = deltaX / wallZoom
        const logicalDeltaY = deltaY / wallZoom
        const nextNote = {
          ...draggedNote,
          x: Math.max(0, Math.min(wallSize.width - draggedNote.width, dragState.startX + logicalDeltaX)),
          y: Math.max(0, Math.min(wallSize.height - draggedNote.height, dragState.startY + logicalDeltaY)),
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
      showNotice('Owner mode is on. Move notes directly on the wall.')
    } catch (error) {
      showNotice(error instanceof Error ? error.message : 'Owner login failed.')
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
  }

  const captureFabStyle =
    isMobileWall && captureFabPosition
      ? ({
          left: captureFabPosition.x,
          top: captureFabPosition.y,
          right: 'auto',
          bottom: 'auto',
        } satisfies CSSProperties)
      : undefined

  return (
    <main className="pinwall-shell">
      <header className="topbar" aria-label="Wall controls">
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
          <button className="quiet-button icon-button view-reset-button" onClick={resetWallView} aria-label="Reset wall view" title="Reset wall view">
            <LocateFixed size={16} strokeWidth={2.1} aria-hidden="true" />
          </button>
          {isAdmin ? (
            <>
              <button className="primary-button icon-button" onClick={startNewNote} aria-label="New note" title="New note">
                <SquarePen size={16} strokeWidth={2.1} aria-hidden="true" />
              </button>
            </>
          ) : null}
        </div>
      </header>

      <button
        className={`capture-fab ${isCaptureFabDragging ? 'is-dragging' : ''}`}
        type="button"
        style={captureFabStyle}
        onClick={handleCaptureFabClick}
        onPointerDown={handleCaptureFabPointerDown}
        onPointerMove={handleCaptureFabPointerMove}
        onPointerUp={finishCaptureFabDrag}
        onPointerCancel={finishCaptureFabDrag}
        aria-label="Quick capture"
        title="Quick capture"
      >
        <SquarePen size={25} strokeWidth={2.2} aria-hidden="true" />
      </button>

      <section
        ref={wallRef}
        className="wall-viewport"
        onPointerDown={handleWallPointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onWheel={handleWallWheel}
        aria-label="Sticky note wall"
      >
        <div
          className="wall-canvas"
          style={{
            width: wallSize.width,
            height: wallSize.height,
            transform: `translate(${wallOffset.x}px, ${wallOffset.y}px) scale(${wallZoom})`,
          }}
        >
          {notes.map((note) => {
            const isMatch = matchesSearch(note, query)
            const isMobileActionSelected = isMobileWall && mobileActionNoteId === note.id
            return (
              <article
                className={`sticky-note ${hasQuery && isMatch ? 'is-match' : ''} ${hasQuery && !isMatch ? 'is-muted' : ''} ${isMobileActionSelected ? 'is-action-selected' : ''}`}
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
                  <>
                    <button
                      className="rotation-handle"
                      type="button"
                      onClick={stopNoteToolEvent}
                      onPointerDown={(event) => handleRotationPointerDown(event, note)}
                      aria-label="Drag to rotate note"
                      title="Drag to rotate"
                    >
                      <RotateCwSquare size={14} strokeWidth={2} aria-hidden="true" />
                    </button>
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
                          bringForward(note)
                        }}
                        aria-label="Bring to front"
                        title="Bring to front"
                      >
                        <BringToFront size={14} strokeWidth={2} aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={(event) => {
                          stopNoteToolEvent(event)
                          editNote(note)
                        }}
                        aria-label="Edit note"
                        title="Edit note"
                      >
                        <Pencil size={14} strokeWidth={2} aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={(event) => {
                          stopNoteToolEvent(event)
                          confirmDeleteNote(note)
                        }}
                        aria-label="Delete note"
                        title="Delete note"
                      >
                        <Trash2 size={14} strokeWidth={2} aria-hidden="true" />
                      </button>
                    </div>
                  </>
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
        {isNoticeVisible && notice ? <span>{notice}</span> : null}
        {hasQuery ? <span>{matchingNotes.length} bright note{matchingNotes.length === 1 ? '' : 's'}</span> : null}
      </footer>

      {(selectedNote || isEditing) && modalDraft ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={closeModal}>
          <section className="note-modal" role="dialog" aria-modal="true" aria-label="Expanded note" onMouseDown={(event) => event.stopPropagation()}>
            {isAdmin && isEditing ? null : (
              <button className="modal-close-icon" type="button" onClick={closeModal} aria-label="Close note" title="Close">
                <SquareX size={21} strokeWidth={1.9} aria-hidden="true" />
              </button>
            )}
            {isAdmin && isEditing ? (
              <div className="modal-actions">
                <button className="quiet-button" onClick={closeModal}>
                  Close
                </button>
                <button className="primary-button" onClick={saveDraft}>
                  Save
                </button>
              </div>
            ) : null}

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

      {isCaptureOpen ? (
        <div className="modal-backdrop capture-backdrop" role="presentation" onMouseDown={closeQuickCapture}>
          <section className="quick-capture-modal" role="dialog" aria-modal="true" aria-label="Capture note" onMouseDown={(event) => event.stopPropagation()}>
            <div className="quick-capture-heading">
              <span className="brand-pin" aria-hidden="true" />
              <div>
                <h2>New note</h2>
                <p>Save now, place it on the wall.</p>
              </div>
            </div>
            <textarea
              ref={captureInputRef}
              autoFocus
              value={captureText}
              onChange={(event) => setCaptureText(event.target.value)}
              placeholder="What just crossed your mind?"
              rows={7}
              aria-label="Quick capture note"
              onKeyDown={(event) => {
                if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                  event.preventDefault()
                  void saveQuickCapture()
                }
              }}
            />
            <div className="quick-capture-actions">
              <button className="quiet-button" type="button" onClick={closeQuickCapture} disabled={isCaptureSaving}>
                Close
              </button>
              <button className="primary-button quick-capture-save" type="button" onClick={saveQuickCapture} disabled={isCaptureSaving}>
                <SendHorizontal size={16} strokeWidth={2.1} aria-hidden="true" />
                <span>{isCaptureSaving ? 'Saving...' : 'Save'}</span>
              </button>
            </div>
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

      {isDeleteConfirmOpen && deleteTargetNote ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={() => {
            setIsDeleteConfirmOpen(false)
            setDeleteTargetNoteId(null)
          }}
        >
          <section className="confirm-modal" role="dialog" aria-modal="true" aria-label="Confirm note deletion" onMouseDown={(event) => event.stopPropagation()}>
            <h2>Delete this note?</h2>
            <p>This will remove the sticky note from the wall. Are you sure?</p>
            <div className="confirm-actions">
              <button
                className="quiet-button"
                onClick={() => {
                  setIsDeleteConfirmOpen(false)
                  setDeleteTargetNoteId(null)
                }}
              >
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
