import { describe, it, expect } from 'vitest'
import { normalizeTitle, buildAbsTitleMap, isExistingInAbs, parseDurationMins } from '@/lib/abs/matching'

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

describe('parseDurationMins', () => {
  it('parses minutes-only string', () => {
    expect(parseDurationMins('40мин')).toBe(40)
  })
  it('parses hours and minutes', () => {
    expect(parseDurationMins('1ч 20мин')).toBe(80)
  })
  it('returns undefined for missing input', () => {
    expect(parseDurationMins(undefined)).toBeUndefined()
    expect(parseDurationMins('')).toBeUndefined()
  })
})

describe('isExistingInAbs — author-aware', () => {
  it('matches same title+author', () => {
    const map = buildAbsTitleMap([{ title: 'Басни', author: 'Лафонтен' }])
    expect(isExistingInAbs('Басни', ['Лафонтен', 'реж. Антоанета Батулярова'], map)).toBe(true)
  })

  it('rejects same title with different author', () => {
    const map = buildAbsTitleMap([{ title: 'Басни', author: 'Лафонтен' }])
    expect(isExistingInAbs('Басни', ['Алберт Декало', 'реж. Иван Андонов'], map)).toBe(false)
  })

  it('falls back to title-only when ABS item has no author', () => {
    const map = buildAbsTitleMap([{ title: 'Аладин', author: '' }])
    expect(isExistingInAbs('Аладин', ['Some Author'], map)).toBe(true)
  })

  it('falls back to title-only when candidate has no authors', () => {
    const map = buildAbsTitleMap([{ title: 'Аладин', author: '' }])
    expect(isExistingInAbs('Аладин', [], map)).toBe(true)
  })
})

describe('isExistingInAbs — hyphen normalisation', () => {
  it('matches hyphenated candidate against space-separated ABS title', () => {
    const map = buildAbsTitleMap([{ title: 'Абу мързеливият и хубавицата', author: 'Шехерезада' }])
    expect(isExistingInAbs('Абу-мързеливият и хубавицата', ['Шехерезада'], map)).toBe(true)
  })

  it('matches hyphenated ABS title against space-separated candidate', () => {
    const map = buildAbsTitleMap([{ title: 'Абу-мързеливият и хубавицата', author: 'Шехерезада' }])
    expect(isExistingInAbs('Абу мързеливият и хубавицата', ['Шехерезада'], map)).toBe(true)
  })
})

describe('isExistingInAbs — no false positives on partial title overlap', () => {
  it('does NOT match series name against a specific volume in ABS (no author)', () => {
    const map = buildAbsTitleMap([{ title: 'Приказните светове на Николай Райнов Книга 7', author: '' }])
    expect(isExistingInAbs('Приказните светове на Николай Райнов', [], map)).toBe(false)
  })

  it('does NOT match specific volume against series name in ABS', () => {
    const map = buildAbsTitleMap([{ title: 'Приказните светове на Николай Райнов', author: '' }])
    expect(isExistingInAbs('Приказните светове на Николай Райнов Книга 7', [], map)).toBe(false)
  })

  it('does NOT match different book number in same series', () => {
    const map = buildAbsTitleMap([{ title: 'Приказните светове на Николай Райнов Книга 1', author: '' }])
    expect(isExistingInAbs('Приказните светове на Николай Райнов Книга 7', [], map)).toBe(false)
  })
})

describe('isExistingInAbs — concatenated author in ABS (no spaces)', () => {
  it('matches when ABS authorName has role prefix and reversed order without spaces', () => {
    const map = buildAbsTitleMap([{ title: 'Котаракът в чизми', author: 'реж.ЛилянаТодорова ШарлПеро' }])
    expect(isExistingInAbs('Котаракът в чизми', ['Шарл Перо'], map)).toBe(true)
  })

  it('does NOT match same title when authors are completely unrelated', () => {
    const map = buildAbsTitleMap([{ title: 'Котаракът в чизми', author: 'реж.ЛилянаТодорова ШарлПеро' }])
    expect(isExistingInAbs('Котаракът в чизми', ['Иван Вазов'], map)).toBe(false)
  })
})

describe('isExistingInAbs — multi-author candidate list', () => {
  // Gramofonche listings split "Шехерезада, реж. Мария Нанчева" into two author entries.
  // If ABS stored only the narrator/director as author, matching on the first candidate
  // author ("Шехерезада") would fail. The fix: try each candidate author.
  it('matches via second candidate author when ABS only has the narrator', () => {
    const map = buildAbsTitleMap([{ title: 'Маруф обущарят', author: 'Мария Нанчева', durationSecs: 3120 }])
    expect(isExistingInAbs('Маруф обущарят', ['Шехерезада', 'реж. Мария Нанчева'], map, 52)).toBe(true)
  })

  it('matches via first candidate author when it is the stored ABS author', () => {
    const map = buildAbsTitleMap([{ title: 'Маруф обущарят', author: 'Шехерезада', durationSecs: 3120 }])
    expect(isExistingInAbs('Маруф обущарят', ['Шехерезада', 'реж. Мария Нанчева'], map, 52)).toBe(true)
  })

  it('does NOT match when neither candidate author relates to the ABS author', () => {
    const map = buildAbsTitleMap([{ title: 'Маруф обущарят', author: 'Иван Вазов', durationSecs: 3120 }])
    expect(isExistingInAbs('Маруф обущарят', ['Шехерезада', 'реж. Мария Нанчева'], map, 52)).toBe(false)
  })
})

