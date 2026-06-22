import { NextResponse } from 'next/server'
import { fetchAbsLibraries, fetchAbsLibraryItems, markAbsItemAsOwned } from '@/lib/abs/client'

export async function POST(req: Request) {
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

    let marked = 0
    let failed = 0

    for (const item of items) {
      try {
        await markAbsItemAsOwned(absUrl, absToken, item.id)
        marked++
      } catch (err) {
        console.error(`Failed to mark item ${item.id} as owned:`, err)
        failed++
      }
    }

    return NextResponse.json({
      success: true,
      message: `Marked ${marked} items as owned${failed > 0 ? ` (${failed} failed)` : ''}`,
      marked,
      failed,
      total: items.length,
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
