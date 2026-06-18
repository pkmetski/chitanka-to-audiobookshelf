# Chitanka → Audiobookshelf Uploader Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local Next.js web app that browses Chitanka/Gramofonche, scrapes book metadata, and uploads books with metadata and cover art to an Audiobookshelf server.

**Architecture:** Next.js 15 App Router monolith with TypeScript API routes for scraping, downloading, and ABS communication. React UI for browse, detail, and settings screens. SSE streams upload progress to the browser via fetch + ReadableStream (not EventSource, which only supports GET).

**Tech Stack:** Next.js 15, TypeScript, Tailwind CSS, shadcn/ui, cheerio, vitest

## Global Constraints

- Next.js 15 with App Router only (no Pages Router)
- TypeScript `strict: true`
- ABS URL + token passed from client as `x-abs-url` and `x-abs-token` request headers — never stored server-side
- All scraping runs in Next.js API routes (server-side only)
- No headless browser — cheerio only
- No authentication, no batch upload, no deployment config — local `npm run dev` prototype only
- Unit tests cover scraper parse functions and ABS client; UI tested manually in the browser

---

## File Structure

```
app/
  layout.tsx                     Root layout with header
  page.tsx                       Redirects to /browse
  browse/
    page.tsx                     Main browse screen (source toggle + search + category nav + results grid + detail panel)
  settings/
    page.tsx                     Settings screen
  api/
    scrape/
      search/route.ts            GET ?site=chitanka|gramofonche&q=
      browse/route.ts            GET ?site=&path=
      detail/route.ts            GET ?url=
    abs/
      libraries/route.ts         GET (lists ABS libraries)
    upload/route.ts              POST with SSE progress stream

components/
  header.tsx                     Top bar with app title and gear icon → /settings
  settings-form.tsx              ABS URL + token inputs + "Test connection" button
  source-toggle.tsx              Chitanka / Gramofonche toggle
  search-bar.tsx                 Search input
  category-nav.tsx               Left sidebar with category links from the active site
  book-card.tsx                  Cover image, title, authors, format badge; clickable
  results-grid.tsx               Grid of book-cards
  detail-panel.tsx               Right panel: editable metadata + library picker + Upload button + progress
  upload-progress.tsx            Step progress display (Downloading / Uploading / Cover / Done / Error)

lib/
  scraper/
    types.ts                     Shared scraper types
    chitanka.ts                  Chitanka scraper (parse functions + fetch wrappers)
    gramofonche.ts               Gramofonche scraper (parse functions + fetch wrappers)
  abs/
    types.ts                     ABS API types
    client.ts                    ABS API client

hooks/
  use-settings.ts                Read/write ABS settings from localStorage
  use-sse-upload.ts              SSE-like upload hook using fetch + ReadableStream

tests/
  __fixtures__/
    chitanka-search.html
    chitanka-detail.html
    gramofonche-search.html
    gramofonche-detail.html
  lib/
    scraper/
      chitanka.test.ts
      gramofonche.test.ts
    abs/
      client.test.ts
```

---

### Task 1: Scaffold Next.js app + install dependencies

**Files:**
- Create: everything (via create-next-app + shadcn)
- Create: `vitest.config.ts`

- [ ] **Step 1: Scaffold Next.js 15 app**

Run from the workspace root (`tacoma/`):

```bash
npx create-next-app@latest . --typescript --tailwind --app --no-src-dir --import-alias "@/*" --yes
```

Expected: creates `app/`, `public/`, `next.config.ts`, `tailwind.config.ts`, `tsconfig.json`, `package.json`.

- [ ] **Step 2: Initialize shadcn/ui**

```bash
npx shadcn@latest init --defaults
```

Expected: creates `components/ui/` and `lib/utils.ts`, updates `tailwind.config.ts`. Accept all defaults.

- [ ] **Step 3: Add required shadcn components**

```bash
npx shadcn@latest add button input label card badge drawer select separator
```

- [ ] **Step 4: Install runtime and dev dependencies**

```bash
npm install cheerio
npm install --save-dev vitest @vitejs/plugin-react jsdom
```

- [ ] **Step 5: Create vitest.config.ts**

```typescript
import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
})
```

- [ ] **Step 6: Add test script to package.json**

In `package.json`, add to the `"scripts"` section:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 7: Verify dev server starts**

```bash
npm run dev
```

Open http://localhost:3000. Expect the default Next.js welcome page. Stop with Ctrl+C.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: scaffold Next.js 15 app with shadcn and vitest"
```

---

### Task 2: Shared types

**Files:**
- Create: `lib/scraper/types.ts`
- Create: `lib/abs/types.ts`

**Produces:** All shared types consumed by Tasks 3–12.

- [ ] **Step 1: Create lib/scraper/types.ts**

```typescript
export type Site = 'chitanka' | 'gramofonche'

export interface BookSummary {
  url: string           // full URL of the detail page
  title: string
  authors: string[]
  coverUrl: string | null
  format: 'epub' | 'mp3'
}

export interface ListingResult {
  items: BookSummary[]
  nextPagePath: string | null   // relative path, e.g. "/search?q=vazov&page=2", or null
}

export interface CategoryEntry {
  label: string
  path: string   // relative path, e.g. "/autor/ivan-vazov"
}

export interface ChitankaDetail {
  site: 'chitanka'
  url: string
  title: string
  authors: string[]
  translators: string[]
  description: string
  genres: string[]
  language: string
  year: string
  coverUrl: string | null
  downloadUrl: string
  format: 'epub'
}

export interface GramofoncheDetail {
  site: 'gramofonche'
  url: string
  title: string
  authors: string[]
  narrators: string[]
  description: string
  genres: string[]
  year: string
  duration: string
  coverUrl: string | null
  downloadUrl: string
  format: 'mp3'
}

export type BookDetail = ChitankaDetail | GramofoncheDetail
```

- [ ] **Step 2: Create lib/abs/types.ts**

```typescript
export interface AbsLibrary {
  id: string
  name: string
  mediaType: 'book' | 'podcast'
}

export interface AbsUploadMetadata {
  title: string
  authorName: string
  narratorName?: string
  description?: string
  genres?: string[]
  publishedYear?: string
  language?: string
}

