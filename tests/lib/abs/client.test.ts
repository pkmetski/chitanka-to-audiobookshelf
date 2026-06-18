import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock 'fs/promises' so readFile does not touch the filesystem
vi.mock('fs/promises', () => ({
  readFile: vi.fn(() => Promise.resolve(Buffer.from('fake-file-content'))),
}))

import { fetchAbsLibraries, uploadToAbs, setAbsCoverFromUrl } from '@/lib/abs/client'

const ABS_URL = 'http://localhost:13378'
const TOKEN = 'test-token'

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
  it('returns the new item id', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ id: 'item-abc' }), { status: 200 })
    )
    const result = await uploadToAbs(ABS_URL, TOKEN, 'lib1', 'folder1', '/tmp/book.epub', 'book.epub', {
      title: 'Test Book',
      authorName: 'Test Author',
    })
    expect(result.id).toBe('item-abc')
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
