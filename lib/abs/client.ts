import { readFile } from 'fs/promises'
import { randomBytes } from 'crypto'
import { request as httpRequest } from 'http'
import { request as httpsRequest } from 'https'
import type { AbsLibrary, AbsLibraryItem, AbsUploadMetadata, AbsUploadResult } from './types'

type MultipartEntry =
  | { kind: 'field'; name: string; value: string }
  | { kind: 'file'; name: string; filename: string; contentType: string; buffer: Buffer }

// Uses Node.js http module (not fetch) so we can read the response body even when
// ABS closes the connection before we finish writing the request body. Builds the
// multipart body manually to avoid relying on how Node.js serialises FormData.
async function postMultipart(
  url: string,
  authToken: string,
  entries: MultipartEntry[],
): Promise<{ status: number; body: string }> {
  const boundary = 'ABS' + randomBytes(16).toString('hex')
  const CRLF = '\r\n'
  const parts: Buffer[] = []
  for (const entry of entries) {
    if (entry.kind === 'field') {
      parts.push(Buffer.from(
        `--${boundary}${CRLF}` +
        `Content-Disposition: form-data; name="${entry.name}"${CRLF}` +
        CRLF +
        `${entry.value}${CRLF}`,
        'utf8',
      ))
    } else {
      // Raw UTF-8 bytes in filename= — same as what Node.js FormData sends.
      // RFC 5987 (filename*=) is not reliably supported by all busboy versions.
      parts.push(Buffer.from(
        `--${boundary}${CRLF}` +
        `Content-Disposition: form-data; name="${entry.name}"; filename="${entry.filename}"${CRLF}` +
        `Content-Type: ${entry.contentType}${CRLF}` +
        CRLF,
        'utf8',
      ))
      parts.push(entry.buffer)
      parts.push(Buffer.from(CRLF, 'utf8'))
    }
  }
  parts.push(Buffer.from(`--${boundary}--${CRLF}`, 'utf8'))

  const bodyBuf = Buffer.concat(parts)
  const contentType = `multipart/form-data; boundary=${boundary}`

  return new Promise((resolve, reject) => {
    // responseStarted is set as soon as ABS sends response headers. After that,
    // socket write errors (ABS closed connection while we flush the upload body)
    // are expected and ignored — res 'end' will still resolve the promise.
    let responseStarted = false

    const parsed = new URL(url)
    const reqFn = parsed.protocol === 'https:' ? httpsRequest : httpRequest
    const req = reqFn(
      {
        hostname: parsed.hostname,
        port: parsed.port || (parsed.protocol === 'https:' ? '443' : '80'),
        path: parsed.pathname + parsed.search,
        method: 'POST',
        headers: {
          Authorization: `Bearer ${authToken}`,
          'Content-Type': contentType,
          'Content-Length': bodyBuf.length,
        },
      },
      (res) => {
        responseStarted = true
        const chunks: Buffer[] = []
        res.on('data', (chunk: Buffer) => chunks.push(chunk))
        res.on('end', () => {
          const body = Buffer.concat(chunks).toString()
          console.log(`[abs upload] status=${res.statusCode} body=${body.slice(0, 500)}`)
          resolve({ status: res.statusCode ?? 0, body })
        })
        res.on('error', () => {
          // Response stream errored (truncated) — resolve with what we have.
          const body = Buffer.concat(chunks).toString()
          console.log(`[abs upload] status=${res.statusCode} body(truncated)=${body.slice(0, 500)}`)
          resolve({ status: res.statusCode ?? 0, body })
        })
      },
    )
    req.on('error', (err: Error) => {
      // After ABS sends its response it closes the TCP connection, which causes
      // a socket write error on our side while we're still flushing the body.
      // If response headers already arrived, ignore the write-side error.
      if (!responseStarted) reject(err)
    })
    req.write(bodyBuf)
    req.end()
  })
}

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

export async function fetchAbsLibraryItems(
  absUrl: string,
  token: string,
  libraryId: string,
  limit = 1000
): Promise<AbsLibraryItem[]> {
  try {
    const res = await fetch(
      `${normalizeUrl(absUrl)}/api/libraries/${libraryId}/items?limit=${limit}`,
      { headers: authHeaders(token) }
    )
    if (!res.ok) return []
    const data = await res.json()
    return data.results ?? data.items ?? []
  } catch {
    return []
  }
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
  files: Array<{ path: string; name: string }>,
  metadata: AbsUploadMetadata
): Promise<AbsUploadResult> {
  const libraries = await fetchAbsLibraries(absUrl, token)
  const library = libraries.find(l => l.id === libraryId)
  const folderId = library?.folders?.[0]?.id
  if (!folderId) throw new Error(`No folder found for library ${libraryId}`)

  const entries: MultipartEntry[] = []
  let totalBytes = 0
  for (const file of files) {
    const buffer = await readFile(file.path)
    totalBytes += buffer.length
    const mimeType = file.name.endsWith('.epub') ? 'application/epub+zip' : 'audio/mpeg'
    entries.push({ kind: 'file', name: 'files', filename: file.name, contentType: mimeType, buffer })
  }
  entries.push({ kind: 'field', name: 'library', value: libraryId })
  entries.push({ kind: 'field', name: 'folder', value: folderId })
  entries.push({ kind: 'field', name: 'title', value: metadata.title })
  entries.push({ kind: 'field', name: 'author', value: metadata.authorName })
  console.log(`[abs upload] ${files.length} file(s), ${totalBytes} bytes → ${normalizeUrl(absUrl)}/api/upload`)
  const res = await postMultipart(`${normalizeUrl(absUrl)}/api/upload`, token, entries)
  if (res.status !== 200) {
    throw new Error(`ABS upload failed ${res.status}: ${res.body.slice(0, 500)}`)
  }
  return { id: '' }
}

/**
 * Find all library items whose addedAt timestamp (ms) is after the given
 * upload-start timestamp. Used to recover item IDs after POST /api/upload,
 * which returns no JSON body. Fetches enough items to cover expectedCount.
 *
 * ABS 2.35.1 returns addedAt in milliseconds.
 */
export async function findNewLibraryItems(
  absUrl: string,
  token: string,
  libraryId: string,
  afterMs: number,
  expectedCount: number = 1
): Promise<AbsLibraryItem[]> {
  const limit = Math.max(expectedCount + 2, 10)
  const res = await fetch(
    `${normalizeUrl(absUrl)}/api/libraries/${libraryId}/items?limit=${limit}&sort=addedAt&desc=1`,
    { headers: authHeaders(token) }
  )
  if (!res.ok) return []
  const data = await res.json()
  const items: AbsLibraryItem[] = data.results ?? data.items ?? []
  return items.filter(item => (item.addedAt ?? 0) > afterMs)
}

/** Convenience wrapper returning only the first matching item. */
export async function findNewLibraryItem(
  absUrl: string,
  token: string,
  libraryId: string,
  afterMs: number
): Promise<AbsLibraryItem | null> {
  const results = await findNewLibraryItems(absUrl, token, libraryId, afterMs, 1)
  return results[0] ?? null
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

  // ABS ignores `authorName` when the item already has an author set via ID3 scan;
  // `authors: [{name}]` always wins. Split comma/ampersand-separated names.
  const authorObjects = metadata.authorName
    .split(/\s*[,&]\s*/)
    .map(n => n.trim())
    .filter(Boolean)
    .map(name => ({ name }))

  const metadataPayload: Record<string, unknown> = {
    title: metadata.title,
    authors: authorObjects,
    ...(metadata.narrators?.length && { narrators: metadata.narrators }),
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
