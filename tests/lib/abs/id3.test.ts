import { describe, it, expect } from 'vitest'
import { createRequire } from 'module'
import { cleanLabelSuffix, hasLabelSuffix, stripId3LabelSuffix } from '@/lib/abs/id3'

// ── Pure string helpers ──────────────────────────────────────────────────────

describe('cleanLabelSuffix', () => {
  it('strips /Кынев', () => {
    expect(cleanLabelSuffix('Вълкът и агнето /Кынев')).toBe('Вълкът и агнето')
  })
  it('strips /БалканТон', () => {
    expect(cleanLabelSuffix('Дванайсетте месеца /БалканТон')).toBe('Дванайсетте месеца')
  })
  it('strips /Пан', () => {
    expect(cleanLabelSuffix('Котаракът /Пан')).toBe('Котаракът')
  })
  it('strips /радио', () => {
    expect(cleanLabelSuffix('Алиса /радио')).toBe('Алиса')
  })
  it('leaves titles without a suffix unchanged', () => {
    expect(cleanLabelSuffix('Вълкът и агнето')).toBe('Вълкът и агнето')
  })
  it('does NOT strip multi-word pseudo-suffixes', () => {
    // Real label names are always single tokens; multi-word values are part of the title.
    expect(cleanLabelSuffix('Приказка /с интервали тук')).toBe('Приказка /с интервали тук')
  })
  it('leaves empty string unchanged', () => {
    expect(cleanLabelSuffix('')).toBe('')
  })
})

describe('hasLabelSuffix', () => {
  it('detects /Кынев', () => expect(hasLabelSuffix('foo /Кынев')).toBe(true))
  it('detects /БалканТон', () => expect(hasLabelSuffix('foo /БалканТон')).toBe(true))
  it('returns false when no suffix', () => expect(hasLabelSuffix('foo')).toBe(false))
  it('returns false for multi-word suffix', () => expect(hasLabelSuffix('foo /bar baz')).toBe(false))
})

// ── Buffer-level stripping (requires node-id3) ────────────────────────────────

const nodeRequire = createRequire(import.meta.url)

function makeTaggedBuffer(title: string): Buffer {
  const NodeID3 = nodeRequire('node-id3')
  // write() prepends the ID3 tag to the supplied file content
  return NodeID3.write({ title }, Buffer.alloc(0)) as Buffer
}

function readTitle(buf: Buffer): string | undefined {
  const NodeID3 = nodeRequire('node-id3')
  return NodeID3.read(buf).title
}

describe('stripId3LabelSuffix', () => {
  it('strips /Кынев from MP3 buffer', () => {
    const buf = makeTaggedBuffer('Вълкът и агнето /Кынев')
    const result = stripId3LabelSuffix(buf)
    expect(readTitle(result)).toBe('Вълкът и агнето')
  })

  it('strips /БалканТон from MP3 buffer', () => {
    const buf = makeTaggedBuffer('Дванайсетте месеца /БалканТон')
    const result = stripId3LabelSuffix(buf)
    expect(readTitle(result)).toBe('Дванайсетте месеца')
  })

  it('returns buffer unchanged when no suffix', () => {
    const buf = makeTaggedBuffer('Вълкът и агнето')
    const result = stripId3LabelSuffix(buf)
    expect(result).toBe(buf) // same reference — no copy made
    expect(readTitle(result)).toBe('Вълкът и агнето')
  })

  it('returns original buffer when title is missing', () => {
    const NodeID3 = nodeRequire('node-id3')
    const buf = NodeID3.write({}, Buffer.alloc(0)) as Buffer
    const result = stripId3LabelSuffix(buf)
    expect(result).toBe(buf)
  })

  it('returns original buffer when input is not a valid ID3 file', () => {
    const buf = Buffer.from('not an mp3')
    const result = stripId3LabelSuffix(buf)
    expect(result).toBe(buf)
  })
})
