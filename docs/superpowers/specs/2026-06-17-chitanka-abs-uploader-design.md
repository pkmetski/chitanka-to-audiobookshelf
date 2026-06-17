# Chitanka → Audiobookshelf Uploader — Design Spec

**Date:** 2026-06-17  
**Status:** Approved  

---

## Overview

A locally-run Next.js web app that lets you browse and search chitanka.info (ebooks) and gramofonche.chitanka.info (audiobooks), scrape metadata from book/audiobook pages, review and edit that metadata, then upload the file with metadata to an Audiobookshelf (ABS) server in a chosen library.

---

## Architecture

A **Next.js 15 (App Router)** app running locally via `npm run dev`. All scraping, file downloading, and ABS communication happens in **API routes** (server-side), avoiding CORS and keeping the ABS token off the client.

```
Browser (React UI)
    ↕ fetch
Next.js API Routes
    ↕ scrape             ↕ download           ↕ ABS REST API
chitanka.info         OS temp dir          ABS server (local or remote)
gramofonche.chitanka.info
```

**Tech stack:**
- Next.js 15, App Router, TypeScript
- Tailwind CSS + shadcn/ui
- `cheerio` for server-side HTML scraping
- Native `fetch` for HTTP (scraping + ABS calls)
- `fs`, `os.tmpdir()` for temp file handling
- localStorage for persisting settings client-side

---

## UI Screens

### 1. Main Browse Screen (default)

Two-column layout:

- **Left panel:** source toggle (Chitanka / Gramofonche) + search bar + category/listing navigation mirroring the site's own structure (e.g. by author, by genre, new additions)
- **Right panel:** results grid — cover image, title, author, format badge (EPUB / MP3); click a card to open the Detail Panel

### 2. Detail / Metadata Panel

Slides in (drawer or replaces right panel) when a result card is clicked. Shows all scraped fields as editable inputs:

**Chitanka (ebooks):**
- Title, author(s), translator
- Description/annotation
- Genre/tags
- Language, publication year
- Cover image preview

**Gramofonche (audiobooks):**
- Title, author(s)
- Narrator / reader
- Description
- Genre, year, duration
- Cover image preview

Below the fields:
- ABS library dropdown (fetched live from ABS server)
- **Upload** button
- Progress indicator (Downloading → Uploading → Setting cover → Done)

### 3. Settings Screen

Accessible via gear icon in header. Fields:
- ABS server URL
- ABS API token
- "Test connection" button (pings ABS, shows library count)

Persisted to localStorage. Passed to API routes as request headers.

---

## Scraping

Both sites are server-rendered static HTML — `cheerio` (jQuery-like, runs in Node.js) is sufficient; no headless browser needed.

**Chitanka entrypoints:**
- Search: `/search?q=`
- By author: `/autor`
- By genre: `/category`
- New additions: `/new`
- Book detail page: scrape title, author(s), translator, description, genre tags, cover image URL, year, language, EPUB download link

**Gramofonche entrypoints:**
- Same structure as Chitanka
- Additional fields: narrator/reader, duration, MP3 download link (single file or zip)

All listing pages are paginated; the scraper follows `next page` links and appends results.

---

## Upload Flow

Triggered when the user clicks **Upload** from the Detail Panel.

1. **Fetch file** — API route streams the MP3 or EPUB from the source site to a temp file in `os.tmpdir()`
2. **Upload to ABS with metadata** — single multipart `POST` to the ABS library endpoint, including the file and all metadata fields (title, author, narrator, description, genres, year, language) in one request
3. **Upload cover** — `POST` the scraped cover image to the new ABS item's cover endpoint (requires item ID from step 2; done sequentially)
4. **Cleanup** — delete the temp file

Progress feedback is streamed to the UI via **Server-Sent Events** on the upload API route. Each step emits a status event the client displays in real time.

Errors at any step are surfaced in the UI with a descriptive message.

---

## API Routes

| Route | Method | Description |
|---|---|---|
| `/api/scrape/search` | GET | `?site=chitanka\|gramofonche&q=` — search results |
| `/api/scrape/browse` | GET | `?site=&path=` — category/listing page results |
| `/api/scrape/detail` | GET | `?url=` — full metadata for a single item |
| `/api/abs/libraries` | GET | List libraries from ABS (uses token from header) |
| `/api/upload` | POST | Full upload flow with SSE progress stream |

---

## Metadata Mapping

Exact ABS API field names to be confirmed against ABS docs during implementation. Intended mapping:

| Scraped field | ABS field (approximate) |
|---|---|
| title | title |
| author(s) | authorName |
| narrator/reader | narratorName (audiobooks only) |
| description | description |
| genre tags | genres[] |
| year | publishedYear |
| language | language |
| cover image | uploaded via cover endpoint |

---

## Out of Scope (for this prototype)

- Authentication / multi-user support
- Batch uploads (multiple items at once)
- Download history / local database
- Supporting formats other than EPUB (Chitanka) and MP3 (Gramofonche)
- Deployment beyond local `npm run dev`
