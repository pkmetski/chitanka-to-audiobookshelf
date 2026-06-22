'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { SourceToggle } from '@/components/source-toggle'
import { SearchBar } from '@/components/search-bar'
import { CategoryNav } from '@/components/category-nav'
import { ResultsGrid } from '@/components/results-grid'
import type { BookSummary, Site } from '@/lib/scraper/types'
import { DetailPanel } from '@/components/detail-panel'
import { useSettings } from '@/hooks/use-settings'
import { buildAbsTitleMap, isExistingInAbs, parseDurationMins, type AbsTitleMap } from '@/lib/abs/matching'

export default function BrowsePage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { settings, absHeaders, loaded } = useSettings()
  const [site, setSite] = useState<Site>('chitanka')
  const [results, setResults] = useState<BookSummary[]>([])
  const [nextPagePath, setNextPagePath] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedBook, setSelectedBook] = useState<BookSummary | null>(null)
  const [absItems, setAbsItems] = useState<AbsTitleMap | null>(null)
  const [hideOwned, setHideOwned] = useState(false)

  // Derive selected category from URL params
  const selectedCategory = searchParams.get('category') || '/new'

  async function loadResults(url: string, append = false) {
    if (append) setLoadingMore(true)
    else { setLoading(true); setSelectedBook(null) }
    setError(null)
    try {
      const res = await fetch(url)
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Заявката е неуспешна')
        if (!append) setResults([])
        return
      }
      setResults(prev => append ? [...prev, ...(data.items ?? [])] : (data.items ?? []))
      setNextPagePath(data.nextPagePath ?? null)
    } catch (err) {
      setError(String(err))
      if (!append) setResults([])
    } finally {
      if (append) setLoadingMore(false)
      else setLoading(false)
    }
  }

  function handleSearch(query: string) {
    const params = new URLSearchParams()
    params.set('q', query)
    router.push(`/browse?${params.toString()}`)
    loadResults(`/api/scrape/search?site=${site}&q=${encodeURIComponent(query)}`)
  }

  function handleNavigate(path: string) {
    const params = new URLSearchParams()
    params.set('category', path)
    router.push(`/browse?${params.toString()}`)
    loadResults(`/api/scrape/browse?site=${site}&path=${encodeURIComponent(path)}`)
  }

  function handleLoadMore() {
    if (!nextPagePath) return
    loadResults(`/api/scrape/browse?site=${site}&path=${encodeURIComponent(nextPagePath)}`, true)
  }

  // Load results based on URL params
  useEffect(() => {
    const category = searchParams.get('category')
    const query = searchParams.get('q')

    if (query) {
      loadResults(`/api/scrape/search?site=${site}&q=${encodeURIComponent(query)}`)
    } else {
      const categoryPath = category || '/new'
      loadResults(`/api/scrape/browse?site=${site}&path=${encodeURIComponent(categoryPath)}`)
    }
  }, [searchParams, site])

  useEffect(() => {
    if (!loaded) return
    if (!settings.absUrl || !settings.absToken) return
    const debugMode = new URLSearchParams(window.location.search).has('debug')
    const headers = absHeaders()
    if (debugMode) headers['x-debug'] = 'true'
    fetch('/api/abs/items', { headers })
      .then(res => res.ok ? res.json() : res.json().then(e => Promise.reject(e?.error ?? `HTTP ${res.status}`)))
      .then(data => {
        if (debugMode) {
          console.log('[DEBUG] ABS Items received:', data.items)
          console.log('[DEBUG] Building title map from', data.items.length, 'items')
        }
        setAbsItems(buildAbsTitleMap(data.items))
      })
      .catch(() => { /* ABS unavailable — detection stays off */ })
  }, [loaded, settings.absUrl, settings.absToken])

  function handleSiteChange(next: Site) {
    setSite(next)
    setResults([])
    setNextPagePath(null)
    setSelectedBook(null)
    router.push('/browse')
  }

  return (
    <div className="flex h-[calc(100vh-3.5rem)]">
      {/* Left sidebar */}
      <aside className="w-52 border-r p-4 shrink-0 overflow-y-auto">
        <CategoryNav site={site} onNavigate={handleNavigate} selectedCategory={selectedCategory} />
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="p-4 border-b flex flex-col gap-3 sm:flex-row sm:items-center">
          <SourceToggle active={site} onChange={handleSiteChange} />
          <SearchBar onSearch={handleSearch} />
          {absItems && (
            <button
              onClick={() => setHideOwned(h => !h)}
              className={`shrink-0 text-xs px-2 py-1 rounded border transition-colors ${hideOwned ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-muted'}`}
            >
              {hideOwned ? 'Покажи притежаваните' : 'Скрий притежаваните'}
            </button>
          )}
        </div>
        {error && (
          <p className="text-sm text-destructive px-4">{error}</p>
        )}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <p className="text-sm text-muted-foreground">Зарежда…</p>
          ) : (
            <>
              <ResultsGrid
                items={hideOwned && absItems ? results.filter(b => !isExistingInAbs(b.title, b.authors, absItems, parseDurationMins(b.duration))) : results}
                onSelect={setSelectedBook}
                absItems={absItems}
              />
              {nextPagePath && (
                <div className="mt-4 flex justify-center">
                  <button
                    onClick={handleLoadMore}
                    disabled={loadingMore}
                    className="px-4 py-2 text-sm rounded border hover:bg-muted transition-colors disabled:opacity-50"
                  >
                    {loadingMore ? 'Зарежда…' : 'Зареди още'}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {selectedBook && (
        <aside className="w-80 border-l overflow-y-auto shrink-0">
          <DetailPanel book={selectedBook} />
        </aside>
      )}
    </div>
  )
}