export interface AbsUploadResult {
  id: string
}
```

- [ ] **Step 3: Commit**

```bash
git add lib/
git commit -m "feat: add shared scraper and ABS types"
```

---

### Task 3: Chitanka scraper

**Files:**
- Create: `lib/scraper/chitanka.ts`
- Create: `tests/__fixtures__/chitanka-search.html`
- Create: `tests/__fixtures__/chitanka-detail.html`
- Create: `tests/lib/scraper/chitanka.test.ts`

**Consumes:** `BookSummary`, `ListingResult`, `ChitankaDetail` from `lib/scraper/types.ts`

**Produces:**
- `parseSearchResults(html: string): ListingResult`
- `parseDetailPage(html: string, pageUrl: string): ChitankaDetail`
- `searchChitanka(query: string): Promise<ListingResult>`
- `browseChitanka(path: string): Promise<ListingResult>`
- `fetchChitankaDetail(url: string): Promise<ChitankaDetail>`

- [ ] **Step 1: Capture HTML fixtures**

```bash
mkdir -p tests/__fixtures__
curl -s "https://chitanka.info/search?q=vazov" -o tests/__fixtures__/chitanka-search.html
curl -s "https://chitanka.info/book/pod-igoto" -o tests/__fixtures__/chitanka-detail.html
```

- [ ] **Step 2: Identify CSS selectors from fixtures**

Inspect `tests/__fixtures__/chitanka-search.html` to determine:

```bash
# What wraps each result item?
grep -n 'class=' tests/__fixtures__/chitanka-search.html | head -60
```

Find and record:
- **Result item container** — the element repeated for each book (e.g. `li.book`, `.result`, `div.book-item`)
- **Title link** — the `<a>` with the book title inside each container
- **Author link(s)** — elements with author names inside each container
- **Cover image** — `<img>` src within each container
- **Next page link** — pagination link to the next page (look for "следваща", "next", or a `>` arrow)

Inspect `tests/__fixtures__/chitanka-detail.html` to find:
- **Page title** — the main `<h1>` or element with the book title
- **Authors** — look for "Автор:" label, then adjacent links
- **Translators** — look for "Превод:" label
- **Description** — the annotation/synopsis block
- **Genres** — tags or category links
- **Language** — look for "Език:" label
- **Year** — look for "Година:" label
- **Cover image** — the main cover `<img>`
- **EPUB download link** — `<a href="...epub">` or link labeled "epub"

Write down all selectors before proceeding to Step 3.

- [ ] **Step 3: Write failing tests**

Create `tests/lib/scraper/chitanka.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { parseSearchResults, parseDetailPage } from '@/lib/scraper/chitanka'

const searchHtml = readFileSync(resolve('tests/__fixtures__/chitanka-search.html'), 'utf-8')
const detailHtml = readFileSync(resolve('tests/__fixtures__/chitanka-detail.html'), 'utf-8')
const DETAIL_URL = 'https://chitanka.info/book/pod-igoto'

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
```

- [ ] **Step 4: Run tests — expect FAIL**

```bash
npx vitest run tests/lib/scraper/chitanka.test.ts
```

Expected: FAIL (module not found).

- [ ] **Step 5: Implement lib/scraper/chitanka.ts**

Replace every `/* SEL: ... */` comment with the real CSS selector you identified in Step 2:

```typescript
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
  return href.startsWith('http') ? href : `${BASE}${href}`
}

export function parseSearchResults(html: string): ListingResult {
  const $ = cheerio.load(html)
  const items: BookSummary[] = []

  /* SEL: result item container — from Step 2 inspection */
  $('RESULT_ITEM_SELECTOR').each((_, el) => {
    /* SEL: title link within result item */
    const titleEl = $(el).find('TITLE_LINK_SELECTOR').first()
    const title = titleEl.text().trim()
    const href = titleEl.attr('href') ?? ''
    const url = abs(href)

    const authors: string[] = []
    /* SEL: author element(s) within result item */
    $(el).find('AUTHOR_SELECTOR').each((_, a) => {
      const name = $(a).text().trim()
      if (name) authors.push(name)
    })

    const imgSrc = $(el).find('img').first().attr('src') ?? null
    const coverUrl = imgSrc ? abs(imgSrc) : null

    if (title && href) items.push({ url, title, authors, coverUrl, format: 'epub' })
  })

  /* SEL: "next page" pagination link */
  const nextHref = $('NEXT_PAGE_SELECTOR').attr('href') ?? null
  return { items, nextPagePath: nextHref }
}

export function parseDetailPage(html: string, pageUrl: string): ChitankaDetail {
  const $ = cheerio.load(html)

  /* SEL: main book title */
  const title = $('TITLE_SELECTOR').first().text().trim()

  const authors: string[] = []
  /* SEL: author link(s) on detail page */
  $('AUTHOR_SELECTOR').each((_, el) => {
    const name = $(el).text().trim()
    if (name) authors.push(name)
  })

  const translators: string[] = []
  /* SEL: translator link(s) — may not exist on all books */
  $('TRANSLATOR_SELECTOR').each((_, el) => {
    const name = $(el).text().trim()
    if (name) translators.push(name)
  })

  /* SEL: description/annotation block */
  const description = $('DESCRIPTION_SELECTOR').text().trim()

  const genres: string[] = []
  /* SEL: genre/category links */
  $('GENRE_SELECTOR').each((_, el) => {
    const g = $(el).text().trim()
    if (g) genres.push(g)
  })

  /* SEL: language label/value */
  const language = $('LANGUAGE_SELECTOR').text().trim()
  /* SEL: year label/value */
  const year = $('YEAR_SELECTOR').text().trim()

  const imgSrc = $('COVER_IMG_SELECTOR').first().attr('src') ?? null
  const coverUrl = imgSrc ? abs(imgSrc) : null

  /* href ending in .epub */
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
```

- [ ] **Step 6: Run tests — expect PASS**

```bash
npx vitest run tests/lib/scraper/chitanka.test.ts
```

If tests fail: check the selector strings against the fixture HTML and correct them.

- [ ] **Step 7: Commit**

```bash
git add lib/scraper/chitanka.ts tests/
git commit -m "feat: add chitanka scraper with fixture tests"
```

---

### Task 4: Gramofonche scraper

**Files:**
- Create: `lib/scraper/gramofonche.ts`
- Create: `tests/__fixtures__/gramofonche-search.html`
- Create: `tests/__fixtures__/gramofonche-detail.html`
- Create: `tests/lib/scraper/gramofonche.test.ts`

**Consumes:** `BookSummary`, `ListingResult`, `GramofoncheDetail` from `lib/scraper/types.ts`

**Produces:**
- `parseSearchResults(html: string): ListingResult`
- `parseDetailPage(html: string, pageUrl: string): GramofoncheDetail`
- `searchGramofonche(query: string): Promise<ListingResult>`
- `browseGramofonche(path: string): Promise<ListingResult>`
- `fetchGramofoncheDetail(url: string): Promise<GramofoncheDetail>`

- [ ] **Step 1: Capture HTML fixtures**

```bash
curl -s "https://gramofonche.chitanka.info/search?q=" -o tests/__fixtures__/gramofonche-search.html
# Find a real audiobook page URL from the search results, then:
curl -s "https://gramofonche.chitanka.info/book/SLUG" -o tests/__fixtures__/gramofonche-detail.html
```

- [ ] **Step 2: Identify CSS selectors from fixtures**

Same process as Task 3 Step 2. Additionally identify:
- **Narrator/reader element** — look for "Четец:", "Разказвач:", or similar label
- **Duration** — look for "Времетраене:", "Duration:", or a time value
- **MP3 download link** — `<a href="...mp3">` or `<a href="...zip">` for the audio file

Note: Gramofonche and Chitanka share the same codebase, so many selectors will be identical. The differences are the narrator, duration, and MP3 download link.

- [ ] **Step 3: Write failing tests**

Create `tests/lib/scraper/gramofonche.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { parseSearchResults, parseDetailPage } from '@/lib/scraper/gramofonche'

const searchHtml = readFileSync(resolve('tests/__fixtures__/gramofonche-search.html'), 'utf-8')
const detailHtml = readFileSync(resolve('tests/__fixtures__/gramofonche-detail.html'), 'utf-8')
const DETAIL_URL = 'https://gramofonche.chitanka.info/book/test-book'

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
    expect(detail.downloadUrl).toMatch(/https?:\/\//)
    expect(detail.format).toBe('mp3')
  })

  it('narrators defaults to empty array when absent', () => {
    const detail = parseDetailPage(detailHtml, DETAIL_URL)
    expect(Array.isArray(detail.narrators)).toBe(true)
  })
})
```

- [ ] **Step 4: Run tests — expect FAIL**

```bash
npx vitest run tests/lib/scraper/gramofonche.test.ts
```

- [ ] **Step 5: Implement lib/scraper/gramofonche.ts**

```typescript
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

