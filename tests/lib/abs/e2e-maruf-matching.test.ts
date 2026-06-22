import { describe, it, expect } from 'vitest'
import { buildAbsTitleMap, isExistingInAbs, parseDurationMins } from '@/lib/abs/matching'

/**
 * End-to-end test: Simulates exact flow from ABS API to matching
 *
 * 1. ABS returns item with authors + narrators arrays (real format)
 * 2. API endpoint combines them into single author field
 * 3. Matching checks Gramofonche item against combined author field
 * 4. Should return MATCH
 */
describe('E2E: Маруф обушарт matching (real ABS format → API → matching)', () => {
  it('flow: real ABS data → API transformation → matching succeeds', () => {
    // Step 1: Real ABS GET response for "Маруф обушарт"
    const realAbsResponse = [
      {
        title: 'Маруф обушарт',
        authors: [{ id: 'auth-123', name: 'Шехерезада' }],
        narrators: [{ id: 'narr-456', name: 'Мария Нанчева' }],
        durationSecs: 3120
      }
    ]

    // Step 2: API transformation (what /api/abs/items does)
    const apiTransformed = realAbsResponse.map(item => {
      const authorParts = []
      if (item.authors?.length) {
        authorParts.push(...item.authors.map((a: { name: string } | string) =>
          typeof a === 'string' ? a : a.name
        ))
      }
      if (item.narrators?.length) {
        authorParts.push(...item.narrators.map((n: string | { name: string }) =>
          typeof n === 'string' ? n : n.name
        ))
      }
      return {
        title: item.title,
        author: authorParts.join(', '),
        durationSecs: item.durationSecs
      }
    })

    expect(apiTransformed[0].author).toBe('Шехерезада, Мария Нанчева')

    // Step 3: Build matching map from transformed data
    const absMap = buildAbsTitleMap(apiTransformed)

    // Step 4: Gramofonche search result (split authors)
    const gramofoncheTitle = 'Маруф обушарт'
    const gramofoncheAuthors = ['Шехерезада', 'реж. Мария Нанчева']
    const gramofonfcheDuration = 52

    // Step 5: Matching
    const result = isExistingInAbs(
      gramofoncheTitle,
      gramofoncheAuthors,
      absMap,
      gramofonfcheDuration
    )

    expect(result).toBe(true)
  })

  it('also works when Gramofonche title has different spelling', () => {
    // ABS might have different variant of title
    const realAbsResponse = [
      {
        title: 'Маруф обущарят', // Different spelling variant
        authors: [{ id: 'auth-123', name: 'Шехерезада' }],
        narrators: [{ id: 'narr-456', name: 'Мария Нанчева' }],
        durationSecs: 3120
      }
    ]

    // Transform
    const apiTransformed = realAbsResponse.map(item => {
      const authorParts = []
      if (item.authors?.length) {
        authorParts.push(...item.authors.map((a: { name: string } | string) =>
          typeof a === 'string' ? a : a.name
        ))
      }
      if (item.narrators?.length) {
        authorParts.push(...item.narrators.map((n: string | { name: string }) =>
          typeof n === 'string' ? n : n.name
        ))
      }
      return {
        title: item.title,
        author: authorParts.join(', '),
        durationSecs: item.durationSecs
      }
    })

    const absMap = buildAbsTitleMap(apiTransformed)

    // Gramofonche shows different spelling
    const result = isExistingInAbs(
      'Маруф обушарт',
      ['Шехерезада', 'реж. Мария Нанчева'],
      absMap,
      52
    )

    expect(result).toBe(true) // Should still match with fuzzy title matching
  })
})
