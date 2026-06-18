import { createReadStream } from 'fs'
import FormData from 'form-data'
import type { AbsLibrary, AbsLibraryItem, AbsUploadMetadata, AbsUploadResult } from './types'

function authHeaders(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` }
}

export async function fetchAbsLibraries(absUrl: string, token: string): Promise<AbsLibrary[]> {
  const res = await fetch(`${absUrl}/api/libraries`, {
    headers: authHeaders(token),
  })
  if (!res.ok) throw new Error(`ABS /api/libraries failed: ${res.status}`)
  const data = await res.json()
  return data.libraries as AbsLibrary[]
}

/**
 * Upload an audio file to Audiobookshelf via POST /api/upload.
 *
 * ABS API field names (from source code research):
 *   - library  : libraryId
 *   - folder   : folderId (ABS requires a folder within the library)
 *   - title    : book title
 *   - author   : author name (ABS uses "author", not "authorName")
 *   - series   : series name (not exposed in our metadata type)
 *
 * Note: ABS /api/upload returns HTTP 200 with no JSON body on success.
 * If the server is configured to return an item ID (some versions do), we
 * parse it; otherwise we return a placeholder that callers should treat as
 * "upload accepted but ID unknown until the library is re-scanned."
 */
export async function uploadToAbs(
  absUrl: string,
  token: string,
  libraryId: string,
  filePath: string,
  filename: string,
  metadata: AbsUploadMetadata
): Promise<AbsUploadResult> {
  const form = new FormData()
  form.append('files', createReadStream(filePath), { filename })
  form.append('library', libraryId)
  form.append('folder', libraryId) // Use libraryId as folderId fallback; callers can override via a wrapper
  form.append('title', metadata.title)
  form.append('author', metadata.authorName) // ABS uses "author" not "authorName"
  if (metadata.narratorName) form.append('narrator', metadata.narratorName)
  if (metadata.description) form.append('description', metadata.description)
  if (metadata.publishedYear) form.append('publishedYear', metadata.publishedYear)
  if (metadata.language) form.append('language', metadata.language)
  if (metadata.genres?.length) form.append('genres', metadata.genres.join(','))

  const res = await fetch(`${absUrl}/api/upload`, {
    method: 'POST',
    headers: { ...authHeaders(token), ...form.getHeaders() },
    body: form as unknown as BodyInit,
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`ABS upload failed ${res.status}: ${text}`)
  }

  // ABS /api/upload returns sendStatus(200) — no JSON body in the standard implementation.
  // Some deployments or future versions may return { id } or { libraryItemId }.
  // We try to parse JSON; if the body is empty or non-JSON we return a sentinel value.
  const text = await res.text()
  if (text) {
    try {
      const data = JSON.parse(text)
      return { id: data.id ?? data.libraryItemId ?? data.itemId ?? '' }
    } catch {
      // fall through
    }
  }
  return { id: '' }
}

/**
 * Find the most recently added item in a library that matches the given title.
 *
 * ABS API: GET /api/libraries/:id/items?limit=10&sort=addedAt&desc=1
 * Response: { results: AbsLibraryItem[], ... }
 *
 * Used to recover the item ID after an upload, since POST /api/upload returns
 * no JSON body (sendStatus(200)).
 */
export async function findRecentLibraryItem(
  absUrl: string,
  token: string,
  libraryId: string,
  title: string
): Promise<AbsLibraryItem | null> {
  const res = await fetch(
    `${absUrl}/api/libraries/${libraryId}/items?limit=10&sort=addedAt&desc=1`,
    { headers: authHeaders(token) }
  )
  if (!res.ok) return null
  const data = await res.json()
  const items: AbsLibraryItem[] = data.results ?? data.items ?? []
  const now = Math.floor(Date.now() / 1000)
  // Normalise for case-insensitive comparison
  const normalised = title.trim().toLowerCase()
  return items
    .filter(item => now - (item.addedAt ?? 0) < 60)
    .find(item => item.media?.metadata?.title?.trim().toLowerCase() === normalised) ?? null
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
  const res = await fetch(`${absUrl}/api/items/${itemId}/cover`, {
    method: 'POST',
    headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: coverUrl }),
  })
  if (!res.ok) throw new Error(`ABS cover upload failed: ${res.status}`)
}
