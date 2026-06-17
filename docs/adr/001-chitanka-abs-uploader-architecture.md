# ADR 001: Chitanka → Audiobookshelf Uploader Architecture

**Date:** 2026-06-17  
**Status:** Accepted  

---

## Context

We need a local web app that lets a user browse/search chitanka.info (ebooks) and gramofonche.chitanka.info (audiobooks), scrape metadata from book pages, review and edit that metadata, then upload the file to an Audiobookshelf (ABS) server in a chosen library.

Three browsing approaches were considered:

- **Proxy browser** — rewrite Chitanka HTML server-side and serve it through the app
- **Custom browse/search UI** — scrape content into JSON, render as React cards
- **Iframe + overlay** — embed the actual sites in iframes with a "Grab" button overlay

Three hosting approaches were evaluated:

- **Full-stack Next.js** — single runtime, API routes for all server work
- **Next.js + Python FastAPI** — Next.js UI, Python backend for scraping/uploading
- **Next.js + separate Go/Rust backend** — not evaluated further (overkill for prototype)

---

## Decisions

### 1. Custom browse/search UI over proxy browser or iframe

The proxy approach requires fragile HTML link-rewriting and CSS/JS injection that breaks easily on site updates. The iframe approach is blocked by `X-Frame-Options` headers on both Chitanka sites. A custom React UI backed by server-side scraping API routes is robust, maintainable, and decoupled from the sites' visual design.

### 2. Next.js 15 (App Router) monolith over split backend

A single Next.js app with API routes covers all server-side needs (scraping, downloading, ABS communication) without requiring two runtimes. For a local prototype this eliminates operational overhead. If the scraping logic grows complex enough to warrant Python, it can be extracted to a sidecar service later.

### 3. Cheerio for scraping, no headless browser

Both chitanka.info and gramofonche.chitanka.info serve server-rendered static HTML. Cheerio (jQuery-like Node.js HTML parser) is sufficient and far lighter than Playwright or Puppeteer. No JavaScript execution is needed to retrieve content.

### 4. Server-Sent Events for upload progress

The upload flow (download file → upload to ABS → upload cover) is sequential and can take tens of seconds. SSE on the `/api/upload` route lets the UI show granular per-step progress ("Downloading… Uploading… Setting cover… Done") without polling or WebSocket complexity.

### 5. localStorage for settings, passed as request headers

ABS URL and API token are stored in localStorage and passed to API routes as request headers. No server-side config file or database is needed for a local single-user prototype. If this graduates to a hosted tool, the settings layer can be replaced with a proper secrets store.

### 6. Upload metadata in a single multipart POST

ABS supports providing metadata alongside the file in the initial upload request. We provide all scraped fields (title, author, narrator, description, genres, year, language) in that single call rather than uploading the file first and patching metadata afterwards. Cover art requires a separate POST to the item's cover endpoint (ABS API constraint) and is done sequentially after the initial upload.

---

## Consequences

- **Scraping is fragile by nature** — if Chitanka or Gramofonche restructure their HTML, scrapers will need updating. Accepted trade-off for a prototype.
- **Temp files on disk** — the download-then-upload flow writes to `os.tmpdir()`. Files are cleaned up after upload but an interrupted process leaves orphans. Acceptable for local use.
- **ABS API field names unverified** — exact field names must be confirmed against ABS REST API docs during implementation. The metadata mapping in the spec is approximate.
- **No batch upload** — uploading one item at a time is sufficient for personal use and keeps the implementation simple.
