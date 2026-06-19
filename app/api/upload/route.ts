import { writeFile, mkdtemp, rm } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { uploadToAbs, setAbsCoverFromUrl, findNewLibraryItems, updateAbsItemMetadata } from '@/lib/abs/client'
import { injectSeriesIntoEpub } from '@/lib/epub/series'
import type { BookDetail } from '@/lib/scraper/types'
import type { AbsLibraryItem, AbsUploadMetadata } from '@/lib/abs/types'

interface UploadRequest {
  detail: BookDetail
  libraryId: string
}

type UploadStatus = 'downloading' | 'uploading' | 'cover' | 'finalizing' | 'done' | 'error'

interface StatusEvent {
  status: UploadStatus
  message: string
  error?: string
}

export async function POST(req: Request) {
  const absUrl = req.headers.get('x-abs-url')
  const absToken = req.headers.get('x-abs-token')

  if (!absUrl || !absToken) {
    return new Response('x-abs-url and x-abs-token headers required', { status: 400 })
  }

  const body: UploadRequest = await req.json()
  const { detail, libraryId } = body
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      function send(event: StatusEvent) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
      }

      let dir: string | null = null

      try {
        // Step 1: Download files
        const downloads: Array<{ url: string; title: string }> = 'downloads' in detail
          ? detail.downloads
          : [{ url: detail.downloadUrl, title: detail.title }]
        const isMultiPart = downloads.length > 1
        const padLen = String(downloads.length).length
        const slug = detail.title
          .replace(/[^\p{L}\p{N}]+/gu, '_')
          .replace(/^_+|_+$/g, '')
          .slice(0, 80) || 'book'

        send({ status: 'downloading', message: `Downloading ${detail.format.toUpperCase()} file${isMultiPart ? `s (${downloads.length})` : ''}…` })

        dir = await mkdtemp(join(tmpdir(), 'chitanka-'))

        const filesToUpload: Array<{ path: string; name: string }> = []
        for (const [i, dl] of downloads.entries()) {
          let filename: string
          if (detail.format === 'mp3') {
            const index = String(i + 1).padStart(padLen, '0')
            const safeTitle = dl.title.replace(/[/\\:*?"<>|]/g, '_').trim() || `track-${index}`
            filename = `${index} - ${safeTitle}.mp3`
          } else {
            filename = `${slug}.epub`
          }

          const fileRes = await fetch(dl.url, {
            headers: { 'User-Agent': 'Mozilla/5.0 chitanka-abs-uploader/1.0' },
          })
          if (!fileRes.ok) throw new Error(`Download failed: ${fileRes.status}`)
          let fileBuffer = Buffer.from(await fileRes.arrayBuffer())

          if (detail.format === 'epub' && 'series' in detail && detail.series?.name) {
            fileBuffer = injectSeriesIntoEpub(fileBuffer, detail.series.name, detail.series.sequence)
          }

          const tempPath = join(dir, filename)
          await writeFile(tempPath, fileBuffer)
          filesToUpload.push({ path: tempPath, name: filename })
        }

        const metadata: AbsUploadMetadata = {
          title: detail.title,
          authorName: detail.authors.join(', '),
          narrators: 'narrators' in detail && detail.narrators.length ? detail.narrators : undefined,
          description: detail.description || undefined,
          genres: detail.genres.length ? detail.genres : undefined,
          publishedYear: detail.year || undefined,
          language: 'language' in detail ? detail.language || undefined : undefined,
          series: 'series' in detail && detail.series ? detail.series : undefined,
        }

        // Step 2: Upload all files sequentially — no polling between uploads
        const uploadStartMs = Date.now()
        for (const [i, file] of filesToUpload.entries()) {
          const fileLabel = isMultiPart ? ` (${i + 1}/${filesToUpload.length}: ${file.name})` : ''
          send({ status: 'uploading', message: `Uploading to Audiobookshelf${fileLabel}…` })
          await uploadToAbs(absUrl, absToken, libraryId, [file], metadata)
        }

        // Step 3: Poll until all uploaded items appear in the library (up to 30s)
        const expectedCount = filesToUpload.length
        let newItems: AbsLibraryItem[] = []
        for (let attempt = 0; attempt < 30 && newItems.length < expectedCount; attempt++) {
          if (attempt > 0) await new Promise(r => setTimeout(r, 1000))
          newItems = await findNewLibraryItems(absUrl, absToken, libraryId, uploadStartMs, expectedCount)
        }

        // Step 4: PATCH-1 on all items (best-effort; ABS initial scan may not have run yet)
        for (const item of newItems) {
          try {
            await updateAbsItemMetadata(absUrl, absToken, item.id, metadata)
          } catch (metaErr) {
            console.error('Metadata patch-1 failed (non-fatal):', metaErr)
          }
        }

        // Step 5: Cover on all items
        if (detail.coverUrl && newItems.length) {
          send({ status: 'cover', message: 'Setting cover art…' })
          for (const item of newItems) {
            try {
              await setAbsCoverFromUrl(absUrl, absToken, item.id, detail.coverUrl)
            } catch (coverErr) {
              console.error('Cover upload failed (non-fatal):', coverErr)
            }
          }
        }

        // Step 6: Wait for ABS initial scan to finish (~12-13 s after the latest addedAt),
        // then PATCH-2 to restore metadata that ABS overwrites from embedded tags.
        if (newItems.length) {
          const maxAddedAt = Math.max(...newItems.map(i => i.addedAt ?? 0))
          const waitMs = Math.max(0, maxAddedAt + 14000 - Date.now())
          if (waitMs > 0) {
            send({ status: 'finalizing', message: 'Waiting for library scan to complete…' })
            await new Promise(r => setTimeout(r, waitMs))
          }
          for (const item of newItems) {
            try {
              await updateAbsItemMetadata(absUrl, absToken, item.id, metadata)
            } catch (metaErr) {
              console.error('Metadata patch-2 failed (non-fatal):', metaErr)
            }
          }
        }

        const count = filesToUpload.length
        const idList = newItems.length ? ` (ids: ${newItems.map(i => i.id).join(', ')})` : ''
        send({
          status: 'done',
          message: newItems.length === count
            ? `Done! ${count} file${count > 1 ? 's' : ''} uploaded${idList}.`
            : `Uploaded ${count} file${count > 1 ? 's' : ''} but ABS only indexed ${newItems.length} — check your library type and trigger a manual scan.`,
        })
      } catch (err) {
        send({ status: 'error', message: 'Upload failed', error: String(err) })
      } finally {
        if (dir) {
          rm(dir, { recursive: true, force: true }).catch(() => {}) // best-effort cleanup
        }
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}
