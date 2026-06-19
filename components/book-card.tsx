'use client'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import type { BookSummary } from '@/lib/scraper/types'

interface Props {
  book: BookSummary
  onClick: (book: BookSummary) => void
  isExisting?: boolean
}

export function BookCard({ book, onClick, isExisting }: Props) {
  return (
    <Card
      className={`cursor-pointer hover:shadow-md transition-shadow${isExisting ? ' opacity-50' : ''}`}
      onClick={() => onClick(book)}
    >
      <CardContent className="p-3">
        <div className="relative">
          {book.coverUrl ? (
            <img
              src={book.coverUrl}
              alt={book.title}
              className={`w-full object-cover rounded mb-2 ${book.site === 'gramofonche' ? 'aspect-square' : 'aspect-[2/3]'}`}
            />
          ) : (
            <div className={`w-full bg-muted rounded mb-2 flex items-center justify-center text-muted-foreground text-sm ${book.site === 'gramofonche' ? 'aspect-square' : 'aspect-[2/3]'}`}>
              No cover
            </div>
          )}
          {isExisting && (
            <Badge className="absolute top-1 right-1 bg-green-600 text-white text-xs px-1 py-0.5">✓</Badge>
          )}
        </div>
        <p className="font-medium text-sm line-clamp-2">{book.title}</p>
        <p className="text-muted-foreground text-xs line-clamp-1 mt-0.5">
          {book.authors.join(', ')}
        </p>
        <div className="flex items-center gap-1 mt-1 flex-wrap">
          <Badge variant="secondary" className="text-xs">
            {book.format.toUpperCase()}
          </Badge>
          {book.duration && (
            <span className="text-muted-foreground text-xs">{book.duration}</span>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
