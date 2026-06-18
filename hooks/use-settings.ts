'use client'

import { useState, useEffect } from 'react'

export interface AbsSettings {
  absUrl: string
  absToken: string
}

const STORAGE_KEY = 'abs-settings'
const DEFAULT: AbsSettings = { absUrl: '', absToken: '' }

export function useSettings() {
  const [settings, setSettings] = useState<AbsSettings>(DEFAULT)

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) setSettings(JSON.parse(raw))
    } catch {
      // ignore parse errors
    }
  }, [])

  function save(next: AbsSettings) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    setSettings(next)
  }

  function absHeaders(): Record<string, string> {
    return {
      'x-abs-url': settings.absUrl,
      'x-abs-token': settings.absToken,
    }
  }

  return { settings, save, absHeaders }
}
