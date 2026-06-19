# ABS Duplicate Detection — Design

**Date:** 2026-06-19  
**Status:** approved

## Problem

The browse/search results grid shows items from Chitanka (EPUBs) and Gramofonche (MP3 audiobooks) without any indication of which titles already exist in Audiobookshelf. Users must remember or manually cross-reference before uploading, risking accidental duplicates.

## Goal

Visually mark items in the results grid that already exist in ABS — across all libraries, for both sources — so the user can skip them at a glance.

## Decisions

| Question | Decision |
|----------|----------|
| Which libraries to check? | All libraries (no source-to-library mapping needed) |
| Where to compute matches? | Client-side, after a single background fetch |
| Matching strategy | Normalized substring containment in either direction |
| Visual treatment | Dimmed card (`opacity-50`) + ✓ badge overlay on cover |

---

## Architecture

### 1. New API route — `GET /api/abs/items`

Server-side route at `app/api/abs/items/route.ts`.

- Reads `x-abs-url` and `x-abs-token` from request headers
- Calls existing `fetchAbsLibraries()` to get all library IDs
- For each library, calls `GET /api/libraries/:id/items?limit=1000`
- Returns `{ items: Array<{ title: string }> }` — flat list across all libraries
- Errors from individual library fetches are swallowed; the route succeeds with whatever it got

New helper in `lib/abs/client.ts`: `fetchAbsLibraryItems(absUrl, token, libraryId, limit)` returning `AbsLibraryItem[]`.

### 2. Matching module — `lib/abs/matching.ts`

Two exported functions:

```ts
export function normalizeTitle(s: string): string
```
- Lowercase
- Unicode NFD decomposition
- Strip combining diacritics (U+0300–U+036F)
- Strip non-alphanumeric, non-space characters
- Collapse whitespace, trim

```ts
export function buildAbsTitleSet(items: { title: string }[]): Set<string>
```
- Returns a `Set` of normalized titles, one per ABS item

```ts
export function isExistingInAbs(candidateTitle: string, absSet: Set<string>): boolean
```
- Normalizes `candidateTitle`
- Returns true if any ABS normalized title contains `normalizedCandidate` **or** `normalizedCandidate` contains any ABS title
- Substring-in-either-direction handles "Под игото" ↔ "Под игото (роман)" and similar variants

### 3. Browse page — `app/browse/page.tsx`

- Imports `useSettings()`
- Adds `absItems: Set<string> | null` state (null = not yet fetched)
- After settings load and `absUrl`/`absToken` are non-empty: fire `fetch('/api/abs/items', { headers: absHeaders() })` in background (non-blocking, independent of the chitanka/gramofonche result fetch)
- On success: build the set via `buildAbsTitleSet()` and store in state
- On error: leave state as `null` (no indicators shown — silent failure)
- Passes `absItems` to `ResultsGrid`

### 4. ResultsGrid — `components/results-grid.tsx`

- Accepts optional `absItems?: Set<string> | null`
- For each `BookSummary`, computes `isExisting = absItems != null && isExistingInAbs(book.title, absItems)`
- Passes `isExisting` to `BookCard`

### 5. BookCard — `components/book-card.tsx`

- Accepts optional `isExisting?: boolean`
- When true:
  - Wraps card content in `opacity-50`
  - Renders an absolutely-positioned ✓ badge (green, top-right of the cover area)
- Cover area becomes `relative` to anchor the badge

---

## Data flow

```
browse/page.tsx
  useSettings()  ──────────────────────────────────────────────────► /api/abs/items
  (on settings load, non-blocking)                                       │
                                                                         │ { items: [{title}] }
                                                                         ▼
                                                              buildAbsTitleSet()
                                                              → Set<string> stored in state
                                                                         │
  loadResults()                                                          │
  → /api/scrape/search or browse                                         │
  → BookSummary[]                                                        │
       │                                                                 │
       ▼                                                                 ▼
  ResultsGrid(items, absItems)
       │
       ├─ isExistingInAbs(book.title, absItems) per card
       │
       ▼
  BookCard(book, isExisting)
       └─ opacity-50 + ✓ badge when isExisting
```

---

## Edge cases

| Case | Behaviour |
|------|-----------|
| ABS not configured | `absItems` stays null; no indicators shown |
| ABS unreachable | Fetch error swallowed; no indicators shown |
| Empty ABS library | Empty set; nothing matches |
| ABS items fetch returns before results | Set is ready; cards render correctly immediately |
| ABS items fetch returns after results | Cards re-render with indicators once set arrives |
| False positive (unrelated title shares substring) | Acceptable — user can still upload by clicking through |
| 1000-item limit exceeded | Items beyond 1000 won't be detected; silent, acceptable for now |

---

## Files changed

| File | Change |
|------|--------|
| `app/api/abs/items/route.ts` | New route |
| `lib/abs/client.ts` | Add `fetchAbsLibraryItems()` |
| `lib/abs/matching.ts` | New module (`normalizeTitle`, `buildAbsTitleSet`, `isExistingInAbs`) |
| `app/browse/page.tsx` | Background fetch + pass `absItems` to grid |
| `components/results-grid.tsx` | Thread `absItems` prop, compute `isExisting` per card |
| `components/book-card.tsx` | Render `opacity-50` + ✓ badge when `isExisting` |

No new dependencies required.
