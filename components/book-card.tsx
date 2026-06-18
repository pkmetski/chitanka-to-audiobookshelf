'use client'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import type { BookSummary } from '@/lib/scraper/types'

interface Props {
  book: BookSummary
  onClick: (book: BookSummary) => void
}

export function BookCard({ book, onClick }: Props) {
  return (
    <Card
      className="cursor-pointer hover:shadow-md transition-shadow"
      onClick={() => onClick(book)}
    >
      <CardContent className="p-3">
        {book.coverUrl ? (
          <img
            src={book.coverUrl}
            alt={book.title}
            className="w-full aspect-[2/3] object-cover rounded mb-2"
          />
        ) : (
          <div className="w-full aspect-[2/3] bg-muted rounded mb-2 flex items-center justify-center text-muted-foreground text-sm">
            No cover
          </div>
        )}
        <p className="font-medium text-sm line-clamp-2">{book.title}</p>
        <p className="text-muted-foreground text-xs line-clamp-1 mt-0.5">
          {book.authors.join(', ')}
        </p>
        <Badge variant="secondary" className="mt-1 text-xs">
          {book.format.toUpperCase()}
        </Badge>
      </CardContent>
    </Card>
  )
}
