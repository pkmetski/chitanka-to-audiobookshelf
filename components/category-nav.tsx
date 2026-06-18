'use client'

import type { Site } from '@/lib/scraper/types'

interface NavItem {
  label: string
  path: string
}

const CHITANKA_NAV: NavItem[] = [
  { label: 'New additions', path: '/new' },
  { label: 'By author', path: '/autor' },
  { label: 'By genre', path: '/category' },
]

const GRAMOFONCHE_NAV: NavItem[] = [
  { label: 'New additions', path: '/new' },
  { label: 'By author', path: '/autor' },
  { label: 'By genre', path: '/category' },
]

interface Props {
  site: Site
  onNavigate: (path: string) => void
}

export function CategoryNav({ site, onNavigate }: Props) {
  const items = site === 'chitanka' ? CHITANKA_NAV : GRAMOFONCHE_NAV
  return (
    <nav className="space-y-1">
      <p className="text-xs font-semibold uppercase text-muted-foreground mb-2">Browse</p>
      {items.map((item) => (
        <button
          key={item.path}
          className="w-full text-left text-sm px-2 py-1.5 rounded hover:bg-muted transition-colors"
          onClick={() => onNavigate(item.path)}
        >
          {item.label}
        </button>
      ))}
    </nav>
  )
}
