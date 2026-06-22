import { describe, it, expect } from 'vitest'
import { buildAbsTitleMap, isExistingInAbs, parseDurationMins } from '@/lib/abs/matching'

describe('Маруф обушарт - Reported Issue', () => {
  it('matches Маруф when ABS has author+narrators combined', () => {
    // Simulate what ABS stores after uploading Gramofonche item
    // with the new code that combines author+narrators
    const absItems = [
      {
        title: 'Маруф обушарт',
        author: 'Шехерезада, Мария Нанчева', // Combined author + narrators
        durationSecs: 3120 // 52 minutes
      }
    ]
    const map = buildAbsTitleMap(absItems)

    // Gramofonche search result (from listing page)
    const result = isExistingInAbs(
      'Маруф обушарт',
      ['Шехерезада', 'реж. Мария Нанчева'],
      map,
      52
    )

    expect(result).toBe(true)
  })

  it('matches with fuzzy title when spellings differ', () => {
    // ABS might have different spelling or it was uploaded earlier with different title
    const absItems = [
      {
        title: 'Маруф обущарят', // Different spelling variant
        author: 'Шехерезада, Мария Нанчева',
        durationSecs: 3120
      }
    ]
    const map = buildAbsTitleMap(absItems)

    const result = isExistingInAbs(
      'Маруф обушарт',
      ['Шехерезада', 'реж. Мария Нанчева'],
      map,
      52
    )

    expect(result).toBe(true)
  })

  it('matches Старата костенурка when author is combined', () => {
    const absItems = [
      {
        title: 'Старата костенурка разказва',
        author: 'Индийнейски Приказки, Иван Андонов', // Combined
        durationSecs: 2760 // 46 minutes
      }
    ]
    const map = buildAbsTitleMap(absItems)

    const result = isExistingInAbs(
      'Старата костенурка разказва',
      ['Индийнейски Приказки', 'реж. Иван Андонов'],
      map,
      46
    )

    expect(result).toBe(true)
  })
})
