export type Site = 'chitanka' | 'gramofonche'

export interface BookSummary {
  url: string           // full URL of the detail page
  site: Site
  title: string
  authors: string[]
  coverUrl: string | null
  format: 'epub' | 'mp3'
  duration?: string
}

export interface ListingResult {
  items: BookSummary[]
  nextPagePath: string | null   // relative path, e.g. "/search?q=vazov&page=2", or null
}

export interface CategoryEntry {
  label: string
  path: string   // relative path, e.g. "/autor/ivan-vazov"
}

export interface ChitankaSeries {
  name: string
  sequence: string
}

export interface ChitankaDetail {
  site: 'chitanka'
  url: string
  title: string
  authors: string[]
  translators: string[]
  description: string
  genres: string[]
  language: string
  year: string
  series: ChitankaSeries | null
  coverUrl: string | null
  downloadUrl: string
  format: 'epub'
}

export interface GramofoncheDetail {
  site: 'gramofonche'
  url: string
  title: string
  authors: string[]
  narrators: string[]
  description: string
  genres: string[]
  language: string
  year: string
  duration: string
  coverUrl: string | null
  downloads: Array<{ url: string; title: string }>
  format: 'mp3'
}

export type BookDetail = ChitankaDetail | GramofoncheDetail