function abs(href: string): string {
  return href.startsWith('http') ? href : `${BASE}${href}`
}

export function parseSearchResults(html: string): ListingResult {
  const $ = cheerio.load(html)
  const items: BookSummary[] = []

  /* SEL: result item container — from Step 2 inspection */
  $('RESULT_ITEM_SELECTOR').each((_, el) => {
    /* SEL: title link */
    const titleEl = $(el).find('TITLE_LINK_SELECTOR').first()
    const title = titleEl.text().trim()
    const href = titleEl.attr('href') ?? ''
    const url = abs(href)

    const authors: string[] = []
    /* SEL: author elements */
    $(el).find('AUTHOR_SELECTOR').each((_, a) => {
      const name = $(a).text().trim()
      if (name) authors.push(name)
    })

    const imgSrc = $(el).find('img').first().attr('src') ?? null
    const coverUrl = imgSrc ? abs(imgSrc) : null

    if (title && href) items.push({ url, title, authors, coverUrl, format: 'mp3' })
  })

  /* SEL: next page link */
  const nextHref = $('NEXT_PAGE_SELECTOR').attr('href') ?? null
  return { items, nextPagePath: nextHref }
}

export function parseDetailPage(html: string, pageUrl: string): GramofoncheDetail {
  const $ = cheerio.load(html)

  /* SEL: main title */
  const title = $('TITLE_SELECTOR').first().text().trim()

  const authors: string[] = []
  /* SEL: author links */
  $('AUTHOR_SELECTOR').each((_, el) => {
    const name = $(el).text().trim()
    if (name) authors.push(name)
  })

  const narrators: string[] = []
  /* SEL: narrator/reader links (Четец / Разказвач) */
  $('NARRATOR_SELECTOR').each((_, el) => {
    const name = $(el).text().trim()
    if (name) narrators.push(name)
  })

  /* SEL: description block */
  const description = $('DESCRIPTION_SELECTOR').text().trim()

  const genres: string[] = []
  /* SEL: genre links */
  $('GENRE_SELECTOR').each((_, el) => {
    const g = $(el).text().trim()
    if (g) genres.push(g)
  })

  /* SEL: year */
  const year = $('YEAR_SELECTOR').text().trim()
  /* SEL: duration (Времетраене) */
  const duration = $('DURATION_SELECTOR').text().trim()

  const imgSrc = $('COVER_IMG_SELECTOR').first().attr('src') ?? null
  const coverUrl = imgSrc ? abs(imgSrc) : null

  /* href ending in .mp3 or .zip */
  const audioHref =
    $('a[href$=".mp3"]').first().attr('href') ??
    $('a[href$=".zip"]').first().attr('href') ??
    ''
  const downloadUrl = abs(audioHref)

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
```

- [ ] **Step 6: Run tests — expect PASS**

```bash
npx vitest run tests/lib/scraper/gramofonche.test.ts
```

- [ ] **Step 7: Run all tests**

```bash
npm test
```

Expected: all passing.

- [ ] **Step 8: Commit**

```bash
git add lib/scraper/gramofonche.ts tests/
git commit -m "feat: add gramofonche scraper with fixture tests"
```

---

### Task 5: Scrape API routes

**Files:**
- Create: `app/api/scrape/search/route.ts`
- Create: `app/api/scrape/browse/route.ts`
- Create: `app/api/scrape/detail/route.ts`

**Consumes:**
- `searchChitanka`, `browseChitanka`, `fetchChitankaDetail` from `lib/scraper/chitanka.ts`
- `searchGramofonche`, `browseGramofonche`, `fetchGramofoncheDetail` from `lib/scraper/gramofonche.ts`

- [ ] **Step 1: Create app/api/scrape/search/route.ts**

```typescript
import { NextResponse } from 'next/server'
import { searchChitanka } from '@/lib/scraper/chitanka'
import { searchGramofonche } from '@/lib/scraper/gramofonche'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const site = searchParams.get('site')
  const q = searchParams.get('q') ?? ''

  if (!site || !q) {
    return NextResponse.json({ error: 'site and q are required' }, { status: 400 })
  }

  try {
    const result =
      site === 'chitanka'
        ? await searchChitanka(q)
        : await searchGramofonche(q)
    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
```

- [ ] **Step 2: Create app/api/scrape/browse/route.ts**

```typescript
import { NextResponse } from 'next/server'
import { browseChitanka } from '@/lib/scraper/chitanka'
import { browseGramofonche } from '@/lib/scraper/gramofonche'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const site = searchParams.get('site')
  const path = searchParams.get('path')

  if (!site || !path) {
    return NextResponse.json({ error: 'site and path are required' }, { status: 400 })
  }

  try {
    const result =
      site === 'chitanka'
        ? await browseChitanka(path)
        : await browseGramofonche(path)
    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
```

- [ ] **Step 3: Create app/api/scrape/detail/route.ts**

```typescript
import { NextResponse } from 'next/server'
import { fetchChitankaDetail } from '@/lib/scraper/chitanka'
import { fetchGramofoncheDetail } from '@/lib/scraper/gramofonche'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const url = searchParams.get('url')

  if (!url) {
    return NextResponse.json({ error: 'url is required' }, { status: 400 })
  }

  try {
    const detail = url.includes('gramofonche')
      ? await fetchGramofoncheDetail(url)
      : await fetchChitankaDetail(url)
    return NextResponse.json(detail)
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
```

- [ ] **Step 4: Smoke-test the routes**

Start the dev server:

```bash
npm run dev
```

In a separate terminal:

```bash
curl "http://localhost:3000/api/scrape/search?site=chitanka&q=vazov" | head -c 500
curl "http://localhost:3000/api/scrape/detail?url=https://chitanka.info/book/pod-igoto" | head -c 500
```

Expected: JSON responses with `{ items: [...] }` and `{ site: 'chitanka', title: ..., ... }`.

- [ ] **Step 5: Commit**

```bash
git add app/api/scrape/
git commit -m "feat: add scrape API routes (search, browse, detail)"
```

---

### Task 6: ABS API research + client

**Files:**
- Create: `lib/abs/client.ts`
- Create: `tests/lib/abs/client.test.ts`

**Consumes:** `AbsLibrary`, `AbsUploadMetadata`, `AbsUploadResult` from `lib/abs/types.ts`

**Produces:**
- `fetchAbsLibraries(absUrl: string, token: string): Promise<AbsLibrary[]>`
- `uploadToAbs(absUrl, token, libraryId, filePath, filename, metadata): Promise<AbsUploadResult>`
- `setAbsCoverFromUrl(absUrl, token, itemId, coverUrl): Promise<void>`

- [ ] **Step 1: Research ABS REST API endpoints**

Fetch the official ABS API documentation:

```bash
curl -s "https://api.audiobookshelf.org/" | head -200
```

Or open https://api.audiobookshelf.org/ in a browser and find:

1. **List libraries** endpoint — look for `GET /api/libraries`. Note the response shape, especially the field names (`id`, `name`, `mediaType`).
2. **Upload file with metadata** — search for "upload" in the docs. Note:
   - The exact endpoint URL (likely `POST /api/upload` or `POST /api/libraries/{id}/items`)
   - Whether metadata is multipart form fields or a JSON blob
   - The exact field names for title, author, narrator, description, genres, year, language
3. **Upload cover** — search for "cover". Note:
   - The endpoint (`POST /api/items/{id}/cover` or similar)
   - Whether it accepts a URL or requires the image bytes

Write down all endpoint URLs and field names before Step 2.

- [ ] **Step 2: Write failing tests**

Create `tests/lib/abs/client.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fetchAbsLibraries, uploadToAbs, setAbsCoverFromUrl } from '@/lib/abs/client'

const ABS_URL = 'http://localhost:13378'
const TOKEN = 'test-token'

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn())
})

