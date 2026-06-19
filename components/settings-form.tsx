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
    setStatus('Проверява...')
    try {
      const res = await fetch('/api/abs/libraries', {
        headers: { 'x-abs-url': absUrl, 'x-abs-token': absToken },
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setStatus(`Свързан — намерени са ${data.libraries?.length ?? 0} библиотеки`)
    } catch (err) {
      setStatus(`Грешка: ${String(err)}`)
    }
  }

  function handleSave() {
    save({ absUrl, absToken })
    setStatus('Запазено')
  }

  return (
    <div className="space-y-4 max-w-md">
      <div>
        <Label htmlFor="abs-url">URL адрес на Audiobookshelf сървър</Label>
        <Input
          id="abs-url"
          value={absUrl}
          onChange={(e) => setAbsUrl(e.target.value)}
          placeholder="http://localhost:13378"
        />
      </div>
      <div>
        <Label htmlFor="abs-token">API токен</Label>
        <Input
          id="abs-token"
          type="password"
          value={absToken}
          onChange={(e) => setAbsToken(e.target.value)}
          placeholder="поставете вашия ABS API токен"
        />
      </div>
      <div className="flex gap-2">
        <Button onClick={handleSave}>Запази</Button>
        <Button variant="outline" onClick={testConnection}>
          Тествай връзката
        </Button>
      </div>
      {status && <p className="text-sm text-muted-foreground">{status}</p>}
    </div>
  )
}
