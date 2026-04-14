import { getMissingSupabaseEnvVars, hasSupabaseConfig, supabase } from './supabase'
import type { FileId } from '@excalidraw/excalidraw/element/types'
import type { BinaryFileData, DataURL } from '@excalidraw/excalidraw/types'

export const boardImagesBucket = 'board-images'
export const maxBoardImageBytes = 5 * 1024 * 1024

type UploadBoardImageParams = {
  boardId: string
  ownerId: string
  file: File
  excalidrawFileId: FileId
}

type UploadBoardImageDataParams = {
  boardId: string
  ownerId: string
  excalidrawFileId: FileId
  dataURL: DataURL
  mimeType: BinaryFileData['mimeType']
}

export type BoardImageRecord = {
  id: string
  board_id: string
  owner_id: string
  excalidraw_file_id: string
  storage_path: string
  public_url: string
  mime_type: string
  file_size: number
  created_at: string
}

export type UploadedBoardImage = {
  record: BoardImageRecord
  storagePath: string
  publicUrl: string
}

const boardImageSelectColumns =
  'id,board_id,owner_id,excalidraw_file_id,storage_path,public_url,mime_type,file_size,created_at'

const sanitizeFilename = (filename: string) => {
  const cleanedName = filename
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9._-]/g, '')
    .replace(/-+/g, '-')

  return cleanedName || 'board-image'
}

const requireSupabase = () => {
  if (!hasSupabaseConfig || !supabase) {
    throw new Error(`Missing ${getMissingSupabaseEnvVars().join(' and ')}.`)
  }

  return supabase
}

const requireMatchingOwner = async (ownerId: string) => {
  const client = requireSupabase()
  const { data, error } = await client.auth.getUser()

  if (error || !data.user) {
    throw new Error('Please log in as the owner before uploading images.')
  }

  if (data.user.id !== ownerId) {
    throw new Error('Only the board owner can upload images.')
  }

  return client
}

const mimeTypeToExtension = (mimeType: string) => {
  if (mimeType === 'image/jpeg') return 'jpg'
  if (mimeType === 'image/png') return 'png'
  if (mimeType === 'image/gif') return 'gif'
  if (mimeType === 'image/webp') return 'webp'
  if (mimeType === 'image/svg+xml') return 'svg'

  return 'img'
}

const readBlobAsDataUrl = (blob: Blob) =>
  new Promise<DataURL>((resolve, reject) => {
    const reader = new FileReader()

    reader.addEventListener('load', () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result as DataURL)
      } else {
        reject(new Error('Could not read image data.'))
      }
    })
    reader.addEventListener('error', () => reject(new Error('Could not read image data.')))
    reader.readAsDataURL(blob)
  })

const dataUrlToBlob = async (dataURL: DataURL, mimeType: string) => {
  const response = await fetch(dataURL)
  const blob = await response.blob()

  return blob.type ? blob : blob.slice(0, blob.size, mimeType)
}

export const validateBoardImageFile = (file: File) => {
  if (!file.type.startsWith('image/')) {
    return 'Please choose an image file.'
  }

  if (file.size > maxBoardImageBytes) {
    return 'Please choose an image under 5 MB.'
  }

  return null
}

const validateBoardImageBlob = (blob: Blob) => {
  if (!blob.type.startsWith('image/')) {
    return 'Only image files can be uploaded to the board.'
  }

  if (blob.size > maxBoardImageBytes) {
    return 'Please choose an image under 5 MB.'
  }

  return null
}

const insertBoardImageRecord = async ({
  boardId,
  ownerId,
  excalidrawFileId,
  storagePath,
  publicUrl,
  mimeType,
  fileSize,
}: {
  boardId: string
  ownerId: string
  excalidrawFileId: FileId
  storagePath: string
  publicUrl: string
  mimeType: string
  fileSize: number
}) => {
  const client = requireSupabase()
  const { data, error } = await client
    .from('board_images')
    .insert({
      board_id: boardId,
      owner_id: ownerId,
      excalidraw_file_id: excalidrawFileId,
      storage_path: storagePath,
      public_url: publicUrl,
      mime_type: mimeType,
      file_size: fileSize,
    })
    .select(boardImageSelectColumns)
    .single()

  if (error) {
    throw new Error(`Could not save board image metadata: ${error.message}`)
  }

  return data as BoardImageRecord
}

const uploadImageBlob = async ({
  boardId,
  ownerId,
  excalidrawFileId,
  blob,
  filename,
}: {
  boardId: string
  ownerId: string
  excalidrawFileId: FileId
  blob: Blob
  filename: string
}): Promise<UploadedBoardImage> => {
  const client = await requireMatchingOwner(ownerId)
  const validationError = validateBoardImageBlob(blob)

  if (validationError) {
    throw new Error(validationError)
  }

  const safeFilename = sanitizeFilename(filename)
  const storagePath = `${ownerId}/${boardId}/${Date.now()}-${safeFilename}`
  const { error } = await client.storage.from(boardImagesBucket).upload(storagePath, blob, {
    contentType: blob.type,
    upsert: false,
  })

  if (error) {
    throw new Error(`Image upload failed: ${error.message}`)
  }

  const { data } = client.storage.from(boardImagesBucket).getPublicUrl(storagePath)

  if (!data.publicUrl) {
    throw new Error('Image uploaded, but no public URL was returned.')
  }

  return {
    record: await insertBoardImageRecord({
      boardId,
      ownerId,
      excalidrawFileId,
      storagePath,
      publicUrl: data.publicUrl,
      mimeType: blob.type,
      fileSize: blob.size,
    }),
    storagePath,
    publicUrl: data.publicUrl,
  }
}

export const uploadBoardImage = async ({
  boardId,
  ownerId,
  file,
  excalidrawFileId,
}: UploadBoardImageParams): Promise<UploadedBoardImage> => {
  const validationError = validateBoardImageFile(file)

  if (validationError) {
    throw new Error(validationError)
  }

  return uploadImageBlob({
    boardId,
    ownerId,
    excalidrawFileId,
    blob: file,
    filename: file.name,
  })
}

export const uploadBoardImageData = async ({
  boardId,
  ownerId,
  excalidrawFileId,
  dataURL,
  mimeType,
}: UploadBoardImageDataParams): Promise<UploadedBoardImage> => {
  const blob = await dataUrlToBlob(dataURL, mimeType)

  return uploadImageBlob({
    boardId,
    ownerId,
    excalidrawFileId,
    blob,
    filename: `${excalidrawFileId}.${mimeTypeToExtension(blob.type || mimeType)}`,
  })
}

export const listBoardImages = async (boardId: string) => {
  const client = requireSupabase()
  const { data, error } = await client
    .from('board_images')
    .select(boardImageSelectColumns)
    .eq('board_id', boardId)

  if (error) {
    throw new Error(`Could not load board image metadata: ${error.message}`)
  }

  return (data ?? []) as BoardImageRecord[]
}

export const fetchBoardImageDataUrl = async (image: BoardImageRecord) => {
  const response = await fetch(image.public_url)

  if (!response.ok) {
    throw new Error(`Could not restore board image "${image.excalidraw_file_id}" from Storage.`)
  }

  const blob = await response.blob()
  const validationError = validateBoardImageBlob(blob)

  if (validationError) {
    throw new Error(validationError)
  }

  return readBlobAsDataUrl(blob)
}
