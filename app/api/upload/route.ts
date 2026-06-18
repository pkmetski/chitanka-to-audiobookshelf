import { writeFile, mkdtemp, rm } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { uploadToAbs, setAbsCoverFromUrl, findNewLibraryItem, updateAbsItemMetadata } from '@/lib/abs/client'
import { injectSeriesIntoEpub } from '@/lib/epub/series'
import type { BookDetail } from '@/lib/scraper/types'
import type { AbsUploadMetadata } from '@/lib/abs/types'

interface UploadRequest {
  detail: BookDetail
  libraryId: string
}

type UploadStatus = 'downloading' | 'uploading' | 'cover' | 'done' | 'error'

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

      let tempPath: string | null = null
      let dir: string | null = null

      try {
        // Step 1: Download file
        send({ status: 'downloading', message: `Downloading ${detail.format.toUpperCase()} file…` })

        const fileRes = await fetch(detail.downloadUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0 chitanka-abs-uploader/1.0' },
        })
        if (!fileRes.ok) throw new Error(`Download failed: ${fileRes.status}`)

        let fileBuffer: Buffer = Buffer.from(await fileRes.arrayBuffer())
        const ext = detail.format === 'epub' ? '.epub' : '.mp3'
        const slug = detail.title
          .replace(/[^\p{L}\p{N}]+/gu, '_')
          .replace(/^_+|_+$/g, '')
          .slice(0, 80) || 'book'
        const filename = `${slug}${ext}`

        // Inject series metadata into the epub OPF so ABS reads it on scan
        if (detail.format === 'epub' && 'series' in detail && detail.series?.name) {
          fileBuffer = injectSeriesIntoEpub(fileBuffer, detail.series.name, detail.series.sequence)
        }

        dir = await mkdtemp(join(tmpdir(), 'chitanka-'))
        tempPath = join(dir, filename)
        await writeFile(tempPath, fileBuffer)

        // Step 2: Upload to ABS
        send({ status: 'uploading', message: 'Uploading to Audiobookshelf…' })

        const metadata: AbsUploadMetadata = {
          title: detail.title,
          authorName: detail.authors.join(', '),
          narratorName: 'narrators' in detail ? detail.narrators.join(', ') : undefined,
          description: detail.description || undefined,
          genres: detail.genres.length ? detail.genres : undefined,
          publishedYear: detail.year || undefined,
          language: 'language' in detail ? detail.language || undefined : undefined,
          series: 'series' in detail && detail.series ? detail.series : undefined,
        }

        // Snapshot time immediately before upload so addedAt comparisons are tight
        const uploadStartMs = Date.now()
        await uploadToAbs(absUrl, absToken, libraryId, tempPath, filename, metadata)

        // Step 3: ABS indexes asynchronously — poll immediately, then every 1s (up to ~10s).
        let itemId = ''
        for (let attempt = 0; attempt < 10 && !itemId; attempt++) {
          if (attempt > 0) await new Promise(r => setTimeout(r, 1000))
          const found = await findNewLibraryItem(absUrl, absToken, libraryId, uploadStartMs)
          itemId = found?.id ?? ''
        }

        // Step 4: Patch metadata — ABS reads title/author from the file's embedded tags
        // during scan and ignores the upload form fields, so we must override via PATCH.
        let patchStatus = 'skipped (item not found)'
        if (itemId) {
          try {
            await updateAbsItemMetadata(absUrl, absToken, itemId, metadata)
            patchStatus = 'ok'
          } catch (metaErr) {
            patchStatus = `patch failed: ${metaErr}`
            console.error('Metadata patch failed (non-fatal):', metaErr)
          }
        }

        // Step 5: Upload cover
        if (detail.coverUrl) {
          send({ status: 'cover', message: 'Setting cover art…' })
          try {
            if (itemId) {
              await setAbsCoverFromUrl(absUrl, absToken, itemId, detail.coverUrl)
            }
          } catch (coverErr) {
            console.error('Cover upload failed (non-fatal):', coverErr)
          }
        }

        const doneMessage = itemId
          ? `Done! Item added (id: ${itemId}, patch: ${patchStatus}).`
          : `File uploaded but ABS did not index it — check your library type and trigger a manual scan.`

        send({ status: 'done', message: doneMessage })
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
