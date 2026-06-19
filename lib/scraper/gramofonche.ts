import * as cheerio from 'cheerio'
import type { BookSummary, ListingResult, GramofoncheDetail } from './types'

const BASE = 'https://gramofonche.chitanka.info'

async function fetchHtml(url: string): Promise<string> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 chitanka-abs-uploader/1.0' },
      next: { revalidate: 300 },
    })
    if (res.status === 429 && attempt < 2) {
      await new Promise(r => setTimeout(r, 1500 * (attempt + 1)))
      continue
    }
    if (!res.ok) throw new Error(`Fetch failed ${url}: ${res.status}`)
    return res.text()
  }
  throw new Error(`Fetch failed ${url}: 429`)
}

function abs(href: string, pageUrl?: string): string {
  if (!href) return href
  try {
    // URL constructor resolves relative paths and percent-encodes non-ASCII characters,
    // which is required for Node.js fetch to accept filenames with Cyrillic characters.
    return new URL(href, pageUrl ?? BASE + '/').href
  } catch {
    return href
  }
}

/**
 * Listing pages use a flat <div> structure inside #content-wrapper.
 * Each item div contains an <a href="/CATEGORY/SLUG/"> link with:
 *   - optional <img> cover
 *   - title text followed by (<i>subtitle info</i>) /type /publisher /year
 * The link href is relative, e.g. /prikazki/abanosoviia-kon/
 */