describe('fetchAbsLibraries', () => {
  it('returns an array of libraries', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({ libraries: [{ id: 'lib1', name: 'Books', mediaType: 'book' }] }),
        { status: 200 }
      )
    )
    const libs = await fetchAbsLibraries(ABS_URL, TOKEN)
    expect(libs).toEqual([{ id: 'lib1', name: 'Books', mediaType: 'book' }])
  })

  it('sends the Authorization header', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ libraries: [] }), { status: 200 })
    )
    await fetchAbsLibraries(ABS_URL, TOKEN)
    expect(fetch).toHaveBeenCalledWith(
      `${ABS_URL}/api/libraries`,
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: `Bearer ${TOKEN}` }),
      })
    )
  })

  it('throws on non-200 response', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response('', { status: 401 }))
    await expect(fetchAbsLibraries(ABS_URL, TOKEN)).rejects.toThrow()
  })
})

describe('uploadToAbs', () => {
  it('returns the new item id', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ id: 'item-abc' }), { status: 200 })
    )
    const result = await uploadToAbs(ABS_URL, TOKEN, 'lib1', '/tmp/book.epub', 'book.epub', {
      title: 'Test Book',
      authorName: 'Test Author',
    })
    expect(result.id).toBe('item-abc')
  })
})

describe('setAbsCoverFromUrl', () => {
  it('resolves without throwing on success', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response('{}', { status: 200 }))
    await expect(
      setAbsCoverFromUrl(ABS_URL, TOKEN, 'item-abc', 'https://example.com/cover.jpg')
    ).resolves.not.toThrow()
  })
})
```

- [ ] **Step 3: Run tests — expect FAIL**

```bash
npx vitest run tests/lib/abs/client.test.ts
```

- [ ] **Step 4: Implement lib/abs/client.ts**

Use the endpoint URLs and field names discovered in Step 1. The upload endpoint and metadata field names are the critical unknowns — fill them in from Step 1.

```typescript
import { createReadStream, statSync } from 'fs'
import FormData from 'form-data'
import type { AbsLibrary, AbsUploadMetadata, AbsUploadResult } from './types'