describe('isExistingInAbs — Balkanton suffix in ABS titles', () => {
  it('matches when ABS title has extra :Author :Label suffix and authors agree', () => {
    const map = buildAbsTitleMap([{ title: 'Винету и Поразяващата ръка :К.Май :БалканТон', author: 'Карл Май' }])
    expect(isExistingInAbs('Винету и Поразяващата ръка', ['Карл Май'], map)).toBe(true)
  })

  it('matches when ABS title has suffix and author is concatenated without spaces', () => {
    const absTitle = 'Вълшебното камъче :АфриканскаПриказка,реж.В.Чачановски :БалканТон'
    const absAuthor = 'реж.ВихрониЧачановски АфриканскаПриказка'
    const map = buildAbsTitleMap([{ title: absTitle, author: absAuthor }])
    expect(isExistingInAbs('Вълшебното камъче', ['Африканска Приказка'], map)).toBe(true)
  })

  it('does NOT prefix-match short titles (< 8 chars)', () => {
    const map = buildAbsTitleMap([{ title: 'Басни и разкази', author: 'Лафонтен' }])
    expect(isExistingInAbs('Басни', ['Лафонтен'], map)).toBe(false)
  })

  it('does NOT match when authors differ even if title prefix matches', () => {
    const map = buildAbsTitleMap([{ title: 'Винету и Поразяващата ръка :К.Май :БалканТон', author: 'Карл Май' }])
    expect(isExistingInAbs('Винету и Поразяващата ръка', ['Иван Вазов'], map)).toBe(false)
  })
})

describe('isExistingInAbs — duration discrimination', () => {
  it('matches when durations are within 20%', () => {
    // ABS: 40мин = 2400s, candidate: 40мин
    const map = buildAbsTitleMap([{ title: 'Котаракът в чизми', author: 'Шарл Перо', durationSecs: 2400 }])
    expect(isExistingInAbs('Котаракът в чизми', ['Шарл Перо'], map, 40)).toBe(true)
  })

  it('rejects when durations differ by more than 20%', () => {
    // ABS: 40мин = 2400s, candidate: 59мин — 47% difference
    const map = buildAbsTitleMap([{ title: 'Котаракът в чизми', author: 'реж.ЛилянаТодорова ШарлПеро', durationSecs: 2400 }])
    expect(isExistingInAbs('Котаракът в чизми', ['Шарл Перо'], map, 59)).toBe(false)
  })

  it('accepts match when ABS has no duration data', () => {
    const map = buildAbsTitleMap([{ title: 'Котаракът в чизми', author: 'Шарл Перо' }])
    expect(isExistingInAbs('Котаракът в чизми', ['Шарл Перо'], map, 59)).toBe(true)
  })

  it('accepts match when candidate has no duration', () => {
    const map = buildAbsTitleMap([{ title: 'Котаракът в чизми', author: 'Шарл Перо', durationSecs: 2400 }])
    expect(isExistingInAbs('Котаракът в чизми', ['Шарл Перо'], map, undefined)).toBe(true)
  })

  it('accepts the correct recording when two recordings of the same title exist', () => {
    const map = buildAbsTitleMap([
      { title: 'Котаракът в чизми', author: 'реж.ЛилянаТодорова ШарлПеро', durationSecs: 2400 },  // 40мин
    ])
    expect(isExistingInAbs('Котаракът в чизми', ['Шарл Перо'], map, 40)).toBe(true)
    expect(isExistingInAbs('Котаракът в чизми', ['Шарл Перо'], map, 59)).toBe(false)
  })
})

describe('isExistingInAbs — fuzzy title match', () => {
  // Handles small spelling variations: OCR errors, Unicode differences
  it('matches fuzzy title with exact author when Gramofonche title differs from ABS title', () => {
    const map = buildAbsTitleMap([{ title: 'Маруф обущарят', author: 'Мария Нанчева', durationSecs: 3120 }])
    // User's Gramofonche title: "Маруф обушарт" vs ABS title: "Маруф обущарят"
    expect(isExistingInAbs('Маруф обушарт', ['реж. Мария Нанчева'], map, 52)).toBe(true)
  })

  it('matches fuzzy title with any overlapping author', () => {
    const map = buildAbsTitleMap([{ title: 'Маруф обущарят', author: 'Мария Нанчева', durationSecs: 3120 }])
    // Either author from the source or narrator should match
    expect(isExistingInAbs('Маруф обушарт', ['Шехерезада', 'реж. Мария Нанчева'], map, 52)).toBe(true)
  })

  it('rejects fuzzy match when authors do not overlap', () => {
    const map = buildAbsTitleMap([{ title: 'Маруф обущарят', author: 'Иван Вазов', durationSecs: 3120 }])
    expect(isExistingInAbs('Маруф обушарт', ['реж. Мария Нанчева'], map, 52)).toBe(false)
  })

  it('rejects fuzzy match when durations differ significantly', () => {
    const map = buildAbsTitleMap([{ title: 'Маруф обущарят', author: 'Мария Нанчева', durationSecs: 2400 }])
    // Duration mismatch: ABS 40мин, candidate 52мин (30% diff > 20% threshold)
    expect(isExistingInAbs('Маруф обушарт', ['реж. Мария Нанчева'], map, 52)).toBe(false)
  })

  it('does NOT match fuzzy when title difference is too large', () => {
    const map = buildAbsTitleMap([{ title: 'Котаракът в чизми', author: 'Шарл Перо' }])
    expect(isExistingInAbs('Аладин и вълшебната лампа', ['Шарл Перо'], map)).toBe(false)
  })
})
