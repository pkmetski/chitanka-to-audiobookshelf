import * as cheerio from 'cheerio'
import type { BookSummary, ListingResult, ChitankaDetail, ChitankaSeries, CategoryEntry } from './types'

const BASE = 'https://chitanka.info'

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

function abs(href: string): string {
  if (!href) return href
  if (href.startsWith('http')) return href
  if (href.startsWith('//')) return `https:${href}`
  return `${BASE}${href}`
}

export function parseSearchResults(html: string): ListingResult {
  const $ = cheerio.load(html)
  const items: BookSummary[] = []

  // The "Книги" section has cover images. Add books directly as items AND build
  // a slug → coverUrl map to enrich matching text results below.
  const slugCoverMap = new Map<string, string>()
  $('div.booklist article.book-media').each((_, el) => {
    const bookLink = $(el).find('a.booklink').first()
    const href = bookLink.attr('href') ?? ''
    const url = abs(href)
    const title = $(el).find('[itemprop="name"]').first().text().trim()
    const imgSrc = $(el).find('img[itemprop="image"]').first().attr('src') ?? null
    const coverUrl = imgSrc ? abs(imgSrc) : null
    const slug = href.replace(/^\/book\/\d+-/, '')
    if (title && href) {
      items.push({ site: 'chitanka', url, title, authors: [], coverUrl, format: 'epub' })
      if (slug && coverUrl) slugCoverMap.set(slug, coverUrl)
    }
  })

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

    // Match cover from the books section by slug (e.g. /text/44723-abu-hasan → "abu-hasan")
    const textSlug = href.replace(/^\/text\/\d+-/, '')
    const coverUrl = slugCoverMap.get(textSlug) ?? null

    if (title && href) items.push({ site: 'chitanka', url, title, authors, coverUrl, format: 'epub' })
  })

  // Fallback: genre/category pages show books as article.book-media cards (no superlist).
  // Extract items directly from those when the list parse yielded nothing.
  if (items.length === 0) {
    $('article.book-media').each((_, el) => {
      const bookLink = $(el).find('a.booklink').first()
      const href = bookLink.attr('href') ?? ''
      const titleEl = $(el).find('[itemprop="name"]').first()
      const title = titleEl.text().trim() || bookLink.attr('title')?.trim() || ''
      const imgSrc = $(el).find('img[itemprop="image"]').first().attr('src') ?? null
      const coverUrl = imgSrc ? abs(imgSrc) : null

      const authors: string[] = []
      $(el).find('[itemprop="author"]').each((_, a) => {
        const name = $(a).text().trim()
        if (name) authors.push(name)
      })

      if (title && href) items.push({ site: 'chitanka', url: abs(href), title, authors, coverUrl, format: 'epub' })
    })
  }

  // Next page: Chitanka puts class="next" on the <li>, not the <a>.
  // The first li.next covers books; a second may cover texts on /new — books takes precedence.
  const nextHref =
    $('a[rel="next"]').attr('href') ??
    $('li.next a').first().attr('href') ??
    null

  return { items, nextPagePath: nextHref }
}

export function parseDetailPage(html: string, pageUrl: string): ChitankaDetail {
  const $ = cheerio.load(html)

  // Text pages:  h1 > span.text-title > a
  // Book pages:  h1 > a.selflink
  const title = $('h1 span.text-title a').first().text().trim()
    || $('h1 span.text-title').first().text().trim()
    || $('h1 a.selflink').first().text().trim()

  const authors: string[] = []
  // Text pages: h1 > span.author-title > span[itemtype=Person] > a[itemprop="name"]
  // Book pages: h1 > span[itemtype=Person] > a[itemprop="name"]  (no .author-title wrapper)
  $('h1 span[itemtype="http://schema.org/Person"] a[itemprop="name"]').each((_, el) => {
    const name = $(el).text().trim()
    if (name) authors.push(name)
  })

  const translators: string[] = []
  // Translators appear in dd.ttranslator a[itemprop="name"] (may not exist)
  $('dd.ttranslator [itemprop="name"]').each((_, el) => {
    const name = $(el).text().trim()
    if (name) translators.push(name)
  })

  // Description — book pages (/book/...) carry a specific meta description.
  // Text pages (/text/...) have a generic site-wide meta, so we try two fallbacks:
  //   1. book-card popover (plain <p> summary; skip if it's an author citation blockquote)
  //   2. Wikipedia article intro paragraph (when the article tab is present)
  const GENERIC_META = 'Универсална библиотека'
  const metaDesc = ($('meta[name="description"]').attr('content') ?? '').trim()
  const popoverHtml = $('h4.book-title .popover-trigger').first().attr('data-content') ?? ''
  const popoverDesc = (popoverHtml && !popoverHtml.includes('blockquote'))
    ? cheerio.load(popoverHtml)('p').first().text().trim()
    : ''
  const description =
    (metaDesc && !metaDesc.startsWith(GENERIC_META) ? metaDesc : '') ||
    popoverDesc ||
    $('section[data-mw-section-id="0"] p').first().text().trim()

  const genres: string[] = []
  // Genres and characteristics are links inside ul.simplelist a[href^="/texts/label/"]
  $('ul.simplelist a[href^="/texts/label/"]').each((_, el) => {
    const g = $(el).text().trim()
    if (g) genres.push(g)
  })
  // Форма (literary form: Роман, Разказ, etc.) — append to genres when present
  const form = $('dd a[href^="/texts/type/"]').first().text().trim()
  if (form && !genres.includes(form)) genres.push(form)

  // Year — itemprop="datePublished"
  const year = $('[itemprop="datePublished"]').first().text().trim()

  // Series — <dt>Серия</dt> <dd> <a href="/serie/..."><i>name</i></a> (N) </dd>
  let series: ChitankaSeries | null = null
  $('dl.dl-horizontal dt').each((_, dt) => {
    if ($(dt).text().trim() === 'Серия') {
      const dd = $(dt).next('dd')
      const name = dd.find('a[href^="/serie/"] i').first().text().trim()
        || dd.find('a[href^="/serie/"]').first().text().trim()
      const seqMatch = dd.text().match(/\((\d+)\)/)
      if (name) series = { name, sequence: seqMatch?.[1] ?? '' }
    }
  })

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
    series,
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
  const detail = parseDetailPage(html, url)

  // Book pages (/book/...) have no genre labels. Follow the embedded /text/ link to get them.
  if (detail.genres.length === 0 && url.includes('/book/')) {
    const $ = cheerio.load(html)
    const textHref = $('a[href^="/text/"]').toArray()
      .map(el => $(el).attr('href') ?? '')
      .find(href => !href.includes('.'))
    if (textHref) {
      try {
        const textHtml = await fetchHtml(abs(textHref))
        const textDetail = parseDetailPage(textHtml, abs(textHref))
        return { ...detail, genres: textDetail.genres }
      } catch {
        // Fall through — return detail without genres
      }
    }
  }

  return detail
}

export function parseCategories(html: string): CategoryEntry[] {
  const $ = cheerio.load(html)
  const entries: Array<{ label: string; path: string }> = []
  const seen = new Set<string>()
  $('a[href^="/books/category/"]').each((_, el) => {
    const path = $(el).attr('href') ?? ''
    const label = $(el).text().trim()
    if (!path || !label || seen.has(path) || label.startsWith('@')) return
    seen.add(path)
    entries.push({ label, path })
  })
  return entries.sort((a, b) => a.label.localeCompare(b.label, 'bg'))
}

export async function fetchChitankaCategories(): Promise<CategoryEntry[]> {
  const html = await fetchHtml(`${BASE}/books/category`)
  return parseCategories(html)
}
