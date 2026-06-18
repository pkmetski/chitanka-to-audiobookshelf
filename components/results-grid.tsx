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
