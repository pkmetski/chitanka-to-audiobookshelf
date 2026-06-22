// eslint-disable-next-line @typescript-eslint/no-require-imports
const LABEL_SUFFIX_RE = /\s+\/\S+$/

/**
 * Return the title with the Gramofonche publisher-label suffix removed.
 * e.g. "Вълкът и агнето /Кынев" → "Вълкът и агнето"
 * Multi-word values (e.g. "/с интервали тук") are left untouched.
 */
export function cleanLabelSuffix(title: string): string {
  return title.replace(LABEL_SUFFIX_RE, '')
}

export function hasLabelSuffix(title: string): boolean {
  return LABEL_SUFFIX_RE.test(title)
}

/**
 * Strip the Gramofonche publisher-label suffix from an MP3 Buffer's ID3 title tag.
 * Returns the original buffer unchanged if there is no suffix or on any error.
 *
 * Uses require() to avoid ESM/CJS interop issues with node-id3's export= module
 * under Turbopack. serverExternalPackages in next.config.ts ensures node-id3 is
 * never bundled by Turbopack.
 */
export function stripId3LabelSuffix(buf: Buffer): Buffer {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const NodeID3 = require('node-id3') as typeof import('node-id3')
    const tags = NodeID3.read(buf)
    if (!tags.title) return buf
    const cleaned = cleanLabelSuffix(tags.title)
    if (cleaned === tags.title) return buf
    console.log(`[strip-id3] "${tags.title}" → "${cleaned}"`)
    const result = NodeID3.update({ title: cleaned }, buf)
    return result instanceof Buffer ? result : buf
  } catch (e) {
    console.warn('[strip-id3] failed:', e)
    return buf
  }
}
