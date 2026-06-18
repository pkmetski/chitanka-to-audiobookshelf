import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { parseSearchResults, parseDetailPage } from '@/lib/scraper/chitanka'

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
})
