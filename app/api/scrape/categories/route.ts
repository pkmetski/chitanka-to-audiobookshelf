import { NextResponse } from 'next/server'
import { fetchChitankaCategories } from '@/lib/scraper/chitanka'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const site = searchParams.get('site')

  if (site !== 'chitanka') {
    return NextResponse.json({ error: 'Only site=chitanka is supported' }, { status: 400 })
  }

  try {
    const categories = await fetchChitankaCategories()
    return NextResponse.json({ categories })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
