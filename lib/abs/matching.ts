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

const SEP = '|||'

export function buildAbsTitleSet(items: { title: string; author: string }[]): Set<string> {
  const set = new Set<string>()
  for (const item of items) {
    if (!item.title) continue
    const normTitle = normalizeTitle(item.title)
    const normAuthor = item.author ? normalizeTitle(item.author) : ''
    // Store combined key when author is known; title-only when author is absent.
    // Keeping them separate prevents a short ABS title-only entry from matching
    // a same-titled candidate that has a different author.
    if (normAuthor) {
      set.add(normTitle + SEP + normAuthor)
    } else {
      set.add(normTitle)
    }
  }
  return set
}

export function isExistingInAbs(
  candidateTitle: string,
  candidateAuthors: string[],
  absSet: Set<string>,
): boolean {
  const normTitle = normalizeTitle(candidateTitle)
  if (normTitle.length < 3) return false

  const normAuthor = candidateAuthors.length ? normalizeTitle(candidateAuthors[0]) : ''

  // Exact combined key (title + first author) — primary check
  if (normAuthor && absSet.has(normTitle + SEP + normAuthor)) return true

  // Exact title-only key — for ABS items stored without an author
  if (absSet.has(normTitle)) return true

  return false
}
