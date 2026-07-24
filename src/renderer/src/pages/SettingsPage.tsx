import React from 'react'
import { useSearchParams } from 'react-router-dom'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { AiCostCard } from '@/components/settings/AiCostCard'
import { ApiKeyRow } from '@/components/settings/ApiKeyRow'
import { AiModelsCard } from '@/components/settings/AiModelsCard'
import { AssistantSettingsCard } from '@/components/settings/AssistantSettingsCard'
import { CustomPromptsTab } from '@/components/settings/CustomPromptsTab'
import { InterviewTemplatesTab } from '@/components/settings/InterviewTemplatesTab'
import { LinkedinMcpCard } from '@/components/settings/LinkedinMcpCard'
import { NoteTemplatesTab } from '@/components/settings/NoteTemplatesTab'
import { useSecrets } from '@/hooks/useSecrets'

type SettingsTab = 'api-keys' | 'note-templates' | 'interview-templates' | 'custom-prompts'

/**
 * Página de Ajustes (SPEC-007 + SPEC-008) — Layout 4 (Settings) con Tabs:
 * "Claves de IA" (SPEC-007, guardado cifrado write-only), "Plantillas de
 * notas" (SPEC-008) y "Plantillas de entrevistas" (SPEC-051, que unifica aquí
 * la gestión de plantillas derogando el hub de SPEC-009/012). La pestaña activa
 * se refleja en `?tab=` (default api-keys si falta o es inválido) para que
 * "Volver" de los editores de plantillas regrese a la pestaña correcta. Sin
 * forceMount: la pestaña inactiva se desmonta y no dispara sus cargas.
 *
 * SPEC-009: la página vive bajo el Layout — sin back button "Volver" (la
 * navegación la da el sidebar, regla 2.3) y sin h1 propio (el título "Ajustes"
 * lo da el top bar); las tabs abren el contenido.
 */
export function SettingsPage(): React.ReactElement {
  const [searchParams, setSearchParams] = useSearchParams()
  const { status, save, remove } = useSecrets()

  const tabParam = searchParams.get('tab')
  const tab: SettingsTab =
    tabParam === 'note-templates' ||
    tabParam === 'interview-templates' ||
    tabParam === 'custom-prompts'
      ? tabParam
      : 'api-keys'

  const handleTabChange = (value: string): void => {
    setSearchParams({ tab: value }, { replace: true })
  }

  // Mientras carga (status null) no se asume indisponibilidad: filas en Skeleton
  const encryptionAvailable = status === null || status.available

  return (
    <div className="mx-auto flex w-full max-w-[640px] flex-col gap-8 px-6 py-8">
      <Tabs value={tab} onValueChange={handleTabChange}>
        <TabsList>
          <TabsTrigger value="api-keys">Claves de IA</TabsTrigger>
          <TabsTrigger value="note-templates">Plantillas de notas</TabsTrigger>
          <TabsTrigger value="interview-templates">Plantillas de preguntas</TabsTrigger>
          <TabsTrigger value="custom-prompts">Prompts personalizados</TabsTrigger>
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
            {/* MCP de LinkedIn (Apify u otro): URL en db + token cifrado */}
            <LinkedinMcpCard
              tokenStatus={status?.linkedinMcp ?? null}
              encryptionAvailable={encryptionAvailable}
              onSaveToken={(value) => save('linkedinMcp', value)}
              onRemoveToken={() => remove('linkedinMcp')}
            />
            {/* Límite de coste de IA por entrevista (SPEC-021), bajo las claves */}
            <AiCostCard />
            {/* Modelo y thinking por tarea de IA (revisión de coste 2026-07) */}
            <AiModelsCard />
            {/* Tamaño de la cola de preguntas del asistente (SPEC-036) */}
            <AssistantSettingsCard />
          </section>
        </TabsContent>
        <TabsContent value="note-templates" className="pt-4">
          <NoteTemplatesTab />
        </TabsContent>
        <TabsContent value="interview-templates" className="pt-4">
          <InterviewTemplatesTab />
        </TabsContent>
        <TabsContent value="custom-prompts" className="pt-4">
          <CustomPromptsTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}
