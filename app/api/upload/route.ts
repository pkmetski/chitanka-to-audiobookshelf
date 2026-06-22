import { writeFile, mkdtemp, rm } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { uploadToAbs, setAbsCoverFromUrl, findNewLibraryItems, updateAbsItemMetadata, scanAbsLibrary, markAbsItemAsOwned } from '@/lib/abs/client'
import { stripId3LabelSuffix } from '@/lib/abs/id3'
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

        if (!downloads.length) throw new Error('Не са намерени линкове за сваляне на тази страница.')

        send({ status: 'downloading', message: `Изтегляне на ${detail.format.toUpperCase()} файл${isMultiPart ? `ове (${downloads.length})` : ''}…` })

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
          if (!fileRes.ok) throw new Error(`Свалянето е неуспешно: ${fileRes.status}`)
          let fileBuffer = Buffer.from(await fileRes.arrayBuffer())

          if (detail.format === 'mp3') {
            fileBuffer = stripId3LabelSuffix(fileBuffer) as typeof fileBuffer
          }

          if (detail.format === 'epub' && 'series' in detail && detail.series?.name) {
            fileBuffer = injectSeriesIntoEpub(fileBuffer, detail.series.name, detail.series.sequence) as typeof fileBuffer
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
          language: 'Bulgarian',
          series: 'series' in detail && detail.series ? detail.series : undefined,
        }

        // Step 2: Upload all files in a single request so ABS groups them into one item
        send({ status: 'uploading', message: `Качване в Audiobookshelf…` })
        const uploadStartMs = Date.now()
        let uploadErr: Error | null = null
        try {
          await uploadToAbs(absUrl, absToken, libraryId, filesToUpload, metadata)
          console.log('[upload] upload completed successfully')
        } catch (err) {
          // ABS sometimes closes the TCP connection before we can read its response
          // (especially for large multi-track uploads over Tailscale). The upload may
          // still have succeeded, so we continue polling before surfacing the error.
          uploadErr = err instanceof Error ? err : new Error(String(err))
          console.warn('[upload] upload threw (will poll anyway):', uploadErr.message)
        }

        // Trigger a library scan so ABS indexes the uploaded files immediately.
        // Without this, multi-file uploads may not appear for 30–60 s or more.
        await scanAbsLibrary(absUrl, absToken, libraryId)

        // Step 3: Poll until the uploaded item appears in the library (up to 60s).
        // Wait 2s before the first attempt — ABS needs a moment after a large upload
        // before the item appears in the library listing.
        const expectedCount = 1
        let newItems: AbsLibraryItem[] = []
        for (let attempt = 0; attempt < 30 && newItems.length < expectedCount; attempt++) {
          await new Promise(r => setTimeout(r, 2000))
          try {
            newItems = await findNewLibraryItems(absUrl, absToken, libraryId, uploadStartMs, expectedCount)
            if (newItems.length > 0) {
              console.log(`[poll] attempt ${attempt + 1}: found ${newItems.length} item(s)`)
            }
          } catch (pollErr) {
            // ABS can be briefly unreachable after a large upload drops the TCP
            // connection (Tailscale socket hang-up). Swallow and keep retrying —
            // the item may still appear once ABS recovers.
            console.warn(`[poll] attempt ${attempt + 1}: ABS unreachable (${(pollErr as Error).message}), retrying…`)
          }
        }

        // Surface the upload error only if the item never appeared in the library.
        if (uploadErr && newItems.length === 0) {
          console.error('[upload] no item found after polling; surfacing upload error:', uploadErr.message)
          throw uploadErr
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
          send({ status: 'cover', message: 'Задаване на корица…' })
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
            send({ status: 'finalizing', message: 'Изчакване на сканирането на библиотеката…' })
            await new Promise(r => setTimeout(r, waitMs))
          }
          for (const item of newItems) {
            try {
              await updateAbsItemMetadata(absUrl, absToken, item.id, metadata)
            } catch (metaErr) {
              console.error('Metadata patch-2 failed (non-fatal):', metaErr)
            }
          }
          for (const item of newItems) {
            try {
              await markAbsItemAsOwned(absUrl, absToken, item.id)
            } catch (ownedErr) {
              console.error('Mark-owned failed (non-fatal):', ownedErr)
            }
          }
        }

        const fileCount = filesToUpload.length
        const idList = newItems.length ? ` (id: ${newItems[0].id})` : ''
        send({
          status: 'done',
          message: newItems.length >= 1
            ? `Готово! Качени са ${fileCount} файл${fileCount > 1 ? 'а' : ''}${idList}.`
            : `Качени са ${fileCount} файл${fileCount > 1 ? 'а' : ''}, но ABS не го индексира — проверете типа на библиотеката и стартирайте ръчно сканиране.`,
        })
      } catch (err) {
        send({ status: 'error', message: 'Качването е неуспешно', error: String(err) })
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
