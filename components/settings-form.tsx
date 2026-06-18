'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useSettings } from '@/hooks/use-settings'

export function SettingsForm() {
  const { settings, save } = useSettings()
  const [absUrl, setAbsUrl] = useState(settings.absUrl)
  const [absToken, setAbsToken] = useState(settings.absToken)
  const [status, setStatus] = useState<string | null>(null)

  async function testConnection() {
    setStatus('Testing...')
    try {
      const res = await fetch('/api/abs/libraries', {
        headers: { 'x-abs-url': absUrl, 'x-abs-token': absToken },
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setStatus(`Connected — ${data.libraries.length} libraries found`)
    } catch (err) {
      setStatus(`Error: ${String(err)}`)
    }
  }

  function handleSave() {
    save({ absUrl, absToken })
    setStatus('Saved')
  }

  return (
    <div className="space-y-4 max-w-md">
      <div>
        <Label htmlFor="abs-url">Audiobookshelf server URL</Label>
        <Input
          id="abs-url"
          value={absUrl}
          onChange={(e) => setAbsUrl(e.target.value)}
          placeholder="http://localhost:13378"
        />
      </div>
      <div>
        <Label htmlFor="abs-token">API token</Label>
        <Input
          id="abs-token"
          type="password"
          value={absToken}
          onChange={(e) => setAbsToken(e.target.value)}
          placeholder="paste your ABS API token"
        />
      </div>
      <div className="flex gap-2">
        <Button onClick={handleSave}>Save</Button>
        <Button variant="outline" onClick={testConnection}>
          Test connection
        </Button>
      </div>
      {status && <p className="text-sm text-muted-foreground">{status}</p>}
    </div>
  )
}
