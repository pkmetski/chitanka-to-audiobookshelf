import { describe, it, expect, vi, beforeEach } from 'vitest'
import { EventEmitter } from 'events'

// Mock 'fs/promises' so readFile does not touch the filesystem
vi.mock('fs/promises', () => ({
  readFile: vi.fn(() => Promise.resolve(Buffer.from('fake-file-content'))),
}))

// Mock node:http so postMultipart does not open real sockets
vi.mock('http', () => ({ request: vi.fn() }))

import { request as httpRequest } from 'http'
import { fetchAbsLibraries, uploadToAbs, setAbsCoverFromUrl, findNewLibraryItem } from '@/lib/abs/client'

const ABS_URL = 'http://localhost:13378'
const TOKEN = 'test-token'

function mockHttpUpload(statusCode: number, body: string) {
  const req = Object.assign(new EventEmitter(), { write: vi.fn(), end: vi.fn() })
  vi.mocked(httpRequest).mockImplementationOnce((_opts: unknown, cb: unknown) => {
    const res = Object.assign(new EventEmitter(), { statusCode })
    ;(cb as (r: unknown) => void)(res)
    setImmediate(() => {
      res.emit('data', Buffer.from(body))
      res.emit('end')
    })
    return req as ReturnType<typeof httpRequest>
  })
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn())
})

describe('fetchAbsLibraries', () => {
  it('returns an array of libraries', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({ libraries: [{ id: 'lib1', name: 'Books', mediaType: 'book' }] }),
        { status: 200 }
      )
    )
    const libs = await fetchAbsLibraries(ABS_URL, TOKEN)
    expect(libs).toEqual([{ id: 'lib1', name: 'Books', mediaType: 'book' }])
  })

  it('sends the Authorization header', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ libraries: [] }), { status: 200 })
    )
    await fetchAbsLibraries(ABS_URL, TOKEN)
    expect(fetch).toHaveBeenCalledWith(
      `${ABS_URL}/api/libraries`,
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: `Bearer ${TOKEN}` }),
      })
    )
  })

  it('throws on non-200 response', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response('', { status: 401 }))
    await expect(fetchAbsLibraries(ABS_URL, TOKEN)).rejects.toThrow()
  })
})

describe('uploadToAbs', () => {
  it('resolves with empty id on success', async () => {
    // fetch: fetchAbsLibraries (called internally to get folderId)
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({ libraries: [{ id: 'lib1', name: 'Books', mediaType: 'book', folders: [{ id: 'folder1', fullPath: '/books' }] }] }),
        { status: 200 }
      )
    )
    // http.request: the actual multipart upload
    mockHttpUpload(200, 'OK')

    const result = await uploadToAbs(ABS_URL, TOKEN, 'lib1', [{ path: '/tmp/book.epub', name: 'book.epub' }], {
      title: 'Test Book',
      authorName: 'Test Author',
    })
    expect(result.id).toBe('')
  })

  it('throws when ABS returns non-200', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({ libraries: [{ id: 'lib1', name: 'Books', mediaType: 'book', folders: [{ id: 'folder1', fullPath: '/books' }] }] }),
        { status: 200 }
      )
    )
    mockHttpUpload(500, 'Internal Server Error')

    await expect(
      uploadToAbs(ABS_URL, TOKEN, 'lib1', [{ path: '/tmp/book.epub', name: 'book.epub' }], {
        title: 'Test Book',
        authorName: 'Test Author',
      })
    ).rejects.toThrow('ABS upload failed 500')
  })
})

describe('findNewLibraryItem', () => {
  it('returns item whose addedAt is after the given timestamp', async () => {
    const now = Date.now()
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({ results: [
          { id: 'new-item', addedAt: now + 1000, media: { metadata: { title: 'New Book' } } },
          { id: 'old-item', addedAt: now - 5000, media: { metadata: { title: 'Old Book' } } },
        ] }),
        { status: 200 }
      )
    )
    const item = await findNewLibraryItem('http://localhost:13378', 'tok', 'lib1', now)
    expect(item?.id).toBe('new-item')
  })

  it('returns null when no items are newer than the timestamp', async () => {
    const now = Date.now()
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({ results: [
          { id: 'old-item', addedAt: now - 5000, media: { metadata: { title: 'Old Book' } } },
        ] }),
        { status: 200 }
      )
    )
    const item = await findNewLibraryItem('http://localhost:13378', 'tok', 'lib1', now)
    expect(item).toBeNull()
  })
})

describe('setAbsCoverFromUrl', () => {
  it('resolves without throwing on success', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response('{}', { status: 200 }))
    await expect(
      setAbsCoverFromUrl(ABS_URL, TOKEN, 'item-abc', 'https://example.com/cover.jpg')
    ).resolves.not.toThrow()
  })
})
