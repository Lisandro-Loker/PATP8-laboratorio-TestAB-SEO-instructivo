'use client'

import { useState, useTransition } from 'react'
import { recordConversion, type ConversionResult } from '@/app/practica/actions'

export function Cta({ label }: { label: string }) {
  const [status, setStatus] = useState<ConversionResult['status'] | null>(null)
  const [pending, startTransition] = useTransition()

  return (
    <div className="flex flex-col items-start gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          startTransition(async () => {
            const result = await recordConversion()
            setStatus(result.status)
          })
        }}
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
      >
        {label}
      </button>
      <p className="max-w-md text-sm text-muted-foreground">
        {status === 'converted'
          ? 'Conversión anotada para este visitante.'
          : status === 'already_converted'
            ? 'Este visitante ya convirtió antes. Un segundo clic no suma otra conversión.'
            : status === 'ignored'
              ? 'Vista de preview o sin sesión: el clic no suma al experimento.'
              : 'La conversión se anota solo acá. Cargar la página no cuenta.'}
      </p>
    </div>
  )
}