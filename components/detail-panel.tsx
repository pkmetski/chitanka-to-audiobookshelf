'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useSettings } from '@/hooks/use-settings'
import type { BookDetail, BookSummary } from '@/lib/scraper/types'
import type { AbsLibrary } from '@/lib/abs/types'

interface Props {
  book: BookSummary
  onUpload: (detail: BookDetail, libraryId: string) => void
}

export function DetailPanel({ book, onUpload }: Props) {
  const { absHeaders } = useSettings()
  const [detail, setDetail] = useState<BookDetail | null>(null)
  const [libraries, setLibraries] = useState<AbsLibrary[]>([])
  const [libraryId, setLibraryId] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Editable fields — initialized from detail once loaded
  const [title, setTitle] = useState('')
  const [authors, setAuthors] = useState('')
  const [narrators, setNarrators] = useState('')
  const [description, setDescription] = useState('')
  const [genres, setGenres] = useState('')
  const [year, setYear] = useState('')
  const [language, setLanguage] = useState('')

  useEffect(() => {
    setLoading(true)
    setError(null)

    Promise.all([
      fetch(`/api/scrape/detail?url=${encodeURIComponent(book.url)}`).then((r) => r.json()),
      fetch('/api/abs/libraries', { headers: absHeaders() }).then((r) => r.json()),
    ])
      .then(([detailData, libData]: [BookDetail, { libraries: AbsLibrary[] }]) => {
        setDetail(detailData)
        setTitle(detailData.title)
        setAuthors(detailData.authors.join(', '))
        setNarrators(
          'narrators' in detailData ? detailData.narrators.join(', ') : ''
        )
        setDescription(detailData.description)
        setGenres(detailData.genres.join(', '))
        setYear(detailData.year)
        setLanguage('language' in detailData ? detailData.language : '')
        setLibraries(libData.libraries ?? [])
        if (libData.libraries?.length) setLibraryId(libData.libraries[0].id)
      })
      .catch((err) => setError(String(err)))
      .finally(() => setLoading(false))
  }, [book.url])

  if (loading) return <p className="text-sm text-muted-foreground p-4">Loading…</p>
  if (error) return <p className="text-sm text-destructive p-4">{error}</p>
  if (!detail) return null

  function handleUpload() {
    if (!detail || !libraryId) return
    const edited: BookDetail = {
      ...detail,
      title,
      authors: authors.split(',').map((s) => s.trim()).filter(Boolean),
      description,
      genres: genres.split(',').map((s) => s.trim()).filter(Boolean),
      year,
      ...('narrators' in detail && { narrators: narrators.split(',').map((s) => s.trim()).filter(Boolean) }),
      ...('language' in detail && { language }),
    }
    onUpload(edited, libraryId)
  }

  return (
    <div className="space-y-3 p-4">
      {detail.coverUrl && (
        <img src={detail.coverUrl} alt={detail.title} className="w-full rounded" />
      )}

      <Field label="Title" value={title} onChange={setTitle} />
      <Field label="Author(s)" value={authors} onChange={setAuthors} hint="comma-separated" />
      {detail.site === 'gramofonche' && (
        <Field label="Narrator(s)" value={narrators} onChange={setNarrators} hint="comma-separated" />
      )}
      <Field label="Description" value={description} onChange={setDescription} textarea />
      <Field label="Genres" value={genres} onChange={setGenres} hint="comma-separated" />
      <Field label="Year" value={year} onChange={setYear} />
      {detail.site === 'chitanka' && (
        <Field label="Language" value={language} onChange={setLanguage} />
      )}

      <div>
        <Label>Library</Label>
        <Select value={libraryId} onValueChange={(v) => setLibraryId(v ?? '')}>
          <SelectTrigger>
            <SelectValue placeholder="Choose library…" />
          </SelectTrigger>
          <SelectContent>
            {libraries.map((lib) => (
              <SelectItem key={lib.id} value={lib.id}>
                {lib.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Button className="w-full" disabled={!libraryId} onClick={handleUpload}>
        Upload to Audiobookshelf
      </Button>
    </div>
  )
}

function Field({
  label,
  value,
  onChange,
  hint,
  textarea,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  hint?: string
  textarea?: boolean
}) {
  return (
    <div>
      <Label>{label}{hint && <span className="text-muted-foreground text-xs ml-1">({hint})</span>}</Label>
      {textarea ? (
        <textarea
          className="w-full border rounded px-3 py-2 text-sm min-h-[80px] resize-y bg-background"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <Input value={value} onChange={(e) => onChange(e.target.value)} />
      )}
    </div>
  )
}
