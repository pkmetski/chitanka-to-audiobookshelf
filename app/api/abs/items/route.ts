import { NextResponse } from 'next/server'
import { fetchAbsLibraries, fetchAbsLibraryItems } from '@/lib/abs/client'

export async function GET(req: Request) {
  const absUrl = req.headers.get('x-abs-url')
  const absToken = req.headers.get('x-abs-token')
  const debug = req.headers.get('x-debug') === 'true'

  if (!absUrl || !absToken) {
    return NextResponse.json({ error: 'x-abs-url and x-abs-token headers required' }, { status: 400 })
  }

  try {
    const libraries = await fetchAbsLibraries(absUrl, absToken)
    const results = await Promise.allSettled(
      libraries.map(lib => fetchAbsLibraryItems(absUrl, absToken, lib.id))
    )
    const items = results.flatMap(r => (r.status === 'fulfilled' ? r.value : []))
    const mapped = items.map(item => {
      // Combine authors and narrators for matching
      // ABS GET returns authors as array of {id, name}, not authorName string
      const authorParts = []
      if (item.media.metadata.authors?.length) {
        authorParts.push(...item.media.metadata.authors.map((a: { name: string } | string) =>
          typeof a === 'string' ? a : a.name
        ))
      }
      if (item.media.metadata.narrators?.length) {
        authorParts.push(...item.media.metadata.narrators.map((n: string | { name: string }) =>
          typeof n === 'string' ? n : n.name
        ))
      }
      return {
        title: item.media.metadata.title,
        author: authorParts.join(', '),
        durationSecs: item.media.duration ?? undefined,
      }
    })

    if (debug) {
      console.log('[ABS DEBUG] Total items:', items.length)
      items.forEach((item, i) => {
        console.log(`[ABS DEBUG] Item ${i + 1}:`)
        console.log(`  Title: ${item.media.metadata.title}`)
        console.log(`  Authors: ${JSON.stringify(item.media.metadata.authors ?? [])}`)
        console.log(`  Narrators: ${JSON.stringify(item.media.metadata.narrators ?? [])}`)
        console.log(`  Duration: ${item.media.duration ?? '(none)'} secs`)
      })
    }

    return NextResponse.json({
      items: mapped,
      debug: debug ? { total: items.length } : undefined,
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
