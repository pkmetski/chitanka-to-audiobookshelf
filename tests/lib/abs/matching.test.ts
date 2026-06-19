import { describe, it, expect } from 'vitest'
import { normalizeTitle, buildAbsTitleSet, isExistingInAbs } from '@/lib/abs/matching'

describe('normalizeTitle', () => {
  it('lowercases', () => {
    expect(normalizeTitle('Аладин')).toBe('аладин')
  })
  it('replaces hyphens with spaces', () => {
    expect(normalizeTitle('Абу-мързеливият')).toBe('абу мързеливият')
  })
  it('strips punctuation', () => {
    expect(normalizeTitle('Аладин и вълшебната лампа (роман)')).toBe('аладин и вълшебната лампа роман')
  })
  it('collapses whitespace', () => {
    expect(normalizeTitle('Аладин  и   лампа')).toBe('аладин и лампа')
  })
})

describe('isExistingInAbs — author-aware', () => {
  it('matches same title+author', () => {
    const set = buildAbsTitleSet([{ title: 'Басни', author: 'Лафонтен' }])
    expect(isExistingInAbs('Басни', ['Лафонтен', 'реж. Антоанета Батулярова'], set)).toBe(true)
  })

  it('rejects same title with different author', () => {
    const set = buildAbsTitleSet([{ title: 'Басни', author: 'Лафонтен' }])
    expect(isExistingInAbs('Басни', ['Алберт Декало', 'реж. Иван Андонов'], set)).toBe(false)
  })

  it('falls back to title-only when ABS item has no author', () => {
    const set = buildAbsTitleSet([{ title: 'Аладин', author: '' }])
    expect(isExistingInAbs('Аладин', ['Some Author'], set)).toBe(true)
  })

  it('falls back to title-only when candidate has no authors', () => {
    const set = buildAbsTitleSet([{ title: 'Аладин', author: '' }])
    expect(isExistingInAbs('Аладин', [], set)).toBe(true)
  })
})

describe('isExistingInAbs — hyphen normalisation', () => {
  it('matches hyphenated candidate against space-separated ABS title', () => {
    const set = buildAbsTitleSet([{ title: 'Абу мързеливият и хубавицата', author: 'Шехерезада' }])
    expect(isExistingInAbs('Абу-мързеливият и хубавицата', ['Шехерезада'], set)).toBe(true)
  })

  it('matches hyphenated ABS title against space-separated candidate', () => {
    const set = buildAbsTitleSet([{ title: 'Абу-мързеливият и хубавицата', author: 'Шехерезада' }])
    expect(isExistingInAbs('Абу мързеливият и хубавицата', ['Шехерезада'], set)).toBe(true)
  })
})

describe('isExistingInAbs — no false positives on partial title overlap', () => {
  it('does NOT match series name against a specific volume in ABS', () => {
    const set = buildAbsTitleSet([{ title: 'Приказните светове на Николай Райнов Книга 7', author: '' }])
    expect(isExistingInAbs('Приказните светове на Николай Райнов', [], set)).toBe(false)
  })

  it('does NOT match specific volume against series name in ABS', () => {
    const set = buildAbsTitleSet([{ title: 'Приказните светове на Николай Райнов', author: '' }])
    expect(isExistingInAbs('Приказните светове на Николай Райнов Книга 7', [], set)).toBe(false)
  })

  it('does NOT match different book number in same series', () => {
    const set = buildAbsTitleSet([{ title: 'Приказните светове на Николай Райнов Книга 1', author: '' }])
    expect(isExistingInAbs('Приказните светове на Николай Райнов Книга 7', [], set)).toBe(false)
  })
})
