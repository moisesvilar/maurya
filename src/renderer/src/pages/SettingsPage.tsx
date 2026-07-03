import React from 'react'
import { ArrowLeft } from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ApiKeyRow } from '@/components/settings/ApiKeyRow'
import { NoteTemplatesTab } from '@/components/settings/NoteTemplatesTab'
import { useSecrets } from '@/hooks/useSecrets'

type SettingsTab = 'api-keys' | 'note-templates'

/**
 * Página de Ajustes (SPEC-007 + SPEC-008) — Layout 4 (Settings) con Tabs:
 * "Claves de IA" (SPEC-007, guardado cifrado write-only) y "Plantillas de
 * notas" (SPEC-008). La pestaña activa se refleja en `?tab=` (default
 * api-keys si falta o es inválido) para que "Volver" del editor de plantillas
 * regrese a la pestaña correcta. Sin forceMount: la pestaña inactiva se
 * desmonta y no dispara sus cargas.
 */
export function SettingsPage(): React.ReactElement {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { status, save, remove } = useSecrets()

  const tab: SettingsTab =
    searchParams.get('tab') === 'note-templates' ? 'note-templates' : 'api-keys'

  const handleTabChange = (value: string): void => {
    setSearchParams({ tab: value }, { replace: true })
  }

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
      <Tabs value={tab} onValueChange={handleTabChange}>
        <TabsList>
          <TabsTrigger value="api-keys">Claves de IA</TabsTrigger>
          <TabsTrigger value="note-templates">Plantillas de notas</TabsTrigger>
        </TabsList>
        <TabsContent value="api-keys" className="pt-4">
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
                  No es posible guardar claves de forma segura en este equipo: el cifrado del
                  sistema no está disponible. Nunca se guardará una clave sin cifrar.
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
        </TabsContent>
        <TabsContent value="note-templates" className="pt-4">
          <NoteTemplatesTab />
        </TabsContent>
      </Tabs>
    </main>
  )
}
