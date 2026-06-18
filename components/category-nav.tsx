'use client'

import { useEffect, useState } from 'react'
import type { Site, CategoryEntry } from '@/lib/scraper/types'

interface Props {
  site: Site
  onNavigate: (path: string) => void
}

export function CategoryNav({ site, onNavigate }: Props) {
  const [genres, setGenres] = useState<CategoryEntry[]>([])
  const [loadingGenres, setLoadingGenres] = useState(false)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (site !== 'chitanka') { setGenres([]); return }
    setLoadingGenres(true)
    fetch(`/api/scrape/categories?site=chitanka`)
      .then(r => r.json())
      .then(d => setGenres(d.categories ?? []))
      .catch(() => setGenres([]))
      .finally(() => setLoadingGenres(false))
  }, [site])

  return (
    <nav className="space-y-1">
      <p className="text-xs font-semibold uppercase text-muted-foreground mb-2">Browse</p>

      {site === 'chitanka' && (
        <button
          className="w-full text-left text-sm px-2 py-1.5 rounded hover:bg-muted transition-colors"
          onClick={() => onNavigate('/new')}
        >
          New additions
        </button>
      )}

      {site === 'chitanka' && (
        <button
          className="w-full text-left text-sm px-2 py-1.5 rounded hover:bg-muted transition-colors"
          onClick={() => onNavigate('/authors')}
        >
          By author (A–Z)
        </button>
      )}

      {site === 'chitanka' && (
        <>
          <p className="text-xs font-semibold uppercase text-muted-foreground mt-4 mb-1 px-2">Genres</p>
          {loadingGenres && (
            <p className="text-xs text-muted-foreground px-2 py-1">Loading…</p>
          )}
          {genres.map((g) => (
            <button
              key={g.path}
              className="w-full text-left text-sm px-2 py-1 rounded hover:bg-muted transition-colors leading-snug"
              onClick={() => onNavigate(g.path)}
            >
              {g.label}
            </button>
          ))}
        </>
      )}

      {site === 'gramofonche' && (
        <button
          className="w-full text-left text-sm px-2 py-1.5 rounded hover:bg-muted transition-colors"
          onClick={() => onNavigate('/prikazki/')}
        >
          Stories
        </button>
      )}
    </nav>
  )
}
