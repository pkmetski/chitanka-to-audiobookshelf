export interface AbsLibraryFolder {
  id: string
  fullPath: string
}

export interface AbsLibrary {
  id: string
  name: string
  mediaType: 'book' | 'podcast'
  folders: AbsLibraryFolder[]
}

export interface AbsUploadMetadata {
  title: string
  authorName: string
  narrators?: string[]
  description?: string
  genres?: string[]
  publishedYear?: string
  language?: string
  series?: { name: string; sequence: string }
}

export interface AbsUploadResult {
  id: string
}

export interface AbsLibraryItem {
  id: string
  media: {
    duration?: number
    metadata: {
      title: string
      authorName?: string
      authors?: { name: string }[]
    }
  }
  addedAt: number
}
