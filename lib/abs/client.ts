import { readFile } from 'fs/promises'
import type { AbsLibrary, AbsLibraryItem, AbsUploadMetadata, AbsUploadResult } from './types'

function normalizeUrl(url: string): string {
  const trimmed = url.trim().replace(/\/+$/, '')
  if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
    return `http://${trimmed}`
  }
  return trimmed
}

function authHeaders(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` }
}

export async function fetchAbsLibraries(absUrl: string, token: string): Promise<AbsLibrary[]> {
  const res = await fetch(`${normalizeUrl(absUrl)}/api/libraries`, {
    headers: authHeaders(token),
  })
  if (!res.ok) throw new Error(`ABS /api/libraries failed: ${res.status}`)
  const data = await res.json()
  return data.libraries as AbsLibrary[]
}

/**
 * Upload a file to Audiobookshelf via POST /api/upload.
 *
 * ABS ignores the form metadata fields (title, author, etc.) and reads them
 * from the file itself (ID3 tags for MP3, OPF for EPUB). A subsequent PATCH
 * to /api/items/:id/media is required to set correct metadata.
 *
 * ABS /api/upload returns HTTP 200 with plain text "OK" — no item ID.
 */
export async function uploadToAbs(
  absUrl: string,
  token: string,
  libraryId: string,
  filePath: string,
  filename: string,
  metadata: AbsUploadMetadata
): Promise<AbsUploadResult> {
  const libraries = await fetchAbsLibraries(absUrl, token)
  const library = libraries.find(l => l.id === libraryId)
  const folderId = library?.folders?.[0]?.id
  if (!folderId) throw new Error(`No folder found for library ${libraryId}`)

  const buffer = await readFile(filePath)
  const mimeType = filename.endsWith('.epub') ? 'application/epub+zip' : 'audio/mpeg'
  const blob = new Blob([buffer], { type: mimeType })

  const form = new FormData()
  form.append('files', blob, filename)
  form.append('library', libraryId)
  form.append('folder', folderId)
  form.append('title', metadata.title)
  form.append('author', metadata.authorName)

  const res = await fetch(`${normalizeUrl(absUrl)}/api/upload`, {
    method: 'POST',
    headers: authHeaders(token),
    body: form,
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`ABS upload failed ${res.status}: ${text}`)
  }
  return { id: '' }
}

/**
 * Find the first library item whose addedAt timestamp (ms) is after the given
 * upload-start timestamp. Used to recover the item ID after POST /api/upload,
 * which returns no JSON body.
 *
 * ABS 2.35.1 returns addedAt in milliseconds.
 */
export async function findNewLibraryItem(
  absUrl: string,
  token: string,
  libraryId: string,
  afterMs: number
): Promise<AbsLibraryItem | null> {
  const res = await fetch(
    `${normalizeUrl(absUrl)}/api/libraries/${libraryId}/items?limit=10&sort=addedAt&desc=1`,
    { headers: authHeaders(token) }
  )
  if (!res.ok) return null
  const data = await res.json()
  const items: AbsLibraryItem[] = data.results ?? data.items ?? []
  return items.find(item => (item.addedAt ?? 0) > afterMs) ?? null
}

/**
 * Trigger a library scan so ABS indexes freshly uploaded files.
 * ABS API: POST /api/libraries/:id/scan — returns immediately, scan runs in background.
 */
export async function scanAbsLibrary(
  absUrl: string,
  token: string,
  libraryId: string
): Promise<void> {
  await fetch(`${normalizeUrl(absUrl)}/api/libraries/${libraryId}/scan`, {
    method: 'POST',
    headers: authHeaders(token),
  })
  // Ignore errors — scan is best-effort
}

/**
 * Update library item metadata via PATCH /api/items/:id/media.
 *
 * Series is handled entirely here (not in the upload form) so ABS creates the
 * series association with the correct sequence in a single operation.
 */
export async function updateAbsItemMetadata(
  absUrl: string,
  token: string,
  itemId: string,
  metadata: AbsUploadMetadata
): Promise<string> {
  const base = normalizeUrl(absUrl)

  const metadataPayload: Record<string, unknown> = {
    title: metadata.title,
    authorName: metadata.authorName,
    ...(metadata.narratorName && { narratorName: metadata.narratorName }),
    ...(metadata.description && { description: metadata.description }),
    ...(metadata.publishedYear && { publishedYear: metadata.publishedYear }),
    ...(metadata.language && { language: metadata.language }),
    ...(metadata.genres?.length && { genres: metadata.genres }),
    ...(metadata.series && { series: [{ name: metadata.series.name, sequence: metadata.series.sequence }] }),
  }

  const res = await fetch(`${base}/api/items/${itemId}/media`, {
    method: 'PATCH',
    headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({ metadata: metadataPayload }),
  })
  const responseText = await res.text()
  if (!res.ok) throw new Error(`ABS metadata update failed: ${res.status}: ${responseText}`)
  return responseText
}

/**
 * Set a cover image on an ABS library item from a remote URL.
 *
 * ABS API: POST /api/items/:id/cover
 * Accepts JSON body { url: string } to download the cover from a remote URL,
 * or multipart { cover: file } to upload bytes directly.
 * Returns { success: true, cover: localPath }.
 */
export async function setAbsCoverFromUrl(
  absUrl: string,
  token: string,
  itemId: string,
  coverUrl: string
): Promise<void> {
  const res = await fetch(`${normalizeUrl(absUrl)}/api/items/${itemId}/cover`, {
    method: 'POST',
    headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: coverUrl }),
  })
  if (!res.ok) throw new Error(`ABS cover upload failed: ${res.status}`)
}
