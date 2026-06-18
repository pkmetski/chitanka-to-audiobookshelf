'use client'

import { Button } from '@/components/ui/button'
import type { Site } from '@/lib/scraper/types'

interface Props {
  active: Site
  onChange: (site: Site) => void
}

export function SourceToggle({ active, onChange }: Props) {
  return (
    <div className="flex gap-2">
      <Button
        variant={active === 'chitanka' ? 'default' : 'outline'}
        size="sm"
        onClick={() => onChange('chitanka')}
      >
        Chitanka (ebooks)
      </Button>
      <Button
        variant={active === 'gramofonche' ? 'default' : 'outline'}
        size="sm"
        onClick={() => onChange('gramofonche')}
      >
        Gramofonche (audiobooks)
      </Button>
    </div>
  )
}
