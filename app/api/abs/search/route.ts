import { NextResponse } from 'next/server'
import { fetchAbsLibraries, fetchAbsLibraryItems } from '@/lib/abs/client'

export async function GET(req: Request) {
  const absUrl = req.headers.get('x-abs-url')
  const absToken = req.headers.get('x-abs-token')
  const query = new URL(req.url).searchParams.get('q')?.toLowerCase() || ''

  if (!absUrl || !absToken) {
    return NextResponse.json({ error: 'x-abs-url and x-abs-token headers required' }, { status: 400 })
  }

  try {
    const libraries = await fetchAbsLibraries(absUrl, absToken)
    const results = await Promise.allSettled(
      libraries.map(lib => fetchAbsLibraryItems(absUrl, absToken, lib.id))
    )
    const allItems = results.flatMap(r => (r.status === 'fulfilled' ? r.value : []))

    // Filter items by query (search title, authors, narrators)
    const filtered = allItems.filter(item => {
      const title = item.media.metadata.title?.toLowerCase() || ''
      const authors = (item.media.metadata.authors || [])
        .map((a: any) => (typeof a === 'string' ? a : a.name).toLowerCase())
        .join(' ')
      const narrators = (item.media.metadata.narrators || [])
        .map((n: any) => (typeof n === 'string' ? n : n.name).toLowerCase())
        .join(' ')

      return title.includes(query) || authors.includes(query) || narrators.includes(query)
    })

    return NextResponse.json({
      query,
      total: allItems.length,
      found: filtered.length,
      items: filtered.map(item => ({
        title: item.media.metadata.title,
        authors: item.media.metadata.authors || [],
        narrators: item.media.metadata.narrators || [],
        duration: item.media.duration ? `${Math.round(item.media.duration / 60)} min` : undefined,
      }))
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
