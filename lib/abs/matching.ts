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
  return new Set(items.filter(item => item.title).map(item => normalizeTitle(item.title)))
}

export function isExistingInAbs(candidateTitle: string, absSet: Set<string>): boolean {
  const normalized = normalizeTitle(candidateTitle)
  if (normalized.length < 3) return false
  if (absSet.has(normalized)) return true
  for (const absTitle of absSet) {
    // ABS title contains candidate (ABS has extra parenthetical/subtitle).
    // Guard: candidate must be ≥80% of ABS title length to prevent a short ABS
    // title like "Аладин" from matching a much longer candidate.
    if (absTitle.includes(normalized) && normalized.length >= absTitle.length * 0.8) return true
  }
  return false
}
