'use client'

import { BookCard } from './book-card'
import type { BookSummary } from '@/lib/scraper/types'
import { isExistingInAbs } from '@/lib/abs/matching'

interface Props {
  items: BookSummary[]
  onSelect: (book: BookSummary) => void
  absItems?: Set<string> | null
}

export function ResultsGrid({ items, onSelect, absItems }: Props) {
  if (items.length === 0) {
    return <p className="text-muted-foreground text-sm py-8 text-center">No results</p>
  }
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
      {items.map((book) => {
        const isExisting = !!absItems && isExistingInAbs(book.title, book.authors, absItems)
        return <BookCard key={book.url} book={book} onClick={onSelect} isExisting={isExisting} />
      })}
    </div>
  )
}
