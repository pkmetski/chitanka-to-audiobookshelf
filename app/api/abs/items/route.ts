import { NextResponse } from 'next/server'
import { fetchAbsLibraries, fetchAbsLibraryItems } from '@/lib/abs/client'

export async function GET(req: Request) {
  const absUrl = req.headers.get('x-abs-url')
  const absToken = req.headers.get('x-abs-token')

  if (!absUrl || !absToken) {
    return NextResponse.json({ error: 'x-abs-url and x-abs-token headers required' }, { status: 400 })
  }

  try {
    const libraries = await fetchAbsLibraries(absUrl, absToken)
    const results = await Promise.allSettled(
      libraries.map(lib => fetchAbsLibraryItems(absUrl, absToken, lib.id))
    )
    const items = results.flatMap(r => (r.status === 'fulfilled' ? r.value : []))
    return NextResponse.json({
      items: items.map(item => ({
        title: item.media.metadata.title,
        author: item.media.metadata.authorName ?? '',
        durationSecs: item.media.duration ?? undefined,
      })),
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
