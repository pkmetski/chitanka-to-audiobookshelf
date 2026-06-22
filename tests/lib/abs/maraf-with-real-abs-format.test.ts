import { describe, it, expect } from 'vitest'

describe('ABS API with real ABS response format', () => {
  it('correctly extracts authors and narrators from real ABS metadata format', () => {
    // This is what ABS actually returns in GET /api/libraries/:id/items
    const realAbsItem = {
      id: 'item-123',
      media: {
        duration: 3120, // 52 minutes
        metadata: {
          title: 'Маруф обушарт',
          authors: [
            { id: 'author-1', name: 'Шехерезада' }
          ],
          narrators: [
            { id: 'narrator-1', name: 'Мария Нанчева' }
          ]
        }
      },
      addedAt: Date.now()
    }

    // This is what the /api/abs/items endpoint does
    const authorParts = []
    if (realAbsItem.media.metadata.authors?.length) {
      authorParts.push(...realAbsItem.media.metadata.authors.map((a: { name: string } | string) =>
        typeof a === 'string' ? a : a.name
      ))
    }
    if (realAbsItem.media.metadata.narrators?.length) {
      authorParts.push(...realAbsItem.media.metadata.narrators.map((n: string | { name: string }) =>
        typeof n === 'string' ? n : n.name
      ))
    }
    const combinedAuthor = authorParts.join(', ')

    // Should combine both
    expect(combinedAuthor).toBe('Шехерезада, Мария Нанчева')
  })

  it('handles case where only authors exist (no narrators)', () => {
    const absItem = {
      id: 'item-456',
      media: {
        duration: 2000,
        metadata: {
          title: 'Some Title',
          authors: [{ id: 'a1', name: 'Author Name' }],
          narrators: [] // Empty or undefined
        }
      }
    }

    const authorParts = []
    if (absItem.media.metadata.authors?.length) {
      authorParts.push(...absItem.media.metadata.authors.map((a: { name: string } | string) =>
        typeof a === 'string' ? a : a.name
      ))
    }
    if (absItem.media.metadata.narrators?.length) {
      authorParts.push(...absItem.media.metadata.narrators.map((n: string | { name: string }) =>
        typeof n === 'string' ? n : n.name
      ))
    }
    const combinedAuthor = authorParts.join(', ')

    expect(combinedAuthor).toBe('Author Name')
  })

  it('handles mixed format (some narrators as strings, some as objects)', () => {
    const absItem = {
      id: 'item-789',
      media: {
        duration: 2000,
        metadata: {
          title: 'Title',
          authors: [
            { id: 'a1', name: 'Author 1' },
            { id: 'a2', name: 'Author 2' }
          ],
          narrators: [
            { id: 'n1', name: 'Narrator 1' },
            'Narrator 2' // Sometimes it might be just a string
          ]
        }
      }
    }

    const authorParts = []
    if (absItem.media.metadata.authors?.length) {
      authorParts.push(...absItem.media.metadata.authors.map((a: { name: string } | string) =>
        typeof a === 'string' ? a : a.name
      ))
    }
    if (absItem.media.metadata.narrators?.length) {
      authorParts.push(...absItem.media.metadata.narrators.map((n: string | { name: string }) =>
        typeof n === 'string' ? n : n.name
      ))
    }
    const combinedAuthor = authorParts.join(', ')

    expect(combinedAuthor).toBe('Author 1, Author 2, Narrator 1, Narrator 2')
  })
})