function authHeaders(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` }
}

export async function fetchAbsLibraries(absUrl: string, token: string): Promise<AbsLibrary[]> {
  const res = await fetch(`${absUrl}/api/libraries`, {
    headers: authHeaders(token),
  })
  if (!res.ok) throw new Error(`ABS /api/libraries failed: ${res.status}`)
  const data = await res.json()
  return data.libraries as AbsLibrary[]
}

export async function uploadToAbs(
  absUrl: string,
  token: string,
  libraryId: string,
  filePath: string,
  filename: string,
  metadata: AbsUploadMetadata
): Promise<AbsUploadResult> {
  /*
   * ABS upload endpoint and field names — fill in from Step 1 research.
   *
   * Known pattern (verify against docs):
   *   POST /api/upload  (or /api/libraries/{libraryId}/items)
   *   multipart/form-data with:
   *     files[0] = the file binary
   *     title    = metadata.title
   *     author   = metadata.authorName
   *     ... other fields per ABS docs
   *
   * Replace the URL, form field names, and response shape below with the
   * real values from Step 1.
   */
  const form = new FormData()
  form.append('files', createReadStream(filePath), { filename })
  form.append('library', libraryId)
  form.append('folder', libraryId)   // ABS may require a folder ID too — verify
  form.append('title', metadata.title)
  form.append('author', metadata.authorName)
  if (metadata.narratorName) form.append('narrator', metadata.narratorName)
  if (metadata.description) form.append('description', metadata.description)
  if (metadata.publishedYear) form.append('publishedYear', metadata.publishedYear)
  if (metadata.language) form.append('language', metadata.language)
  if (metadata.genres?.length) form.append('genres', metadata.genres.join(','))

  // REPLACE endpoint with the correct one from Step 1 docs
  const res = await fetch(`${absUrl}/api/upload`, {
    method: 'POST',
    headers: { ...authHeaders(token), ...form.getHeaders() },
    body: form as unknown as BodyInit,
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`ABS upload failed ${res.status}: ${text}`)
  }
  const data = await res.json()
  // REPLACE 'id' with the actual field name from Step 1 response
  return { id: data.id ?? data.libraryItemId ?? data.itemId }
}

export async function setAbsCoverFromUrl(
  absUrl: string,
  token: string,
  itemId: string,
  coverUrl: string
): Promise<void> {
  // REPLACE endpoint and field name from Step 1 docs
  const res = await fetch(`${absUrl}/api/items/${itemId}/cover`, {
    method: 'POST',
    headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: coverUrl }),
  })
  if (!res.ok) throw new Error(`ABS cover upload failed: ${res.status}`)
}
```

**Note:** Install the `form-data` package if native `FormData` doesn't support `createReadStream` in Node.js:

```bash
npm install form-data
npm install --save-dev @types/form-data
```

- [ ] **Step 5: Run tests — expect PASS**

```bash
npx vitest run tests/lib/abs/client.test.ts
```

- [ ] **Step 6: Run all tests**

```bash
npm test
```

- [ ] **Step 7: Commit**

```bash
git add lib/abs/client.ts tests/lib/abs/
git commit -m "feat: add ABS API client with tests"
```

---

### Task 7: ABS libraries route + settings

**Files:**
- Create: `app/api/abs/libraries/route.ts`
- Create: `hooks/use-settings.ts`
- Create: `app/settings/page.tsx`
- Create: `components/settings-form.tsx`

**Consumes:** `fetchAbsLibraries` from `lib/abs/client.ts`

- [ ] **Step 1: Create app/api/abs/libraries/route.ts**

```typescript
import { NextResponse } from 'next/server'
import { fetchAbsLibraries } from '@/lib/abs/client'

export async function GET(req: Request) {
  const absUrl = req.headers.get('x-abs-url')
  const absToken = req.headers.get('x-abs-token')

  if (!absUrl || !absToken) {
    return NextResponse.json({ error: 'x-abs-url and x-abs-token headers required' }, { status: 400 })
  }

  try {
    const libraries = await fetchAbsLibraries(absUrl, absToken)
    return NextResponse.json({ libraries })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
```

- [ ] **Step 2: Create hooks/use-settings.ts**

```typescript
'use client'

import { useState, useEffect } from 'react'

export interface AbsSettings {
  absUrl: string
  absToken: string
}

const STORAGE_KEY = 'abs-settings'
const DEFAULT: AbsSettings = { absUrl: '', absToken: '' }

export function useSettings() {
  const [settings, setSettings] = useState<AbsSettings>(DEFAULT)

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) setSettings(JSON.parse(raw))
    } catch {
      // ignore parse errors
    }
  }, [])

  function save(next: AbsSettings) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    setSettings(next)
  }

  function absHeaders(): Record<string, string> {
    return {
      'x-abs-url': settings.absUrl,
      'x-abs-token': settings.absToken,
    }
  }

  return { settings, save, absHeaders }
}
```

- [ ] **Step 3: Create components/settings-form.tsx**

```typescript
'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useSettings } from '@/hooks/use-settings'

export function SettingsForm() {
  const { settings, save } = useSettings()
  const [absUrl, setAbsUrl] = useState(settings.absUrl)
  const [absToken, setAbsToken] = useState(settings.absToken)
  const [status, setStatus] = useState<string | null>(null)

  async function testConnection() {
    setStatus('Testing...')
    try {
      const res = await fetch('/api/abs/libraries', {
        headers: { 'x-abs-url': absUrl, 'x-abs-token': absToken },
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setStatus(`Connected — ${data.libraries.length} libraries found`)
    } catch (err) {
      setStatus(`Error: ${String(err)}`)
    }
  }

  function handleSave() {
    save({ absUrl, absToken })
    setStatus('Saved')
  }

  return (
    <div className="space-y-4 max-w-md">
      <div>
        <Label htmlFor="abs-url">Audiobookshelf server URL</Label>
        <Input
          id="abs-url"
          value={absUrl}
          onChange={(e) => setAbsUrl(e.target.value)}
          placeholder="http://localhost:13378"
        />
      </div>
      <div>
        <Label htmlFor="abs-token">API token</Label>
        <Input
          id="abs-token"
          type="password"
          value={absToken}
          onChange={(e) => setAbsToken(e.target.value)}
          placeholder="paste your ABS API token"
        />
      </div>
      <div className="flex gap-2">
        <Button onClick={handleSave}>Save</Button>
        <Button variant="outline" onClick={testConnection}>
          Test connection
        </Button>
      </div>
      {status && <p className="text-sm text-muted-foreground">{status}</p>}
    </div>
  )
}
```

- [ ] **Step 4: Create app/settings/page.tsx**

```typescript
import { SettingsForm } from '@/components/settings-form'

export default function SettingsPage() {
  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-6">Settings</h1>
      <SettingsForm />
    </div>
  )
}
```

- [ ] **Step 5: Manually test settings page**

```bash
npm run dev
```

Open http://localhost:3000/settings. Enter your ABS URL and token, click "Test connection". Expect: "Connected — N libraries found" (or an error message if ABS is unreachable). Click Save, refresh the page — settings should persist.

- [ ] **Step 6: Commit**

```bash
git add app/api/abs/ hooks/ app/settings/ components/settings-form.tsx
git commit -m "feat: add ABS libraries route, settings hook and settings page"
```

---

### Task 8: Browse UI — header, book card, results grid

**Files:**
- Modify: `app/layout.tsx`
- Create: `components/header.tsx`
- Create: `components/source-toggle.tsx`
- Create: `components/search-bar.tsx`
- Create: `components/book-card.tsx`
- Create: `components/results-grid.tsx`
- Create: `app/browse/page.tsx` (initial, wired to search only; category nav added in Task 9)

- [ ] **Step 1: Create components/header.tsx**

```typescript
import Link from 'next/link'
import { Settings } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function Header() {
  return (
    <header className="border-b px-4 h-14 flex items-center justify-between">
      <Link href="/browse" className="font-semibold text-lg">
        Chitanka → ABS
      </Link>
      <Button variant="ghost" size="icon" asChild>
        <Link href="/settings">
          <Settings className="h-5 w-5" />
          <span className="sr-only">Settings</span>
        </Link>
      </Button>
    </header>
  )
}
```

- [ ] **Step 2: Update app/layout.tsx**

```typescript
import type { Metadata } from 'next'
import './globals.css'
import { Header } from '@/components/header'

export const metadata: Metadata = {
  title: 'Chitanka → Audiobookshelf',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-1">{children}</main>
      </body>
    </html>
  )
}
```

- [ ] **Step 3: Update app/page.tsx to redirect**

```typescript
import { redirect } from 'next/navigation'

export default function Home() {
  redirect('/browse')
}
```

- [ ] **Step 4: Create components/source-toggle.tsx**

```typescript
'use client'

import { Button } from '@/components/ui/button'
import type { Site } from '@/lib/scraper/types'

interface Props {
  active: Site
  onChange: (site: Site) => void
}

export function SourceToggle({ active, onChange }: Props) {
  return (
    <div className="flex gap-2">
      <Button
        variant={active === 'chitanka' ? 'default' : 'outline'}
        size="sm"
        onClick={() => onChange('chitanka')}
      >
        Chitanka (ebooks)
      </Button>
      <Button
        variant={active === 'gramofonche' ? 'default' : 'outline'}
        size="sm"
        onClick={() => onChange('gramofonche')}
      >
        Gramofonche (audiobooks)
      </Button>
    </div>
  )
}
```

- [ ] **Step 5: Create components/search-bar.tsx**

```typescript
'use client'

import { useState, FormEvent } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

interface Props {
  onSearch: (query: string) => void
}

export function SearchBar({ onSearch }: Props) {
  const [value, setValue] = useState('')

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (value.trim()) onSearch(value.trim())
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Search books…"
        className="flex-1"
      />
      <Button type="submit">Search</Button>
    </form>
  )
}
```

- [ ] **Step 6: Create components/book-card.tsx**

```typescript
'use client'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import type { BookSummary } from '@/lib/scraper/types'

interface Props {
  book: BookSummary
  onClick: (book: BookSummary) => void
}

export function BookCard({ book, onClick }: Props) {
  return (
    <Card
      className="cursor-pointer hover:shadow-md transition-shadow"
      onClick={() => onClick(book)}
    >
      <CardContent className="p-3">
        {book.coverUrl ? (
          <img
            src={book.coverUrl}
            alt={book.title}
            className="w-full aspect-[2/3] object-cover rounded mb-2"
          />
        ) : (
          <div className="w-full aspect-[2/3] bg-muted rounded mb-2 flex items-center justify-center text-muted-foreground text-sm">
            No cover
          </div>
        )}
        <p className="font-medium text-sm line-clamp-2">{book.title}</p>
        <p className="text-muted-foreground text-xs line-clamp-1 mt-0.5">
          {book.authors.join(', ')}
        </p>
        <Badge variant="secondary" className="mt-1 text-xs">
          {book.format.toUpperCase()}
        </Badge>
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 7: Create components/results-grid.tsx**

```typescript
'use client'

import { BookCard } from './book-card'
import type { BookSummary } from '@/lib/scraper/types'

interface Props {
  items: BookSummary[]
  onSelect: (book: BookSummary) => void
}

export function ResultsGrid({ items, onSelect }: Props) {
  if (items.length === 0) {
    return <p className="text-muted-foreground text-sm py-8 text-center">No results</p>
  }
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
      {items.map((book) => (
        <BookCard key={book.url} book={book} onClick={onSelect} />
      ))}
    </div>
  )
}
```

- [ ] **Step 8: Create initial app/browse/page.tsx (search only)**

```typescript
'use client'

import { useState } from 'react'
import { SourceToggle } from '@/components/source-toggle'
import { SearchBar } from '@/components/search-bar'
import { ResultsGrid } from '@/components/results-grid'
import type { BookSummary, ListingResult, Site } from '@/lib/scraper/types'

