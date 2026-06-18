import { unzipSync, zipSync, strToU8, strFromU8 } from 'fflate'

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/**
 * Inject Calibre-style series metadata into an epub's OPF before uploading.
 * ABS reads this during its library scan, so the series + sequence survive without
 * needing a post-upload PATCH.
 *
 * Returns the modified epub buffer, or the original buffer unchanged if the OPF
 * can't be found or parsed.
 */
export function injectSeriesIntoEpub(
  epubBuffer: Buffer,
  seriesName: string,
  sequence: string,
): Buffer {
  try {
    const zip = unzipSync(new Uint8Array(epubBuffer))

    const containerXml = zip['META-INF/container.xml']
    if (!containerXml) return epubBuffer

    const container = strFromU8(containerXml)
    const opfPathMatch = container.match(/full-path="([^"]+)"/)
    if (!opfPathMatch) return epubBuffer

    const opfPath = opfPathMatch[1]
    const opfEntry = zip[opfPath]
    if (!opfEntry) return epubBuffer

    let opf = strFromU8(opfEntry)

    // Remove any pre-existing Calibre series tags to avoid duplicates
    opf = opf.replace(/<meta\s+name="calibre:series(?:_index)?"[^/]*\/>/gi, '')

    const injection =
      `<meta name="calibre:series" content="${escapeXml(seriesName)}"/>` +
      `<meta name="calibre:series_index" content="${escapeXml(sequence)}"/>`
    opf = opf.replace('</metadata>', `${injection}</metadata>`)

    zip[opfPath] = strToU8(opf)

    return Buffer.from(zipSync(zip))
  } catch {
    return epubBuffer
  }
}
