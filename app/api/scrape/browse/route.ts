import { NextResponse } from 'next/server'
import { browseChitanka } from '@/lib/scraper/chitanka'
import { browseGramofonche } from '@/lib/scraper/gramofonche'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const site = searchParams.get('site')
  const path = searchParams.get('path')

  if (!site || !path) {
    return NextResponse.json({ error: 'site and path are required' }, { status: 400 })
  }

  try {
    const result =
      site === 'chitanka'
        ? await browseChitanka(path)
        : await browseGramofonche(path)
    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
