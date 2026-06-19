import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { parseSearchResults, parseDetailPage } from '@/lib/scraper/gramofonche'

const searchHtml = readFileSync(resolve('tests/__fixtures__/gramofonche-search.html'), 'utf-8')
const detailHtml = readFileSync(resolve('tests/__fixtures__/gramofonche-detail.html'), 'utf-8')
const DETAIL_URL = 'https://gramofonche.chitanka.info/prikazki/abanosoviia-kon/'

describe('parseSearchResults', () => {
  it('returns at least one book summary', () => {
    const result = parseSearchResults(searchHtml)
    expect(result.items.length).toBeGreaterThan(0)
  })

  it('each item has url, title, authors, and format=mp3', () => {
    const result = parseSearchResults(searchHtml)
    const item = result.items[0]
    expect(item.url).toMatch(/^https:\/\/gramofonche\.chitanka\.info\//)
    expect(item.title).toBeTruthy()
    expect(Array.isArray(item.authors)).toBe(true)
    expect(item.format).toBe('mp3')
  })
})

describe('parseDetailPage', () => {
  it('returns a GramofoncheDetail with required fields', () => {
    const detail = parseDetailPage(detailHtml, DETAIL_URL)
    expect(detail.site).toBe('gramofonche')
    expect(detail.title).toBeTruthy()
    expect(detail.authors.length).toBeGreaterThan(0)
    expect(detail.downloads.length).toBeGreaterThan(0)
    expect(detail.downloads[0].url).toMatch(/https?:\/\//)
    expect(detail.downloads[0].title).toBeTruthy()
    expect(detail.format).toBe('mp3')
  })

  it('narrators defaults to empty array when absent', () => {
    const detail = parseDetailPage(detailHtml, DETAIL_URL)
    expect(Array.isArray(detail.narrators)).toBe(true)
  })

  it('extracts description from blockquote when no meta description', () => {
    const detail = parseDetailPage(detailHtml, DETAIL_URL)
    expect(detail.description).toBeTruthy()
    expect(detail.description).toMatch(/изпълнение/)
  })
})
