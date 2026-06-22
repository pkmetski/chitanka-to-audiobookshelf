export function normalizeTitle(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[-–—]/g, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

// Levenshtein distance for fuzzy title matching.
// Allows small spelling variations (OCR errors, Unicode variations).
function levenshteinDistance(a: string, b: string): number {
  const m = a.length
  const n = b.length
  const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0))

  for (let i = 0; i <= m; i++) dp[i][0] = i
  for (let j = 0; j <= n; j++) dp[0][j] = j

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1]
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1])
      }
    }
  }
  return dp[m][n]
}

// Check if two normalized titles are similar enough (fuzzy match).
// Allows up to 3 character differences but no more than 10% of string length.
function titlesSimilar(a: string, b: string): boolean {
  if (a === b) return true
  const dist = levenshteinDistance(a, b)
  const maxLen = Math.max(a.length, b.length)
  const minLen = Math.min(a.length, b.length)
  // Reject if lengths differ by more than 3 chars (catches "Книга 7" additions)
  if (Math.abs(a.length - b.length) > 3) return false
  // Allow up to 3 edits or 10% difference, whichever is smaller
  const threshold = Math.min(3, Math.ceil(maxLen * 0.10))
  return dist <= threshold
}

// Parse a human-readable duration string like "40мин" or "1ч 20мин" to minutes.
export function parseDurationMins(s?: string): number | undefined {
  if (!s) return undefined
  let mins = 0
  const h = s.match(/(\d+)\s*[чh]/i)
  const m = s.match(/(\d+)\s*[мm]/i)
  if (h) mins += parseInt(h[1], 10) * 60
  if (m) mins += parseInt(m[1], 10)
  return mins > 0 ? mins : undefined
}

const SEP = '|||'

// Remove spaces for author comparison — ABS sometimes concatenates author parts
// without spaces (e.g. "АфриканскаПриказка" instead of "Африканска Приказка").
function spaceless(s: string): string {
  return s.replace(/\s+/g, '')
}

function authorsOverlap(a: string, b: string): boolean {
  if (a === b) return true
  const sa = spaceless(a)
  const sb = spaceless(b)
  if (sa === sb) return true
  // Allow partial containment for cases where ABS concatenates extra role info
  // (e.g. "режвихроничачановски африканскаприказка" contains "африканскаприказка")
  if (sa.length >= 4 && sb.includes(sa)) return true
  if (sb.length >= 4 && sa.includes(sb)) return true
  return false
}

// Returns true if the candidate duration (minutes) is compatible with any of
// the ABS durations (seconds). Tolerance: 20% relative difference.
// If either side has no duration data, the check is skipped (returns true).
function durationOk(candidateMins: number | undefined, absSecsList: number[]): boolean {
  if (candidateMins == null || absSecsList.length === 0) return true
  return absSecsList.some(secs => {
    const absMins = secs / 60
    return Math.abs(candidateMins - absMins) / Math.max(candidateMins, absMins) <= 0.20
  })
}

export type AbsTitleMap = Map<string, number[]>

export function buildAbsTitleMap(
  items: { title: string; author: string; durationSecs?: number }[],
): AbsTitleMap {
  const map = new Map<string, number[]>()

  function add(key: string, secs?: number) {
    const existing = map.get(key)
    if (existing) {
      if (secs != null) existing.push(secs)
    } else {
      map.set(key, secs != null ? [secs] : [])
    }
  }

  for (const item of items) {
    if (!item.title) continue
    const normTitle = normalizeTitle(item.title)
    const normAuthor = item.author ? normalizeTitle(item.author) : ''
    if (normAuthor) {
      add(normTitle + SEP + normAuthor, item.durationSecs)
    } else {
      add(normTitle, item.durationSecs)
    }
  }
  return map
}

export function isExistingInAbs(
  candidateTitle: string,
  candidateAuthors: string[],
  absMap: AbsTitleMap,
  candidateDurationMins?: number,
): boolean {
  const normTitle = normalizeTitle(candidateTitle)
  if (normTitle.length < 3) return false

  // Normalize all candidate authors. Gramofonche listings may split "Source, реж. Name"
  // into separate author entries; we check each against the ABS map so that a match on
  // any candidate author is sufficient.
  const normAuthors = candidateAuthors.map(a => normalizeTitle(a)).filter(Boolean)

  function check(key: string): boolean {
    const durs = absMap.get(key)
    if (durs === undefined) return false
    return durationOk(candidateDurationMins, durs)
  }

  // 1. Exact combined key (title + each candidate author) — primary check
  for (const na of normAuthors) {
    if (check(normTitle + SEP + na)) return true
  }

  // 2. Exact title-only key — for ABS items stored without an author
  if (check(normTitle)) return true

  // 3. Exact title, fuzzy author — handles ABS items where the author field has
  //    a different order or concatenated role prefix with no spaces
  //    (e.g. ABS "реж.ЛилянаТодорова ШарлПеро" vs candidate "Шарл Перо")
  if (normAuthors.length > 0) {
    for (const [key, durs] of absMap) {
      const sepIdx = key.indexOf(SEP)
      if (sepIdx === -1) continue
      if (key.slice(0, sepIdx) !== normTitle) continue
      const keyAuthor = key.slice(sepIdx + SEP.length)
      if (normAuthors.some(na => authorsOverlap(na, keyAuthor))) {
        if (durationOk(candidateDurationMins, durs)) return true
      }
    }
  }

  // 4. Prefix match: ABS title starts with candidate title followed by a space.
  //    Handles ABS items uploaded with extra metadata appended to the title
  //    (e.g. "Винету и Поразяващата ръка :К.Май :БалканТон").
  //    Requires both sides to have an author — without author confirmation,
  //    a title prefix is not enough (series name would falsely match Книга N).
  //    Minimum 8 chars on the candidate title guards against short-title false positives.
  if (normTitle.length >= 8 && normAuthors.length > 0) {
    const prefix = normTitle + ' '
    for (const [key, durs] of absMap) {
      const sepIdx = key.indexOf(SEP)
      if (sepIdx === -1) continue
      const keyTitle = key.slice(0, sepIdx)
      if (!keyTitle.startsWith(prefix)) continue
      const keyAuthor = key.slice(sepIdx + SEP.length)
      if (normAuthors.some(na => authorsOverlap(na, keyAuthor))) {
        if (durationOk(candidateDurationMins, durs)) return true
      }
    }
  }

  // 5. Fuzzy title match: handles small spelling variations (OCR errors, Unicode differences).
  //    Only apply when there's author confirmation to avoid false positives.
  //    Check fuzzy title + author matches (exact or overlapping).
  if (normAuthors.length > 0) {
    for (const [key, durs] of absMap) {
      const sepIdx = key.indexOf(SEP)
      if (sepIdx === -1) continue
      const keyTitle = key.slice(0, sepIdx)
      const keyAuthor = key.slice(sepIdx + SEP.length)
      if (titlesSimilar(normTitle, keyTitle) && normAuthors.some(na => authorsOverlap(na, keyAuthor))) {
        if (durationOk(candidateDurationMins, durs)) return true
      }
    }
  }

  return false
}
