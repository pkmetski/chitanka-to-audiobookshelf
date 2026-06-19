# ADR 002: ABS Duplicate Detection in Browse Results

**Date:** 2026-06-19  
**Status:** Accepted  

---

## Context

The browse/search results grid shows items from Chitanka (EPUBs) and Gramofonche (MP3s) with no indication of which titles already exist in Audiobookshelf. Users must recall or manually cross-reference before uploading, risking accidental duplicates. Titles are not always named identically between the two systems (e.g. "Под игото" vs "Под игото (роман)"), so exact string matching is insufficient.

---

## Decisions

### 1. Check all ABS libraries, not a per-source mapping

Checking every library avoids hard-coding which library belongs to which source (chitanka → "books", gramofonche → "fairy tales"). A book could be in any library; checking all is both simpler and more correct.

### 2. Fetch all items in a single background call, match client-side

A new `GET /api/abs/items` route fans out to all libraries server-side and returns a flat list of titles. The browse page fires this call once after settings load (non-blocking — results grid is usable immediately). Client-side matching against the in-memory set is O(n) and requires no further network calls per card.

An alternative was per-card server-side lookup, but that would produce N API calls per results page and add latency to every card render.

### 3. Normalized substring containment as the matching heuristic

Titles are normalized (lowercase → NFD decomposition → strip diacritics → strip punctuation → collapse whitespace) and then tested for substring containment in either direction. This correctly matches:

- "Под игото" ↔ "Под игото (роман)" (ABS has parenthetical suffix)
- Slight punctuation or casing differences

Levenshtein distance was considered but adds a dependency and tunable threshold; substring matching is parameter-free and correct for the dominant real-world case (one title is a prefix/suffix-extended form of the other).

False positives (unrelated titles sharing a short substring) are acceptable — the user can still upload the item by clicking through.

### 4. Dimmed card + ✓ badge as the visual treatment

Reducing the card to `opacity-50` makes the results grid scannable at a glance ("dim = already have it"). A small ✓ badge on the cover corner makes the reason explicit without obscuring the title. Full-opacity-but-badged was considered but leaves already-owned items visually indistinguishable in dense grids.

### 5. Silent failure when ABS is unreachable or unconfigured

If settings are missing or the fetch fails, `absItems` remains `null` and no indicators are shown. The browse UI is fully functional without ABS connectivity; duplicate detection is a best-effort overlay, not a gating feature.

---

## Consequences

- **1000-item limit per library** — items beyond 1000 per library will not be detected. Acceptable for personal libraries; can be made paginated if needed.
- **False positives possible** — short titles that appear as substrings of unrelated ABS titles will be incorrectly flagged. Accepted trade-off for a parameter-free heuristic.
- **No author-based disambiguation** — two books with the same title by different authors will both be flagged. Acceptable for the current use case.
- **ABS items fetched on every page load** — no caching between navigations. Fine for a local single-user app; a short-lived cache could be added if latency becomes noticeable.
