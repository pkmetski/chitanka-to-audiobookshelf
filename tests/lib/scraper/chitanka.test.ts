import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { parseSearchResults, parseDetailPage, parseCategories } from '@/lib/scraper/chitanka'

const searchHtml = readFileSync(resolve('tests/__fixtures__/chitanka-search.html'), 'utf-8')
const detailHtml = readFileSync(resolve('tests/__fixtures__/chitanka-detail.html'), 'utf-8')
const DETAIL_URL = 'https://chitanka.info/text/3753-pod-igoto'

describe('parseSearchResults', () => {
  it('returns at least one book summary', () => {
    const result = parseSearchResults(searchHtml)
    expect(result.items.length).toBeGreaterThan(0)
  })

  it('each item has url, title, authors, and format=epub', () => {
    const result = parseSearchResults(searchHtml)
    const item = result.items[0]
    expect(item.url).toMatch(/^https:\/\/chitanka\.info\//)
    expect(item.title).toBeTruthy()
    expect(Array.isArray(item.authors)).toBe(true)
    expect(item.format).toBe('epub')
  })

  it('populates coverUrl from the books section when slug matches', () => {
    const result = parseSearchResults(searchHtml)
    const item = result.items.find(i => i.url.includes('na-ivan-vazov'))
    expect(item).toBeDefined()
    expect(item!.coverUrl).toBe('https://assets2.chitanka.info/thumb/book-cover/12/1234.120.jpg')
  })

  it('returns null nextPagePath when no pager is present', () => {
    const result = parseSearchResults(searchHtml)
    expect(result.nextPagePath).toBeNull()
  })

  it('extracts nextPagePath from li.next a pager', () => {
    const html = `<html><body>
      <ul class="pager">
        <li class="next"><a href="/new/books.html/3">Следваща</a></li>
      </ul>
    </body></html>`
    const result = parseSearchResults(html)
    expect(result.nextPagePath).toBe('/new/books.html/3')
  })

  it('extracts nextPagePath from li.next.more a pager (first-page variant)', () => {
    const html = `<html><body>
      <ul class="pager">
        <li class="next more"><a href="/new/books.html/2">Още нови книги</a></li>
      </ul>
    </body></html>`
    const result = parseSearchResults(html)
    expect(result.nextPagePath).toBe('/new/books.html/2')
  })
})

describe('parseDetailPage', () => {
  it('returns a ChitankaDetail with required fields', () => {
    const detail = parseDetailPage(detailHtml, DETAIL_URL)
    expect(detail.site).toBe('chitanka')
    expect(detail.title).toBeTruthy()
    expect(detail.authors.length).toBeGreaterThan(0)
    expect(detail.downloadUrl).toMatch(/https?:\/\//)
    expect(detail.format).toBe('epub')
  })

  it('translators defaults to empty array when absent', () => {
    const detail = parseDetailPage(detailHtml, DETAIL_URL)
    expect(Array.isArray(detail.translators)).toBe(true)
  })

  it('extracts series name and sequence number', () => {
    const detail = parseDetailPage(detailHtml, DETAIL_URL)
    expect(detail.series).not.toBeNull()
    expect(detail.series?.name).toBe('Трилогия „Бяла черква“')
    expect(detail.series?.sequence).toBe('2')
  })

  it('returns null series when absent', () => {
    const html = `<html><body><dl class="dl-horizontal"><dt>Година</dt><dd><span itemprop="datePublished">1894</span></dd></dl></body></html>`
    const detail = parseDetailPage(html, 'https://chitanka.info/text/1')
    expect(detail.series).toBeNull()
  })

  it('appends Форма to genres', () => {
    const html = `<html><body>
      <dl class="dl-horizontal">
        <dt>Форма</dt><dd><a href="/texts/type/novel">Роман</a></dd>
      </dl>
    </body></html>`
    const detail = parseDetailPage(html, 'https://chitanka.info/text/1')
    expect(detail.genres).toContain('Роман')
  })

  it('extracts description from Wikipedia article intro when meta is generic', () => {
    const detail = parseDetailPage(detailHtml, DETAIL_URL)
    expect(detail.description).toBeTruthy()
    expect(detail.description.length).toBeGreaterThan(50)
    // The fixture has a generic site meta, so the description should come
    // from the Wikipedia article intro paragraph (starts with „Под игото").
    expect(detail.description).toMatch(/Под игото/)
  })
})

describe('parseCategories', () => {
  it('extracts entries from /books/category/ links sorted alphabetically', () => {
    const html = `<html><body>
      <a href="/books/category/roman">Роман</a>
      <a href="/books/category/drama">Драма</a>
      <a href="/other/page">Ignore this</a>
    </body></html>`
    const result = parseCategories(html)
    expect(result).toHaveLength(2)
    expect(result[0]).toEqual({ label: 'Драма', path: '/books/category/drama' })
    expect(result[1]).toEqual({ label: 'Роман', path: '/books/category/roman' })
  })

  it('excludes @ system labels', () => {
    const html = `<html><body>
      <a href="/books/category/uncategorized">@Некатегоризирани</a>
      <a href="/books/category/roman">Роман</a>
    </body></html>`
    const result = parseCategories(html)
    expect(result).toHaveLength(1)
    expect(result[0].path).toBe('/books/category/roman')
  })

  it('deduplicates repeated links', () => {
    const html = `<html><body>
      <a href="/books/category/roman">Роман</a>
      <a href="/books/category/roman">Роман</a>
    </body></html>`
    const result = parseCategories(html)
    expect(result).toHaveLength(1)
  })
})
