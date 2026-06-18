export interface AbsLibrary {
  id: string
  name: string
  mediaType: 'book' | 'podcast'
}

export interface AbsUploadMetadata {
  title: string
  authorName: string
  narratorName?: string
  description?: string
  genres?: string[]
  publishedYear?: string
  language?: string
}

export interface AbsUploadResult {
  id: string
}

export interface AbsLibraryItem {
  id: string
  media: {
    metadata: {
      title: string
    }
  }
  addedAt: number
}