export default function BrowsePage() {
  const [site, setSite] = useState<Site>('chitanka')
  const [results, setResults] = useState<BookSummary[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedBook, setSelectedBook] = useState<BookSummary | null>(null)

  async function handleSearch(query: string) {
    setLoading(true)
    try {
      const res = await fetch(
        `/api/scrape/search?site=${site}&q=${encodeURIComponent(query)}`
      )
      const data: ListingResult = await res.json()
      setResults(data.items)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <SourceToggle active={site} onChange={setSite} />
        <SearchBar onSearch={handleSearch} />
      </div>
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <ResultsGrid items={results} onSelect={setSelectedBook} />
      )}
      {/* Detail panel added in Task 10 */}
      {selectedBook && (
        <pre className="text-xs bg-muted p-2 rounded">{JSON.stringify(selectedBook, null, 2)}</pre>
      )}
    </div>
  )
}
```

- [ ] **Step 9: Manually test the browse page**

```bash
npm run dev
```

Open http://localhost:3000/browse. Toggle between Chitanka and Gramofonche, type a search query, click Search. Expect cards to appear. Click a card — expect JSON debug output at the bottom.

- [ ] **Step 10: Commit**

```bash
git add app/ components/header.tsx components/source-toggle.tsx components/search-bar.tsx components/book-card.tsx components/results-grid.tsx
git commit -m "feat: add browse page with search, source toggle, and results grid"
```

---

### Task 9: Category navigation

**Files:**
- Create: `components/category-nav.tsx`
- Modify: `app/browse/page.tsx` (add category nav and two-column layout)

**Consumes:** `/api/scrape/browse` route

- [ ] **Step 1: Create components/category-nav.tsx**

The categories are the site's own navigation structure (by author, by genre, new additions). These are hardcoded paths that mirror the site's own navigation — we don't scrape them dynamically.

```typescript
'use client'

import type { Site } from '@/lib/scraper/types'

interface NavItem {
  label: string
  path: string
}

const CHITANKA_NAV: NavItem[] = [
  { label: 'New additions', path: '/new' },
  { label: 'By author', path: '/autor' },
  { label: 'By genre', path: '/category' },
]

const GRAMOFONCHE_NAV: NavItem[] = [
  { label: 'New additions', path: '/new' },
  { label: 'By author', path: '/autor' },
  { label: 'By genre', path: '/category' },
]

interface Props {
  site: Site
  onNavigate: (path: string) => void
}

export function CategoryNav({ site, onNavigate }: Props) {
  const items = site === 'chitanka' ? CHITANKA_NAV : GRAMOFONCHE_NAV
  return (
    <nav className="space-y-1">
      <p className="text-xs font-semibold uppercase text-muted-foreground mb-2">Browse</p>
      {items.map((item) => (
        <button
          key={item.path}
          className="w-full text-left text-sm px-2 py-1.5 rounded hover:bg-muted transition-colors"
          onClick={() => onNavigate(item.path)}
        >
          {item.label}
        </button>
      ))}
    </nav>
  )
}
```

- [ ] **Step 2: Update app/browse/page.tsx to two-column layout**

Replace the contents of `app/browse/page.tsx` with:

```typescript
'use client'

import { useState } from 'react'
import { SourceToggle } from '@/components/source-toggle'
import { SearchBar } from '@/components/search-bar'
import { CategoryNav } from '@/components/category-nav'
import { ResultsGrid } from '@/components/results-grid'
import type { BookSummary, ListingResult, Site } from '@/lib/scraper/types'

