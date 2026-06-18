import { NextResponse } from 'next/server'
import { fetchChitankaDetail } from '@/lib/scraper/chitanka'
import { fetchGramofoncheDetail } from '@/lib/scraper/gramofonche'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const url = searchParams.get('url')

  if (!url) {
    return NextResponse.json({ error: 'url is required' }, { status: 400 })
  }

  try {
    const detail = url.includes('gramofonche')
      ? await fetchGramofoncheDetail(url)
      : await fetchChitankaDetail(url)
    return NextResponse.json(detail)
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
