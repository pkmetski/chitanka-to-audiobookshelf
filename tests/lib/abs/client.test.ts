import { describe, it, expect, vi, beforeEach } from 'vitest'
import { EventEmitter } from 'events'

// Mock 'fs/promises' so readFile does not touch the filesystem
vi.mock('fs/promises', () => ({
  readFile: vi.fn(() => Promise.resolve(Buffer.from('fake-file-content'))),
}))

// Mock node:http so postMultipart does not open real sockets
vi.mock('http', () => ({ request: vi.fn() }))

import { request as httpRequest } from 'http'
import { fetchAbsLibraries, uploadToAbs, setAbsCoverFromUrl, findNewLibraryItem, scanAbsLibrary, updateAbsItemMetadata, findNewLibraryItems } from '@/lib/abs/client'

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
  vi.mocked(httpRequest).mockReset()
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

// ---------------------------------------------------------------------------
// New test suites
// ---------------------------------------------------------------------------

describe('uploadToAbs — multi-file sequential', () => {
  /** Shared library fetch mock used by all uploadToAbs tests */
  function mockLibraryFetch() {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          libraries: [
            {
              id: 'lib1',
              name: 'Books',
              mediaType: 'book',
              folders: [{ id: 'folder1', fullPath: '/books' }],
            },
          ],
        }),
        { status: 200 }
      )
    )
  }

  it('makes exactly 3 http.request calls when 3 files are uploaded', async () => {
    mockLibraryFetch()
    mockHttpUpload(200, 'OK')
    mockHttpUpload(200, 'OK')
    mockHttpUpload(200, 'OK')

    await uploadToAbs(
      ABS_URL,
      TOKEN,
      'lib1',
      [
        { path: '/tmp/a.mp3', name: 'a.mp3' },
        { path: '/tmp/b.mp3', name: 'b.mp3' },
        { path: '/tmp/c.mp3', name: 'c.mp3' },
      ],
      { title: 'Test Book', authorName: 'Test Author' }
    )

    expect(vi.mocked(httpRequest).mock.calls).toHaveLength(3)
  })

  it('throws on 2nd-file failure and makes exactly 2 http.request calls', async () => {
    mockLibraryFetch()
    mockHttpUpload(200, 'OK')
    mockHttpUpload(500, 'Internal Server Error')

    await expect(
      uploadToAbs(
        ABS_URL,
        TOKEN,
        'lib1',
        [
          { path: '/tmp/a.mp3', name: 'a.mp3' },
          { path: '/tmp/b.mp3', name: 'b.mp3' },
          { path: '/tmp/c.mp3', name: 'c.mp3' },
        ],
        { title: 'Test Book', authorName: 'Test Author' }
      )
    ).rejects.toThrow('ABS upload failed 500')

    // 3rd file must never have been attempted
    expect(vi.mocked(httpRequest).mock.calls).toHaveLength(2)
  })

  it('includes each file\'s filename in the Content-Disposition header of its request body', async () => {
    mockLibraryFetch()
    mockHttpUpload(200, 'OK')
    mockHttpUpload(200, 'OK')

    await uploadToAbs(
      ABS_URL,
      TOKEN,
      'lib1',
      [
        { path: '/tmp/chapter-01.mp3', name: 'chapter-01.mp3' },
        { path: '/tmp/chapter-02.mp3', name: 'chapter-02.mp3' },
      ],
      { title: 'Test Book', authorName: 'Test Author' }
    )

    const calls = vi.mocked(httpRequest).mock.results
    // Each mock returns a req object whose write() was called with the multipart body
    const req0 = calls[0].value as { write: ReturnType<typeof vi.fn> }
    const req1 = calls[1].value as { write: ReturnType<typeof vi.fn> }

    const body0: string = req0.write.mock.calls[0][0].toString()
    const body1: string = req1.write.mock.calls[0][0].toString()

    expect(body0).toContain('filename="chapter-01.mp3"')
    expect(body1).toContain('filename="chapter-02.mp3"')
  })
})

describe('scanAbsLibrary', () => {
  it('calls POST /api/libraries/:id/scan', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response('', { status: 200 }))

    await scanAbsLibrary(ABS_URL, TOKEN, 'lib1')

    expect(fetch).toHaveBeenCalledWith(
      `${ABS_URL}/api/libraries/lib1/scan`,
      expect.objectContaining({ method: 'POST' })
    )
  })

  it('does NOT throw when fetch rejects (network error)', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('ECONNREFUSED'))

    await expect(scanAbsLibrary(ABS_URL, TOKEN, 'lib1')).resolves.toBeUndefined()
  })

  it('does NOT throw on non-200 response', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response('', { status: 503 }))

    await expect(scanAbsLibrary(ABS_URL, TOKEN, 'lib1')).resolves.toBeUndefined()
  })
})

describe('updateAbsItemMetadata', () => {
  it('sends title and authors as an array of { name } objects', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response('{}', { status: 200 }))

    await updateAbsItemMetadata(ABS_URL, TOKEN, 'item-1', {
      title: 'My Book',
      authorName: 'Jane Doe',
    })

    const [, init] = vi.mocked(fetch).mock.calls[0]
    const body = JSON.parse((init as RequestInit).body as string)
    expect(body.metadata.title).toBe('My Book')
    expect(body.metadata.authors).toEqual([{ name: 'Jane Doe' }])
  })

  it('splits "Author A, Author B" into 2 author objects', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response('{}', { status: 200 }))

    await updateAbsItemMetadata(ABS_URL, TOKEN, 'item-1', {
      title: 'My Book',
      authorName: 'Author A, Author B',
    })

    const [, init] = vi.mocked(fetch).mock.calls[0]
    const body = JSON.parse((init as RequestInit).body as string)
    expect(body.metadata.authors).toEqual([{ name: 'Author A' }, { name: 'Author B' }])
  })

  it('includes series in payload when provided', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response('{}', { status: 200 }))

    await updateAbsItemMetadata(ABS_URL, TOKEN, 'item-1', {
      title: 'My Book',
      authorName: 'Jane Doe',
      series: { name: 'The Series', sequence: '2' },
    })

    const [, init] = vi.mocked(fetch).mock.calls[0]
    const body = JSON.parse((init as RequestInit).body as string)
    expect(body.metadata.series).toEqual([{ name: 'The Series', sequence: '2' }])
  })

  it('throws on non-200 response', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response('Forbidden', { status: 403 }))

    await expect(
      updateAbsItemMetadata(ABS_URL, TOKEN, 'item-1', {
        title: 'My Book',
        authorName: 'Jane Doe',
      })
    ).rejects.toThrow('ABS metadata update failed: 403')
  })
})

describe('findNewLibraryItems', () => {
  it('falls back to data.items when data.results is absent', async () => {
    const now = Date.now()
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          items: [
            { id: 'item-from-items', addedAt: now + 1000, media: { metadata: { title: 'New' } } },
          ],
        }),
        { status: 200 }
      )
    )

    const items = await findNewLibraryItems(ABS_URL, TOKEN, 'lib1', now)
    expect(items).toHaveLength(1)
    expect(items[0].id).toBe('item-from-items')
  })

  it('throws when fetch rejects (no swallowing in findNewLibraryItems)', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('Network failure'))

    await expect(findNewLibraryItems(ABS_URL, TOKEN, 'lib1', Date.now())).rejects.toThrow('Network failure')
  })

  it('returns [] on non-200 response', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response('', { status: 500 }))

    await expect(findNewLibraryItems(ABS_URL, TOKEN, 'lib1', Date.now())).resolves.toEqual([])
  })
})
