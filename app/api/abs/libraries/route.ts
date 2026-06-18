import { NextResponse } from 'next/server'
import { fetchAbsLibraries } from '@/lib/abs/client'

export async function GET(req: Request) {
  const absUrl = req.headers.get('x-abs-url')
  const absToken = req.headers.get('x-abs-token')

  if (!absUrl || !absToken) {
    return NextResponse.json({ error: 'x-abs-url and x-abs-token headers required' }, { status: 400 })
  }

  try {
    const libraries = await fetchAbsLibraries(absUrl, absToken)
    return NextResponse.json({ libraries })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
