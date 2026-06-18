import { NextResponse } from 'next/server'
import { searchChitanka } from '@/lib/scraper/chitanka'
import { searchGramofonche } from '@/lib/scraper/gramofonche'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const site = searchParams.get('site')
  const q = searchParams.get('q') ?? ''

  if (!site || !q) {
    return NextResponse.json({ error: 'site and q are required' }, { status: 400 })
  }

  try {
    const result =
      site === 'chitanka'
        ? await searchChitanka(q)
        : await searchGramofonche(q)
    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
