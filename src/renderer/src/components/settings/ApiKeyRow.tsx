import React, { useState } from 'react'
import { Trash2 } from 'lucide-react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { KeyStatus } from '@/types/secrets'

interface ApiKeyRowProps {
  label: string
  placeholder: string
  /** null mientras carga el estado inicial → Skeleton en la zona de estado. */
  status: KeyStatus | null
  /** false cuando safeStorage no puede cifrar: Guardar deshabilitado + Tooltip. */
  encryptionAvailable: boolean
  /** Devuelve true si el guardado tuvo éxito (se limpia el input). */
  onSave: (value: string) => Promise<boolean>
  onRemove: () => Promise<void>
}

/**
 * Fila de gestión de una clave de IA (SPEC-007). Write-only: el input nunca
 * precarga la clave guardada; el estado se comunica con Badge + últimos 4.
 */
export function ApiKeyRow({
  label,
  placeholder,
  status,
  encryptionAvailable,
  onSave,
  onRemove
}: ApiKeyRowProps): React.ReactElement {
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    if (value.trim() === '') {
      setError('Introduce una clave')
      return
    }
    setError(null)
    void onSave(value).then((saved) => {
      if (saved) {
        setValue('')
      }
    })
  }

  const handleConfirmRemove = (): void => {
    setConfirmOpen(false)
    void onRemove()
  }

  const saveButton = (
    <Button type="submit" disabled={!encryptionAvailable}>
      Guardar
    </Button>
  )

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">{label}</span>
        {status === null ? (
          <Skeleton className="h-5 w-32" />
        ) : status.configured ? (
          <span className="flex items-center gap-2">
            <Badge className="bg-green-600 text-white">Configurada</Badge>
            <span className="font-mono text-xs text-muted-foreground">····{status.last4}</span>
          </span>
        ) : (
          <Badge variant="secondary">No configurada</Badge>
        )}
      </div>
      <form className="flex items-start gap-2" onSubmit={handleSubmit}>
        <Input
          type="password"
          placeholder={placeholder}
          value={value}
          aria-label={label}
          aria-invalid={error !== null}
          onChange={(event) => {
            setValue(event.target.value)
            if (error !== null) {
              setError(null)
            }
          }}
        />
        {encryptionAvailable ? (
          saveButton
        ) : (
          <Tooltip>
            {/* span tabIndex: un botón disabled no dispara eventos de puntero */}
            <TooltipTrigger asChild>
              <span tabIndex={0}>{saveButton}</span>
            </TooltipTrigger>
            <TooltipContent>
              No es posible guardar claves de forma segura en este equipo.
            </TooltipContent>
          </Tooltip>
        )}
      </form>
      {error !== null && <p className="text-sm text-destructive">{error}</p>}
      {status !== null && status.configured && (
        <div>
          <Button
            variant="ghost"
            className="text-destructive hover:text-destructive"
            onClick={() => setConfirmOpen(true)}
          >
            <Trash2 />
            Eliminar
          </Button>
        </div>
      )}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar clave</AlertDialogTitle>
            <AlertDialogDescription>
              La funcionalidad que depende de {label} (transcripción o asistente) dejará de
              funcionar, salvo que exista una clave de desarrollo como fallback.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={handleConfirmRemove}>
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
