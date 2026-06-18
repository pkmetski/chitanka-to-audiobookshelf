import * as cheerio from 'cheerio'
import type { BookSummary, ListingResult, GramofoncheDetail } from './types'

const BASE = 'https://gramofonche.chitanka.info'

async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 chitanka-abs-uploader/1.0' },
  })
  if (!res.ok) throw new Error(`Fetch failed ${url}: ${res.status}`)
  return res.text()
}

function abs(href: string, pageUrl?: string): string {
  if (!href) return href
  if (href.startsWith('http')) return href
  if (href.startsWith('//')) return `https:${href}`
  if (href.startsWith('./') && pageUrl) {
    // Resolve relative path against page URL
    const base = pageUrl.endsWith('/') ? pageUrl : pageUrl.replace(/\/[^/]*$/, '/')
    return `${base}${href.slice(2)}`
  }
  return `${BASE}${href}`
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

    if (title && href) items.push({ url, title, authors, coverUrl, format: 'mp3' })
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

  // Description — use participants blockquote as description
  const description = $('blockquote').first().text().trim()

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

  // MP3 download link: inside div.kolona0, link ending in .mp3
  // The href is relative like ./abanosoviia-kon.mp3
  const audioHref =
    $('div.kolona0 a[href$=".mp3"]').first().attr('href') ??
    $('a[href$=".mp3"]').first().attr('href') ??
    $('div.kolona0 a[href$=".zip"]').first().attr('href') ??
    $('a[href$=".zip"]').first().attr('href') ??
    ''
  const downloadUrl = abs(audioHref, pageUrl)

  return {
    site: 'gramofonche',
    url: pageUrl,
    title,
    authors,
    narrators,
    description,
    genres,
    year,
    duration,
    coverUrl,
    downloadUrl,
    format: 'mp3',
  }
}

export async function searchGramofonche(query: string): Promise<ListingResult> {
  const html = await fetchHtml(`${BASE}/search?q=${encodeURIComponent(query)}`)
  return parseSearchResults(html)
}

export async function browseGramofonche(path: string): Promise<ListingResult> {
  const html = await fetchHtml(`${BASE}${path}`)
  return parseSearchResults(html)
}

export async function fetchGramofoncheDetail(url: string): Promise<GramofoncheDetail> {
  const html = await fetchHtml(url)
  return parseDetailPage(html, url)
}