export function parseSearchResults(html: string): ListingResult {
  const $ = cheerio.load(html)
  const items: BookSummary[] = []

  // Items are <div> elements inside #content-wrapper that contain a link
  // to a book detail page (href matches /CATEGORY/SLUG/ pattern)
  $('#content-wrapper > div').each((_, el) => {
    // Find the main book link — it points to a slug path
    const linkEl = $(el).find('a[href]').filter((_, a) => {
      const href = $(a).attr('href') ?? ''
      // Match paths like /prikazki/SLUG/, /pesnicki/SLUG/, /zagolemi/SLUG/
      return /^\/(prikazki|pesnicki|zagolemi)\/[^/]+\/$/.test(href)
    }).first()

    if (!linkEl.length) return

    const href = linkEl.attr('href') ?? ''
    const url = abs(href)

    // The link text contains: "Title (subtitle) /type /publisher /year"
    // We extract the title as the text before the first "(" or "/"
    const fullText = linkEl.clone().find('i').remove().end().text().trim()
    // Take text up to first " (" or " /"
    const title = fullText.split(/\s*[(/]/)[0].trim()

    // Author info is often inside <i> in the link: "(Author, director)"
    const authors: string[] = []
    const iText = linkEl.find('i').first().text().trim()
    if (iText) {
      // The i element contains comma-separated contributors — use the whole string as author
      // Split by comma to get individual contributors
      iText.split(',').forEach(part => {
        const name = part.trim()
        if (name) authors.push(name)
      })
    }

    const imgSrc = linkEl.find('img').first().attr('src') ?? null
    const coverUrl = imgSrc ? abs(imgSrc) : null

    const elText = $(el).text()
    const durationMatch = elText.match(/(\d+)мин/)
    const duration = durationMatch ? `${durationMatch[1]}мин` : undefined

    if (title && href) items.push({ site: 'gramofonche', url, title, authors, coverUrl, format: 'mp3', duration })
  })

  // Gramofonche uses simple paginated category pages; no standard next-page link
  const nextHref =
    $('a[rel="next"]').attr('href') ??
    $('a.next').attr('href') ??
    null

  return { items, nextPagePath: nextHref }
}

/**
 * Detail page structure:
 *   <h1> Title </h1>
 *   автор: AUTHOR <br>
 *   година: YEAR <br>
 *   <blockquote> изпълнение: NAME1, NAME2... </blockquote>
 *   <div class=kolona0> <a href="./SLUG.mp3"> ... </a> </div>
 *   размер: NNM:YYмин <br>
 *   <div class=kolona_kartinki> <img src="..."> </div>
 */
export function parseDetailPage(html: string, pageUrl: string): GramofoncheDetail {
  const $ = cheerio.load(html)

  // Title is in <h1>
  const title = $('#content-wrapper h1').first().text().trim()
    || $('h1').first().text().trim()

  // Extract the full text of content-wrapper to parse label: value pairs
  const contentText = $('#content-wrapper').text()

  // Authors: look for "автор:" label in text
  const authors: string[] = []
  const authorMatch = contentText.match(/автор:\s*([^\n]+)/)
  if (authorMatch) {
    const authorText = authorMatch[1].trim()
    if (authorText) authors.push(authorText)
  }

  // Narrators / performers — look for "изпълнение:" in blockquote
  const narrators: string[] = []
  $('blockquote').each((_, el) => {
    const bqText = $(el).text()
    const execMatch = bqText.match(/изпълнение:\s*([^\n]+)/)
    if (execMatch) {
      execMatch[1].split(',').forEach(name => {
        const n = name.trim()
        if (n) narrators.push(n)
      })
    }
  })

  // Description — prefer meta description if present; fall back to the
  // participants blockquote which holds the production/cast info.
  const metaDesc = ($('meta[name="description"]').attr('content') ?? '').trim()
  const description = metaDesc || $('blockquote').first().text().trim()

  // Genres — not present on Gramofonche; derive from path or leave empty
  const genres: string[] = []

  // Year: look for "година:" label
  const yearMatch = contentText.match(/година:\s*(\d{4})/)
  const year = yearMatch ? yearMatch[1] : ''

  // Duration: look for "Nмин" pattern in size/duration text
  const durationMatch = contentText.match(/(\d+)мин/)
  const duration = durationMatch ? `${durationMatch[1]}мин` : ''

  // Cover image: inside div.kolona_kartinki, prefer the first image
  const imgSrc = $('div.kolona_kartinki img').first().attr('src') ?? null
  const coverUrl = imgSrc ? abs(imgSrc) : null

  // Collect all MP3 links in page order, capturing the title text from each link.
  // The "Сваляне" download buttons are injected by client-side JS and absent in raw HTML,
  // so each track has exactly one <a href="...mp3"> whose text content is the track title.
  const downloads: Array<{ url: string; title: string }> = []
  $('a[href$=".mp3"]').each((_, el) => {
    const href = $(el).attr('href')
    if (!href) return
    // Strip <i> subtitles and trailing parenthetical, e.g. " (Шехерезада, реж. Мария Нанчева)"
    const clone = $(el).clone()
    clone.find('i').remove()
    const trackTitle = clone.text().replace(/\s*\(.*$/, '').trim()
    downloads.push({ url: abs(href, pageUrl), title: trackTitle })
  })

  // Fall back to zip if no MP3 found
  if (!downloads.length) {
    const zipHref =
      $('div.kolona0 a[href$=".zip"]').first().attr('href') ??
      $('a[href$=".zip"]').first().attr('href') ?? ''
    if (zipHref) {
      const url = abs(zipHref, pageUrl)
      downloads.push({ url, title: zipHref.split('/').pop()?.replace(/\.zip$/, '') || 'download' })
    }
  }

  return {
    site: 'gramofonche',
    url: pageUrl,
    title,
    authors,
    narrators,
    description,
    genres,
    language: 'Bulgarian',
    year,
    duration,
    coverUrl,
    downloads,
    format: 'mp3',
  }
}

export async function searchGramofonche(query: string): Promise<ListingResult> {
  // Gramofonche has no search endpoint; fetch all three category first-pages
  // and filter client-side by title/author (~1200 items vs 114 on the homepage).
  const [prikazki, pesnicki, zagolemi] = await Promise.all([
    fetchHtml(`${BASE}/prikazki/`).then(h => parseSearchResults(h).items),
    fetchHtml(`${BASE}/pesnicki/`).then(h => parseSearchResults(h).items),
    fetchHtml(`${BASE}/zagolemi/`).then(h => parseSearchResults(h).items),
  ])

  const all = [...prikazki, ...pesnicki, ...zagolemi]
  const q = query.trim().toLowerCase()
  if (!q) return { items: all, nextPagePath: null }

  const items = all.filter(
    item =>
      item.title.toLowerCase().includes(q) ||
      item.authors.some(a => a.toLowerCase().includes(q)),
  )
  return { items, nextPagePath: null }
}

export async function browseGramofonche(path: string): Promise<ListingResult> {
  const html = await fetchHtml(`${BASE}${path}`)
  return parseSearchResults(html)
}

export async function fetchGramofoncheDetail(url: string): Promise<GramofoncheDetail> {
  const html = await fetchHtml(url)
  return parseDetailPage(html, url)
}
