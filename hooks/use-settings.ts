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
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      // Intentional: reads localStorage once on mount to hydrate state from persisted settings
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (raw) setSettings(JSON.parse(raw))
    } catch {
      // ignore parse errors
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoaded(true)
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

  return { settings, save, absHeaders, loaded }
}
