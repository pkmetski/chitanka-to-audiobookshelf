export function normalizeTitle(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

export function buildAbsTitleSet(items: { title: string }[]): Set<string> {
  return new Set(items.map(item => normalizeTitle(item.title)))
}

export function isExistingInAbs(candidateTitle: string, absSet: Set<string>): boolean {
  const normalized = normalizeTitle(candidateTitle)
  if (normalized.length < 3) return false
  for (const absTitle of absSet) {
    if (absTitle.includes(normalized) || normalized.includes(absTitle)) return true
  }
  return false
}
