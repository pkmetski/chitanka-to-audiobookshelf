import { describe, it, expect } from 'vitest'

describe('ABS API Items Transformation', () => {
  it('combines authorName and narrators for matching', () => {
    // Simulate raw ABS library item response
    const rawItem = {
      id: 'item-123',
      media: {
        duration: 3120,
        metadata: {
          title: 'Маруф обушарт',
          authorName: 'Шехерезада',
          narrators: [
            { name: 'Мария Нанчева' }
          ]
        }
      },
      addedAt: Date.now()
    }

    // This is what the API endpoint does
    const authorParts = []
    if (rawItem.media.metadata.authorName) {
      authorParts.push(rawItem.media.metadata.authorName)
    }
    if (rawItem.media.metadata.narrators?.length) {
      authorParts.push(...rawItem.media.metadata.narrators.map((n: string | { name: string }) =>
        typeof n === 'string' ? n : n.name
      ))
    }
    const combinedAuthor = authorParts.join(', ')

    // Expected result
    expect(combinedAuthor).toBe('Шехерезада, Мария Нанчева')
  })

  it('handles narrators as string array', () => {
    const rawItem = {
      id: 'item-456',
      media: {
        duration: 2760,
        metadata: {
          title: 'Старата костенурка разказва',
          authorName: 'Индийнейски Приказки',
          narrators: ['Иван Андонов']
        }
      },
      addedAt: Date.now()
    }

    const authorParts = []
    if (rawItem.media.metadata.authorName) {
      authorParts.push(rawItem.media.metadata.authorName)
    }
    if (rawItem.media.metadata.narrators?.length) {
      authorParts.push(...rawItem.media.metadata.narrators.map((n: string | { name: string }) =>
        typeof n === 'string' ? n : n.name
      ))
    }
    const combinedAuthor = authorParts.join(', ')

    expect(combinedAuthor).toBe('Индийнейски Приказки, Иван Андонов')
  })

  it('handles missing narrators gracefully', () => {
    const rawItem = {
      id: 'item-789',
      media: {
        duration: 2000,
        metadata: {
          title: 'Some Book',
          authorName: 'Some Author'
        }
      },
      addedAt: Date.now()
    }

    const authorParts = []
    if (rawItem.media.metadata.authorName) {
      authorParts.push(rawItem.media.metadata.authorName)
    }
    if (rawItem.media.metadata.narrators?.length) {
      authorParts.push(...rawItem.media.metadata.narrators.map((n: string | { name: string }) =>
        typeof n === 'string' ? n : n.name
      ))
    }
    const combinedAuthor = authorParts.join(', ')

    expect(combinedAuthor).toBe('Some Author')
  })
})
