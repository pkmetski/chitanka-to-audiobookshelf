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
