import React from 'react'
import { ArrowLeft } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { ApiKeyRow } from '@/components/settings/ApiKeyRow'
import { useSecrets } from '@/hooks/useSecrets'

/**
 * Página de Ajustes (SPEC-007) — Layout 3 (formulario centrado, max-w 640px),
 * sin sidebar (el layout global llega en el ítem 6 de H1). Gestiona las claves
 * de IA con guardado cifrado write-only: aquí nunca se muestra una clave.
 */
export function SettingsPage(): React.ReactElement {
  const navigate = useNavigate()
  const { status, save, remove } = useSecrets()

  // Mientras carga (status null) no se asume indisponibilidad: filas en Skeleton
  const encryptionAvailable = status === null || status.available

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[640px] flex-col gap-8 px-6 py-8">
      <div>
        <Button variant="ghost" onClick={() => void navigate('/')}>
          <ArrowLeft />
          Volver
        </Button>
      </div>
      <h1 className="text-2xl font-bold">Ajustes</h1>
      <section className="flex flex-col gap-6">
        <div className="flex flex-col gap-1">
          <h3 className="text-lg font-semibold">Claves de IA</h3>
          <p className="text-sm text-muted-foreground">
            Las claves se guardan cifradas en este equipo y nunca vuelven a mostrarse.
          </p>
        </div>
        {status !== null && !status.available && (
          <Alert variant="destructive">
            <AlertTitle>Cifrado no disponible</AlertTitle>
            <AlertDescription>
              No es posible guardar claves de forma segura en este equipo: el cifrado del sistema no
              está disponible. Nunca se guardará una clave sin cifrar.
            </AlertDescription>
          </Alert>
        )}
        <ApiKeyRow
          label="Deepgram (transcripción)"
          placeholder="Pega aquí tu API key de Deepgram"
          status={status?.deepgram ?? null}
          encryptionAvailable={encryptionAvailable}
          onSave={(value) => save('deepgram', value)}
          onRemove={() => remove('deepgram')}
        />
        <ApiKeyRow
          label="Anthropic (asistente y guiones)"
          placeholder="Pega aquí tu API key de Anthropic"
          status={status?.anthropic ?? null}
          encryptionAvailable={encryptionAvailable}
          onSave={(value) => save('anthropic', value)}
          onRemove={() => remove('anthropic')}
        />
      </section>
    </main>
  )
}
