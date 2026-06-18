import * as cheerio from 'cheerio'
import type { BookSummary, ListingResult, ChitankaDetail } from './types'

const BASE = 'https://chitanka.info'

async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 chitanka-abs-uploader/1.0' },
  })
  if (!res.ok) throw new Error(`Fetch failed ${url}: ${res.status}`)
  return res.text()
}

function abs(href: string): string {
  if (!href) return href
  if (href.startsWith('http')) return href
  if (href.startsWith('//')) return `https:${href}`
  return `${BASE}${href}`
}

export function parseSearchResults(html: string): ListingResult {
  const $ = cheerio.load(html)
  const items: BookSummary[] = []

  // Each result item is an <li class="title ..."> inside ul.superlist.fa-ul
  $('ul.superlist.fa-ul li.title').each((_, el) => {
    // Title link has class "textlink"
    const titleEl = $(el).find('a.textlink').first()
    const title = titleEl.text().trim()
    const href = titleEl.attr('href') ?? ''
    const url = abs(href)

    const authors: string[] = []
    // Authors are in dd.tauthor > span > a[itemprop="name"]
    $(el).find('dd.tauthor [itemprop="name"]').each((_, a) => {
      const name = $(a).text().trim()
      if (name) authors.push(name)
    })

    // Search results don't show cover images per item
    const imgSrc = $(el).find('img').first().attr('src') ?? null
    const coverUrl = imgSrc ? abs(imgSrc) : null

    if (title && href) items.push({ url, title, authors, coverUrl, format: 'epub' })
  })

  // Next page pagination link — look for rel="next" or a link containing "следваща"
  const nextHref =
    $('a[rel="next"]').attr('href') ??
    $('a.next').attr('href') ??
    $('a:contains("следваща")').attr('href') ??
    null

  return { items, nextPagePath: nextHref }
}

export function parseDetailPage(html: string, pageUrl: string): ChitankaDetail {
  const $ = cheerio.load(html)

  // Title is in h1 > span.text-title > a
  const title = $('h1 span.text-title a').first().text().trim()
    || $('h1 span.text-title').first().text().trim()

  const authors: string[] = []
  // Authors are in h1 > span.author-title > span > a[itemprop="name"]
  $('h1 span.author-title [itemprop="name"]').each((_, el) => {
    const name = $(el).text().trim()
    if (name) authors.push(name)
  })

  const translators: string[] = []
  // Translators appear in dd.ttranslator a[itemprop="name"] (may not exist)
  $('dd.ttranslator [itemprop="name"]').each((_, el) => {
    const name = $(el).text().trim()
    if (name) translators.push(name)
  })

  // Description — look for the first paragraph inside the article tab or text-extra-info
  const description = $('#text-extra-info p').first().text().trim()
    || $('div.tab-pane p').first().text().trim()

  const genres: string[] = []
  // Genres are links inside ul.simplelist a[href^="/texts/label/"]
  $('ul.simplelist a[href^="/texts/label/"]').each((_, el) => {
    const g = $(el).text().trim()
    if (g) genres.push(g)
  })

  // Year — itemprop="datePublished"
  const year = $('[itemprop="datePublished"]').first().text().trim()

  // Language — not reliably labeled in HTML; use empty string
  const language = ''

  // Cover image — prefer the larger one in the detail tab (.cover.thumbnail img)
  // The detail tab has .cover.thumbnail with itemprop="image"
  const imgSrc = $('[itemprop="image"]').first().attr('src') ?? null
  const coverUrl = imgSrc ? abs(imgSrc) : null

  // EPUB download link — a[href$=".epub"]
  const epubHref = $('a[href$=".epub"]').first().attr('href') ?? ''
  const downloadUrl = abs(epubHref)

  return {
    site: 'chitanka',
    url: pageUrl,
    title,
    authors,
    translators,
    description,
    genres,
    language,
    year,
    coverUrl,
    downloadUrl,
    format: 'epub',
  }
}

export async function searchChitanka(query: string): Promise<ListingResult> {
  const html = await fetchHtml(`${BASE}/search?q=${encodeURIComponent(query)}`)
  return parseSearchResults(html)
}

export async function browseChitanka(path: string): Promise<ListingResult> {
  const html = await fetchHtml(`${BASE}${path}`)
  return parseSearchResults(html)
}

export async function fetchChitankaDetail(url: string): Promise<ChitankaDetail> {
  const html = await fetchHtml(url)
  return parseDetailPage(html, url)
}
