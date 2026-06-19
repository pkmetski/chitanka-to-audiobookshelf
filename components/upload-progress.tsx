'use client'

import type { UploadState } from '@/hooks/use-sse-upload'
import { Button } from '@/components/ui/button'

const STEPS = ['downloading', 'uploading', 'cover', 'finalizing', 'done'] as const

interface Props {
  state: UploadState
  onReset: () => void
}

export function UploadProgress({ state, onReset }: Props) {
  if (state.status === 'idle') return null

  const currentIndex = STEPS.indexOf(state.status as typeof STEPS[number])

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        {STEPS.map((step, i) => {
          const isDone = i < currentIndex || state.status === 'done'
          const isActive = step === state.status
          return (
            <div
              key={step}
              className={`text-sm flex items-center gap-2 ${
                isDone
                  ? 'text-green-600'
                  : isActive
                  ? 'text-foreground font-medium'
                  : 'text-muted-foreground'
              }`}
            >
              <span>{isDone ? '✓' : isActive ? '→' : '○'}</span>
              <span className="capitalize">{step}</span>
            </div>
          )
        })}
      </div>

      <p className="text-sm">{state.message}</p>

      {state.status === 'error' && (
        <p className="text-sm text-destructive">{state.error}</p>
      )}

      {(state.status === 'done' || state.status === 'error') && (
        <Button size="sm" variant="outline" onClick={onReset}>
          Upload another
        </Button>
      )}
    </div>
  )
}
