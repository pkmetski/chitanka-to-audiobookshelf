'use client'

import { useState } from 'react'
import { useSettings } from '@/hooks/use-settings'

interface AbsAuthor {
  name?: string
  id?: string
}

interface AbsNarrator {
  name?: string
  id?: string
}

interface AbsItem {
  title: string
  authors: (string | AbsAuthor)[]
  narrators: (string | AbsNarrator)[]
  duration?: string
}

export default function SearchAbsPage() {
  const { settings, absHeaders, loaded } = useSettings()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<AbsItem[]>([])
  const [loading, setLoading] = useState(false)
  const [total, setTotal] = useState(0)
  const [error, setError] = useState<string | null>(null)

  async function search() {
    if (!query.trim()) {
      setError('Enter a search term')
      return
    }

    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/abs/search?q=${encodeURIComponent(query)}`, {
        headers: absHeaders()
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setResults(data.items || [])
      setTotal(data.total || 0)
    } catch (err) {
      setError(String(err))
      setResults([])
    } finally {
      setLoading(false)
    }
  }

  if (!loaded) return <div className="p-4">Зарежда...</div>

  if (!settings.absUrl || !settings.absToken) {
    return <div className="p-4 text-red-600">Моля конфигурирайте ABS в Settings</div>
  }

  return (
    <div className="p-6 max-w-4xl">
      <h1 className="text-2xl font-bold mb-4">Търсене в ABS библиотека</h1>

      <div className="flex gap-2 mb-4">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && search()}
          placeholder="Въведете название или автор..."
          className="flex-1 px-3 py-2 border rounded"
        />
        <button
          onClick={search}
          disabled={loading}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? 'Търси...' : 'Търсене'}
        </button>
      </div>

      {error && <div className="p-4 bg-red-100 text-red-700 rounded mb-4">{error}</div>}

      {results.length > 0 && (
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Намерени {results.length} от {total} елемента
          </p>

          {results.map((item, i) => (
            <div key={i} className="border rounded p-4 bg-gray-50">
              <h3 className="font-bold text-lg">{item.title}</h3>

              <div className="mt-2 text-sm space-y-1">
                {item.authors && item.authors.length > 0 && (
                  <p>
                    <strong>Authors:</strong>{' '}
                    {item.authors
                      .map((a: string | AbsAuthor) => (typeof a === 'string' ? a : a.name || a.id))
                      .join(', ')}
                  </p>
                )}

                {item.narrators && item.narrators.length > 0 && (
                  <p>
                    <strong>Narrators:</strong>{' '}
                    {item.narrators
                      .map((n: string | AbsNarrator) => (typeof n === 'string' ? n : n.name || n.id))
                      .join(', ')}
                  </p>
                )}

                {item.duration && <p><strong>Duration:</strong> {item.duration}</p>}
              </div>

              <pre className="mt-3 p-2 bg-gray-800 text-gray-100 rounded text-xs overflow-x-auto">
                {JSON.stringify(
                  {
                    authors: item.authors,
                    narrators: item.narrators,
                  },
                  null,
                  2
                )}
              </pre>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
