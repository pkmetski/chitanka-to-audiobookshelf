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
      <p className="text-xs font-semibold uppercase text-muted-foreground mb-2">Разглеждай</p>

      {site === 'chitanka' && (
        <button
          className="w-full text-left text-sm px-2 py-1.5 rounded hover:bg-muted transition-colors"
          onClick={() => onNavigate('/new')}
        >
          Нови добавки
        </button>
      )}

      {site === 'chitanka' && (
        <button
          className="w-full text-left text-sm px-2 py-1.5 rounded hover:bg-muted transition-colors"
          onClick={() => onNavigate('/authors')}
        >
          По автор (А–Я)
        </button>
      )}

      {site === 'chitanka' && (
        <>
          <p className="text-xs font-semibold uppercase text-muted-foreground mt-4 mb-1 px-2">Жанрове</p>
          {loadingGenres && (
            <p className="text-xs text-muted-foreground px-2 py-1">Зарежда…</p>
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
        <>
          {[
            { path: '/prikazki/', label: 'Приказки' },
            { path: '/pesnicki/', label: 'Песнички' },
            { path: '/zagolemi/', label: 'За по-големи' },
          ].map(({ path, label }) => (
            <button
              key={path}
              className="w-full text-left text-sm px-2 py-1.5 rounded hover:bg-muted transition-colors"
              onClick={() => onNavigate(path)}
            >
              {label}
            </button>
          ))}
        </>
      )}
    </nav>
  )
}
