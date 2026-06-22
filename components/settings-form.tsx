'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useSettings } from '@/hooks/use-settings'

export function SettingsForm() {
  const { settings, save, absHeaders } = useSettings()
  const [absUrl, setAbsUrl] = useState(settings.absUrl)
  const [absToken, setAbsToken] = useState(settings.absToken)
  const [status, setStatus] = useState<string | null>(null)
  const [isMarking, setIsMarking] = useState(false)

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

  async function markAllAsOwned() {
    setIsMarking(true)
    setStatus('Отбелязване на всички елементи като притежавани...')
    try {
      const res = await fetch('/api/abs/mark-owned-all', {
        method: 'POST',
        headers: absHeaders(),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setStatus(`✓ ${data.message}`)
    } catch (err) {
      setStatus(`Грешка: ${String(err)}`)
    } finally {
      setIsMarking(false)
    }
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
      <div className="pt-4 border-t">
        <p className="text-sm text-muted-foreground mb-2">
          Ако притежавани елементи не се показват:
        </p>
        <Button
          variant="secondary"
          onClick={markAllAsOwned}
          disabled={isMarking || !absUrl || !absToken}
          size="sm"
        >
          {isMarking ? 'Обработка...' : 'Отбелязване на всички като притежавани'}
        </Button>
      </div>
      {status && <p className="text-sm text-muted-foreground">{status}</p>}
    </div>
  )
}
