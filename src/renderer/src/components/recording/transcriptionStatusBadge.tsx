import React from 'react'
import { Badge } from '@/components/ui/badge'
import type { TranscriptionStatus } from '@/types/audio'

interface BadgeSpec {
  label: string
  variant: 'secondary' | 'destructive' | 'default'
  className?: string
}

/**
 * Estado no-solo-color (regla 11.4): el texto del Badge cambia junto al color.
 * Extraído de TranscriptionSection del spike (SPEC-015) para compartirlo con
 * la sección Grabación de la entrevista, sin cambiar el DOM de /capture.
 */
const STATUS_BADGES: Record<TranscriptionStatus, BadgeSpec> = {
  inactive: { label: 'Inactiva', variant: 'secondary' },
  connecting: { label: 'Inactiva', variant: 'secondary' },
  active: { label: 'Transcribiendo', variant: 'default', className: 'bg-green-600 text-white' },
  disconnected: { label: 'Desconectado', variant: 'destructive' },
  'no-key': { label: 'Sin key', variant: 'default', className: 'bg-amber-500 text-white' }
}

interface TranscriptionStatusBadgeProps {
  status: TranscriptionStatus
}

export function TranscriptionStatusBadge({
  status
}: TranscriptionStatusBadgeProps): React.ReactElement {
  const badge = STATUS_BADGES[status]
  return (
    <Badge variant={badge.variant} className={badge.className}>
      {badge.label}
    </Badge>
  )
}
