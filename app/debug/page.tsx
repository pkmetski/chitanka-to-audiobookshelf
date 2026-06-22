'use client'

import { useEffect, useState } from 'react'
import { useSettings } from '@/hooks/use-settings'
import { buildAbsTitleMap, isExistingInAbs, parseDurationMins, normalizeTitle } from '@/lib/abs/matching'

interface AbsItem {
  title: string
  author: string
  durationSecs?: number
}

export default function DebugPage() {
  const { settings, absHeaders, loaded } = useSettings()
  const [absItems, setAbsItems] = useState<AbsItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Test items
  const testItems = [
    {
      title: 'Старата костенурка разказва',
      authors: ['Индийнейски Приказки', 'реж. Иван Андонов'],
      duration: '46мин'
    },
    {
      title: 'Маруф обушарт',
      authors: ['Шехерезада', 'реж. Мария Нанчева'],
      duration: '52мин'
    }
  ]

  async function fetchAbsItems() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/abs/items?debug=true', { headers: absHeaders() })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setAbsItems(data.items || [])
    } catch (err) {
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (loaded && settings.absUrl && settings.absToken) {
      fetchAbsItems()
    }
  }, [loaded])

  if (!loaded) return <div className="p-4">Зарежда...</div>

  if (!settings.absUrl || !settings.absToken) {
    return <div className="p-4 text-red-600">Моля конфигурирайте ABS в Settings</div>
  }

  const absMap = buildAbsTitleMap(absItems)

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">Debug: Item Matching</h1>

      <button
        onClick={fetchAbsItems}
        disabled={loading}
        className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
      >
        {loading ? 'Зарежда...' : 'Обнови ABS елементи'}
      </button>

      {error && <div className="p-4 bg-red-100 text-red-700 rounded">{error}</div>}

      <section className="border-t pt-6">
        <h2 className="text-xl font-bold mb-4">ABS Library Items ({absItems.length})</h2>
        <div className="space-y-2 max-h-96 overflow-y-auto border rounded p-4">
          {absItems.length === 0 ? (
            <p className="text-gray-500">No items found</p>
          ) : (
            absItems.map((item, i) => (
              <div key={i} className="border-b pb-2">
                <p className="font-semibold">{item.title}</p>
                <p className="text-sm text-gray-600">Author: {item.author || '(none)'}</p>
                <p className="text-sm text-gray-600">Duration: {item.durationSecs ? (item.durationSecs / 60).toFixed(0) + ' mins' : '(none)'}</p>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="border-t pt-6">
        <h2 className="text-xl font-bold mb-4">Test Items - Matching Results</h2>
        <div className="space-y-4">
          {testItems.map((book, i) => {
            const durationMins = parseDurationMins(book.duration)
            const isExisting = isExistingInAbs(book.title, book.authors, absMap, durationMins)

            return (
              <div key={i} className={`border rounded p-4 ${isExisting ? 'bg-green-50 border-green-300' : 'bg-red-50 border-red-300'}`}>
                <p className="font-semibold text-lg">{book.title}</p>
                <p className="text-sm mb-2">Authors: {book.authors.join(', ')}</p>
                <p className="text-sm mb-3">Duration: {book.duration} ({durationMins} mins)</p>

                <div className="text-sm space-y-1 mb-3 p-3 bg-gray-100 rounded">
                  <p><strong>Normalized:</strong></p>
                  <p>Title: {normalizeTitle(book.title)}</p>
                  <p>Authors: {book.authors.map(normalizeTitle).join(', ')}</p>
                </div>

                <p className={`font-bold text-lg ${isExisting ? 'text-green-700' : 'text-red-700'}`}>
                  {isExisting ? '✓ MATCH FOUND' : '✗ NO MATCH'}
                </p>
              </div>
            )
          })}
        </div>
      </section>

      <section className="border-t pt-6">
        <h2 className="text-xl font-bold mb-4">Title Map (for debugging)</h2>
        <details>
          <summary className="cursor-pointer font-semibold">Show map details</summary>
          <pre className="mt-2 p-4 bg-gray-100 rounded overflow-x-auto text-sm">
            {Array.from(absMap.entries())
              .map(([key, durs]) => `${key}: [${durs.join(', ')}]`)
              .join('\n')}
          </pre>
        </details>
      </section>
    </div>
  )
}
