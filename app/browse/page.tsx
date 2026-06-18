'use client'

import { useState, useEffect } from 'react'
import { SourceToggle } from '@/components/source-toggle'
import { SearchBar } from '@/components/search-bar'
import { CategoryNav } from '@/components/category-nav'
import { ResultsGrid } from '@/components/results-grid'
import type { BookSummary, Site } from '@/lib/scraper/types'
import { DetailPanel } from '@/components/detail-panel'

export default function BrowsePage() {
  const [site, setSite] = useState<Site>('chitanka')
  const [results, setResults] = useState<BookSummary[]>([])
  const [nextPagePath, setNextPagePath] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedBook, setSelectedBook] = useState<BookSummary | null>(null)

  async function loadResults(url: string, append = false) {
    if (append) setLoadingMore(true)
    else { setLoading(true); setSelectedBook(null) }
    setError(null)
    try {
      const res = await fetch(url)
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Request failed')
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
    loadResults(`/api/scrape/search?site=${site}&q=${encodeURIComponent(query)}`)
  }

  function handleNavigate(path: string) {
    loadResults(`/api/scrape/browse?site=${site}&path=${encodeURIComponent(path)}`)
  }

  function handleLoadMore() {
    if (!nextPagePath) return
    loadResults(`/api/scrape/browse?site=${site}&path=${encodeURIComponent(nextPagePath)}`, true)
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadResults(`/api/scrape/browse?site=chitanka&path=/new`)
  }, [])

  function handleSiteChange(next: Site) {
    setSite(next)
    setResults([])
    setNextPagePath(null)
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
        {error && (
          <p className="text-sm text-destructive px-4">{error}</p>
        )}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (
            <>
              <ResultsGrid items={results} onSelect={setSelectedBook} />
              {nextPagePath && (
                <div className="mt-4 flex justify-center">
                  <button
                    onClick={handleLoadMore}
                    disabled={loadingMore}
                    className="px-4 py-2 text-sm rounded border hover:bg-muted transition-colors disabled:opacity-50"
                  >
                    {loadingMore ? 'Loading…' : 'Load more'}
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
