'use client'

import { useState } from 'react'
import { SourceToggle } from '@/components/source-toggle'
import { SearchBar } from '@/components/search-bar'
import { CategoryNav } from '@/components/category-nav'
import { ResultsGrid } from '@/components/results-grid'
import type { BookSummary, ListingResult, Site } from '@/lib/scraper/types'
import { DetailPanel } from '@/components/detail-panel'

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
    </div>
  )
}
