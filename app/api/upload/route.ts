import { writeFile, unlink, mkdtemp } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { uploadToAbs, setAbsCoverFromUrl, findRecentLibraryItem } from '@/lib/abs/client'
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

      try {
        // Step 1: Download file
        send({ status: 'downloading', message: `Downloading ${detail.format.toUpperCase()} file…` })

        const fileRes = await fetch(detail.downloadUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0 chitanka-abs-uploader/1.0' },
        })
        if (!fileRes.ok) throw new Error(`Download failed: ${fileRes.status}`)

        const buffer = await fileRes.arrayBuffer()
        const ext = detail.format === 'epub' ? '.epub' : '.mp3'
        const filename = `${detail.title.replace(/[^a-z0-9]/gi, '_')}${ext}`

        const dir = await mkdtemp(join(tmpdir(), 'chitanka-'))
        tempPath = join(dir, filename)
        await writeFile(tempPath, Buffer.from(buffer))

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
        }

        const uploadResult = await uploadToAbs(
          absUrl,
          absToken,
          libraryId,
          tempPath,
          filename,
          metadata
        )

        // Step 3: Upload cover
        if (detail.coverUrl) {
          send({ status: 'cover', message: 'Setting cover art…' })

          // ABS POST /api/upload returns no JSON body, so uploadResult.id may be ''.
          // Discover the item ID by querying the most recently added items and matching by title.
          let itemId = uploadResult.id
          if (!itemId) {
            const found = await findRecentLibraryItem(absUrl, absToken, libraryId, detail.title)
            itemId = found?.id ?? ''
          }

          if (itemId) {
            await setAbsCoverFromUrl(absUrl, absToken, itemId, detail.coverUrl)
          }
          // If we still have no itemId, skip cover silently — item was uploaded successfully.
        }

        send({ status: 'done', message: 'Done! Item added to Audiobookshelf.' })
      } catch (err) {
        send({ status: 'error', message: 'Upload failed', error: String(err) })
      } finally {
        if (tempPath) {
          unlink(tempPath).catch(() => {}) // best-effort cleanup
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
