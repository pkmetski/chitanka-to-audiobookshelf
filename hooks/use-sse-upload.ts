'use client'

import { useState, useCallback, useRef } from 'react'
import type { BookDetail } from '@/lib/scraper/types'

export type UploadStatus = 'idle' | 'downloading' | 'uploading' | 'cover' | 'finalizing' | 'done' | 'error'

export interface UploadState {
  status: UploadStatus
  message: string
  error?: string
}

export function useSseUpload() {
  const [state, setState] = useState<UploadState>({ status: 'idle', message: '' })
  const abortRef = useRef<AbortController | null>(null)

  const startUpload = useCallback(
    (detail: BookDetail, libraryId: string, absHeaders: Record<string, string>) => {
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller

      setState({ status: 'downloading', message: 'Starting…' })

      fetch('/api/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...absHeaders },
        body: JSON.stringify({ detail, libraryId }),
        signal: controller.signal,
      })
        .then(async (res) => {
          if (!res.body) throw new Error('No response body')
          const reader = res.body.getReader()
          const decoder = new TextDecoder()

          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            const text = decoder.decode(value, { stream: true })
            for (const line of text.split('\n')) {
              if (line.startsWith('data: ')) {
                try {
                  const event = JSON.parse(line.slice(6))
                  setState(event)
                } catch {
                  // skip malformed lines
                }
              }
            }
          }
        })
        .catch((err: unknown) => {
          if (err instanceof DOMException && err.name === 'AbortError') return
          setState({ status: 'error', message: 'Upload failed', error: String(err) })
        })
    },
    []
  )

  function reset() {
    abortRef.current?.abort()
    abortRef.current = null
    setState({ status: 'idle', message: '' })
  }

  return { state, startUpload, reset }
}