export default function BrowsePage() {
  const [site, setSite] = useState<Site>('chitanka')
  const [results, setResults] = useState<BookSummary[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedBook, setSelectedBook] = useState<BookSummary | null>(null)

  async function loadResults(url: string) {
    setLoading(true)
    setSelectedBook(null)
    try {
      const res = await fetch(url)
      const data: ListingResult = await res.json()
      setResults(data.items)
    } finally {
      setLoading(false)
    }
  }

  function handleSearch(query: string) {
    loadResults(`/api/scrape/search?site=${site}&q=${encodeURIComponent(query)}`)
  }

  function handleNavigate(path: string) {
    loadResults(`/api/scrape/browse?site=${site}&path=${encodeURIComponent(path)}`)
  }

  function handleSiteChange(next: Site) {
    setSite(next)
    setResults([])
    setSelectedBook(null)
  }

  return (
    <div className="flex h-[calc(100vh-3.5rem)]">
      {/* Left sidebar */}
      <aside className="w-52 border-r p-4 shrink-0 overflow-y-auto">
        <CategoryNav site={site} onNavigate={handleNavigate} />
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="p-4 border-b flex flex-col gap-3 sm:flex-row sm:items-center">
          <SourceToggle active={site} onChange={handleSiteChange} />
          <SearchBar onSearch={handleSearch} />
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (
            <ResultsGrid items={results} onSelect={setSelectedBook} />
          )}
        </div>
      </div>

      {/* Detail panel placeholder — replaced in Task 10 */}
      {selectedBook && (
        <aside className="w-80 border-l p-4 overflow-y-auto shrink-0">
          <pre className="text-xs">{JSON.stringify(selectedBook, null, 2)}</pre>
        </aside>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Manually test category nav**

Open http://localhost:3000/browse. Click "By author" in the left sidebar. Expect a list of author results to appear. Toggle site to Gramofonche and click a nav item — expect results from Gramofonche.

- [ ] **Step 4: Commit**

```bash
git add components/category-nav.tsx app/browse/page.tsx
git commit -m "feat: add category navigation sidebar and two-column browse layout"
```

---

### Task 10: Detail panel

**Files:**
- Create: `components/detail-panel.tsx`
- Modify: `app/browse/page.tsx` (replace JSON debug output with `<DetailPanel>`)

**Consumes:**
- `/api/scrape/detail` route
- `/api/abs/libraries` route
- `useSettings` from `hooks/use-settings.ts`
- `BookDetail`, `BookSummary`, `ChitankaDetail`, `GramofoncheDetail` from `lib/scraper/types.ts`
- `AbsLibrary` from `lib/abs/types.ts`

- [ ] **Step 1: Create components/detail-panel.tsx**

```typescript
'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useSettings } from '@/hooks/use-settings'
import type { BookDetail, BookSummary } from '@/lib/scraper/types'
import type { AbsLibrary } from '@/lib/abs/types'

interface Props {
  book: BookSummary
  onUpload: (detail: BookDetail, libraryId: string) => void
}

export function DetailPanel({ book, onUpload }: Props) {
  const { absHeaders } = useSettings()
  const [detail, setDetail] = useState<BookDetail | null>(null)
  const [libraries, setLibraries] = useState<AbsLibrary[]>([])
  const [libraryId, setLibraryId] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Editable fields — initialized from detail once loaded
  const [title, setTitle] = useState('')
  const [authors, setAuthors] = useState('')
  const [narrators, setNarrators] = useState('')
  const [description, setDescription] = useState('')
  const [genres, setGenres] = useState('')
  const [year, setYear] = useState('')
  const [language, setLanguage] = useState('')

  useEffect(() => {
    setLoading(true)
    setError(null)

    Promise.all([
      fetch(`/api/scrape/detail?url=${encodeURIComponent(book.url)}`).then((r) => r.json()),
      fetch('/api/abs/libraries', { headers: absHeaders() }).then((r) => r.json()),
    ])
      .then(([detailData, libData]: [BookDetail, { libraries: AbsLibrary[] }]) => {
        setDetail(detailData)
        setTitle(detailData.title)
        setAuthors(detailData.authors.join(', '))
        setNarrators(
          'narrators' in detailData ? detailData.narrators.join(', ') : ''
        )
        setDescription(detailData.description)
        setGenres(detailData.genres.join(', '))
        setYear(detailData.year)
        setLanguage('language' in detailData ? detailData.language : '')
        setLibraries(libData.libraries ?? [])
        if (libData.libraries?.length) setLibraryId(libData.libraries[0].id)
      })
      .catch((err) => setError(String(err)))
      .finally(() => setLoading(false))
  }, [book.url])

  if (loading) return <p className="text-sm text-muted-foreground p-4">Loading…</p>
  if (error) return <p className="text-sm text-destructive p-4">{error}</p>
  if (!detail) return null

  function handleUpload() {
    if (!detail || !libraryId) return
    const edited: BookDetail = {
      ...detail,
      title,
      authors: authors.split(',').map((s) => s.trim()).filter(Boolean),
      description,
      genres: genres.split(',').map((s) => s.trim()).filter(Boolean),
      year,
      ...('narrators' in detail && { narrators: narrators.split(',').map((s) => s.trim()).filter(Boolean) }),
      ...('language' in detail && { language }),
    }
    onUpload(edited, libraryId)
  }

  return (
    <div className="space-y-3 p-4">
      {detail.coverUrl && (
        <img src={detail.coverUrl} alt={detail.title} className="w-full rounded" />
      )}

      <Field label="Title" value={title} onChange={setTitle} />
      <Field label="Author(s)" value={authors} onChange={setAuthors} hint="comma-separated" />
      {detail.site === 'gramofonche' && (
        <Field label="Narrator(s)" value={narrators} onChange={setNarrators} hint="comma-separated" />
      )}
      <Field label="Description" value={description} onChange={setDescription} textarea />
      <Field label="Genres" value={genres} onChange={setGenres} hint="comma-separated" />
      <Field label="Year" value={year} onChange={setYear} />
      {detail.site === 'chitanka' && (
        <Field label="Language" value={language} onChange={setLanguage} />
      )}

      <div>
        <Label>Library</Label>
        <Select value={libraryId} onValueChange={setLibraryId}>
          <SelectTrigger>
            <SelectValue placeholder="Choose library…" />
          </SelectTrigger>
          <SelectContent>
            {libraries.map((lib) => (
              <SelectItem key={lib.id} value={lib.id}>
                {lib.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Button className="w-full" disabled={!libraryId} onClick={handleUpload}>
        Upload to Audiobookshelf
      </Button>
    </div>
  )
}

function Field({
  label,
  value,
  onChange,
  hint,
  textarea,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  hint?: string
  textarea?: boolean
}) {
  return (
    <div>
      <Label>{label}{hint && <span className="text-muted-foreground text-xs ml-1">({hint})</span>}</Label>
      {textarea ? (
        <textarea
          className="w-full border rounded px-3 py-2 text-sm min-h-[80px] resize-y bg-background"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <Input value={value} onChange={(e) => onChange(e.target.value)} />
      )}
    </div>
  )
}
```

- [ ] **Step 2: Update app/browse/page.tsx to use DetailPanel**

Replace the `{selectedBook && ...}` aside at the bottom of browse/page.tsx with:

```typescript
{selectedBook && (
  <aside className="w-80 border-l overflow-y-auto shrink-0">
    <DetailPanel
      book={selectedBook}
      onUpload={(detail, libraryId) => {
        // upload handled in Task 12
        console.log('Upload:', detail, libraryId)
      }}
    />
  </aside>
)}
```

Add the import at the top:

```typescript
import { DetailPanel } from '@/components/detail-panel'
```

- [ ] **Step 3: Manually test the detail panel**

Open http://localhost:3000/browse. Search for a book. Click a card. Expect:
- The right panel loads with full metadata
- All fields are editable
- The library dropdown shows your ABS libraries (requires ABS running and settings configured)
- "Upload to Audiobookshelf" button is enabled once a library is selected and logs to console

- [ ] **Step 4: Commit**

```bash
git add components/detail-panel.tsx app/browse/page.tsx
git commit -m "feat: add detail panel with editable metadata and library picker"
```

---

### Task 11: Upload API route with SSE

**Files:**
- Create: `app/api/upload/route.ts`

**Consumes:**
- `uploadToAbs`, `setAbsCoverFromUrl` from `lib/abs/client.ts`
- `AbsUploadMetadata` from `lib/abs/types.ts`
- `BookDetail` from `lib/scraper/types.ts`

- [ ] **Step 1: Create app/api/upload/route.ts**

```typescript
import { writeFile, unlink, mkdtemp } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { uploadToAbs, setAbsCoverFromUrl } from '@/lib/abs/client'
import type { BookDetail } from '@/lib/scraper/types'
import type { AbsUploadMetadata } from '@/lib/abs/types'

interface UploadRequest {
  detail: BookDetail
  libraryId: string
}

type UploadStatus = 'downloading' | 'uploading' | 'cover' | 'done' | 'error'

interface StatusEvent {
  status: UploadStatus
  message: string
  error?: string
}

export async function POST(req: Request) {
  const absUrl = req.headers.get('x-abs-url')
  const absToken = req.headers.get('x-abs-token')

  if (!absUrl || !absToken) {
    return new Response('x-abs-url and x-abs-token headers required', { status: 400 })
  }

  const body: UploadRequest = await req.json()
  const { detail, libraryId } = body
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      function send(event: StatusEvent) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
      }

      let tempPath: string | null = null

      try {
        // Step 1: Download file
        send({ status: 'downloading', message: `Downloading ${detail.format.toUpperCase()} file…` })

        const fileRes = await fetch(detail.downloadUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0 chitanka-abs-uploader/1.0' },
        })
        if (!fileRes.ok) throw new Error(`Download failed: ${fileRes.status}`)

        const buffer = await fileRes.arrayBuffer()
        const ext = detail.format === 'epub' ? '.epub' : '.mp3'
        const filename = `${detail.title.replace(/[^a-z0-9]/gi, '_')}${ext}`

        const dir = await mkdtemp(join(tmpdir(), 'chitanka-'))
        tempPath = join(dir, filename)
        await writeFile(tempPath, Buffer.from(buffer))

        // Step 2: Upload to ABS
        send({ status: 'uploading', message: 'Uploading to Audiobookshelf…' })

        const metadata: AbsUploadMetadata = {
          title: detail.title,
          authorName: detail.authors.join(', '),
          narratorName: 'narrators' in detail ? detail.narrators.join(', ') : undefined,
          description: detail.description || undefined,
          genres: detail.genres.length ? detail.genres : undefined,
          publishedYear: detail.year || undefined,
          language: 'language' in detail ? detail.language || undefined : undefined,
        }

        const uploadResult = await uploadToAbs(
          absUrl,
          absToken,
          libraryId,
          tempPath,
          filename,
          metadata
        )

        // Step 3: Upload cover
        if (detail.coverUrl) {
          send({ status: 'cover', message: 'Setting cover art…' })
          await setAbsCoverFromUrl(absUrl, absToken, uploadResult.id, detail.coverUrl)
        }

        send({ status: 'done', message: 'Done! Item added to Audiobookshelf.' })
      } catch (err) {
        send({ status: 'error', message: 'Upload failed', error: String(err) })
      } finally {
        if (tempPath) {
          unlink(tempPath).catch(() => {}) // best-effort cleanup
        }
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}
```

- [ ] **Step 2: Commit**

```bash
git add app/api/upload/
git commit -m "feat: add upload API route with SSE progress stream"
```

---

### Task 12: Upload progress UI + full integration

**Files:**
- Create: `hooks/use-sse-upload.ts`
- Create: `components/upload-progress.tsx`
- Modify: `components/detail-panel.tsx` (replace console.log with real upload)
- Modify: `app/browse/page.tsx` (wire settings headers into onUpload callback)

**Consumes:**
- `useSettings` from `hooks/use-settings.ts`
- `/api/upload` route

- [ ] **Step 1: Create hooks/use-sse-upload.ts**

```typescript
'use client'

import { useState, useCallback } from 'react'
import type { BookDetail } from '@/lib/scraper/types'

export type UploadStatus = 'idle' | 'downloading' | 'uploading' | 'cover' | 'done' | 'error'

export interface UploadState {
  status: UploadStatus
  message: string
  error?: string
}

export function useSseUpload() {
  const [state, setState] = useState<UploadState>({ status: 'idle', message: '' })

  const startUpload = useCallback(
    (detail: BookDetail, libraryId: string, absHeaders: Record<string, string>) => {
      setState({ status: 'downloading', message: 'Starting…' })

      fetch('/api/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...absHeaders },
        body: JSON.stringify({ detail, libraryId }),
      })
        .then(async (res) => {
          if (!res.body) throw new Error('No response body')
          const reader = res.body.getReader()
          const decoder = new TextDecoder()

          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            const text = decoder.decode(value, { stream: true })
            for (const line of text.split('\n')) {
              if (line.startsWith('data: ')) {
                try {
                  const event = JSON.parse(line.slice(6))
                  setState(event)
                } catch {
                  // skip malformed lines
                }
              }
            }
          }
        })
        .catch((err) => {
          setState({ status: 'error', message: 'Upload failed', error: String(err) })
        })
    },
    []
  )

  function reset() {
    setState({ status: 'idle', message: '' })
  }

  return { state, startUpload, reset }
}
```

- [ ] **Step 2: Create components/upload-progress.tsx**

```typescript
'use client'

import type { UploadState } from '@/hooks/use-sse-upload'
import { Button } from '@/components/ui/button'

const STEPS = ['downloading', 'uploading', 'cover', 'done'] as const

interface Props {
  state: UploadState
  onReset: () => void
}

export function UploadProgress({ state, onReset }: Props) {
  if (state.status === 'idle') return null

  const currentIndex = STEPS.indexOf(state.status as typeof STEPS[number])

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        {STEPS.map((step, i) => {
          const isDone = i < currentIndex || state.status === 'done'
          const isActive = step === state.status
          return (
            <div
              key={step}
              className={`text-sm flex items-center gap-2 ${
                isDone
                  ? 'text-green-600'
                  : isActive
                  ? 'text-foreground font-medium'
                  : 'text-muted-foreground'
              }`}
            >
              <span>{isDone ? '✓' : isActive ? '→' : '○'}</span>
              <span className="capitalize">{step}</span>
            </div>
          )
        })}
      </div>

      <p className="text-sm">{state.message}</p>

      {state.status === 'error' && (
        <p className="text-sm text-destructive">{state.error}</p>
      )}

      {(state.status === 'done' || state.status === 'error') && (
        <Button size="sm" variant="outline" onClick={onReset}>
          Upload another
        </Button>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Update components/detail-panel.tsx to use upload hook**

Add these imports at the top of `detail-panel.tsx`:

```typescript
import { useSseUpload } from '@/hooks/use-sse-upload'
import { UploadProgress } from './upload-progress'
```

Add the hook inside `DetailPanel` (alongside existing `useState` calls):

```typescript
const { state: uploadState, startUpload, reset: resetUpload } = useSseUpload()
```

Replace the `<Button>` and `onUpload` callback in `DetailPanel`:

Remove the `onUpload` prop from the interface and the component signature. The detail panel now owns the upload directly:

```typescript
// Remove from Props interface:
onUpload: (detail: BookDetail, libraryId: string) => void

// Replace with in-component upload handler:
function handleUpload() {
  if (!detail || !libraryId) return
  const edited: BookDetail = {
    ...detail,
    title,
    authors: authors.split(',').map((s) => s.trim()).filter(Boolean),
    description,
    genres: genres.split(',').map((s) => s.trim()).filter(Boolean),
    year,
    ...('narrators' in detail && { narrators: narrators.split(',').map((s) => s.trim()).filter(Boolean) }),
    ...('language' in detail && { language }),
  }
  startUpload(edited, libraryId, absHeaders())
}
```

Replace the Upload button and add `<UploadProgress>` below it:

```typescript
{uploadState.status === 'idle' ? (
  <Button className="w-full" disabled={!libraryId} onClick={handleUpload}>
    Upload to Audiobookshelf
  </Button>
) : (
  <UploadProgress state={uploadState} onReset={resetUpload} />
)}
```

- [ ] **Step 4: Update app/browse/page.tsx onUpload prop**

Since `DetailPanel` no longer takes an `onUpload` prop, remove it from the JSX in `app/browse/page.tsx`:

```typescript
<DetailPanel book={selectedBook} />
```

- [ ] **Step 5: Manually test the full upload flow**

Prerequisites: ABS server running locally, settings configured at /settings.

1. Open http://localhost:3000/browse
2. Search for a book on Chitanka
3. Click a card → detail panel opens
4. Edit any metadata field
5. Choose a library
6. Click "Upload to Audiobookshelf"
7. Expect: steps progress Downloading → Uploading → Cover → Done
8. Open ABS and verify the item appears in the chosen library with correct metadata and cover art

- [ ] **Step 6: Run full test suite**

```bash
npm test
```

Expected: all passing.

- [ ] **Step 7: Commit**

```bash
git add hooks/use-sse-upload.ts components/upload-progress.tsx components/detail-panel.tsx app/browse/page.tsx
git commit -m "feat: add upload progress UI and wire full upload flow end-to-end"
```

---

## Self-Review

### Spec coverage

| Spec section | Covered by |
|---|---|
| Browse + search UI | Tasks 8, 9 |
| Detail/metadata panel with editable fields | Task 10 |
| Settings screen + connection test | Task 7 |
| Scraping (Chitanka + Gramofonche) | Tasks 3, 4, 5 |
| Upload flow (download → upload → cover → cleanup) | Task 11 |
| SSE progress | Tasks 11, 12 |
| ABS library picker | Task 10 |
| localStorage settings, passed as headers | Tasks 7 (hook), 11 (route) |
| Cover art via separate POST | Task 11 |
| Temp file cleanup | Task 11 |
| API routes (search, browse, detail, libraries, upload) | Tasks 5, 7, 11 |
| Narrator/reader field (Gramofonche only) | Tasks 4, 10, 11 |
| Translator field (Chitanka only) | Tasks 3, 10 |

### Remaining unknowns (require verification during execution)

1. **CSS selectors** (Tasks 3, 4 Step 2) — cannot be determined without inspecting live site HTML
2. **ABS upload endpoint + field names** (Task 6 Step 1) — must be verified against https://api.audiobookshelf.org/
3. **Gramofonche detail page URL** (Task 4 Step 1) — need a real page URL to capture the fixture
