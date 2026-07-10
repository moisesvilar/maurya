# SPEC-021 — Plan de implementación

> Generado por subagente Plan (2026-07-10). Contrato: specs/SPEC-021-medicion-control-coste-ia.md. Verificado sobre el código real: (a) las respuestas del SDK viven en la variable local `response: Anthropic.Message` de `llmService.doGenerate` (~409), `noteService.doGenerate` (~297) y `assistantService.requestSuggestion` (~354) — `response.usage.{input_tokens,output_tokens}` está disponible tras cada llamada exitosa; (b) el resumen del asistente (`AssistantSessionSummary`) se crea en `stopAssistant()` y `transcriptionService.persistTranscript` lo serializa **tal cual** en el bloque `assistant` de transcript.json → ampliar el tipo basta, transcriptionService NO se toca; (c) el punto exacto del stop es `recording:stop` en `src/main/ipc.ts:184-226` (`stopAssistant()` → `finishTranscription` → `stopRecording` → `persistTranscript` → `updateInterview`); (d) `isDbData` (store.ts:61) solo valida `schemaVersion` numérico + colecciones array → un campo raíz extra `aiCostSettings` se tolera y se preserva (`data = parsed` + `structuredClone` + `persist` reserializan el objeto completo); (e) tarifa vigente de `claude-opus-4-8`: **$5/MTok entrada · $25/MTok salida**. Decisión clave: **el estado "pausado por límite" vive en MAIN** (en la sesión de `assistantService`), porque el gating de llamadas solo puede aplicarse donde se lanzan; el renderer solo refleja el evento push existente `assistant:update` (estado nuevo `'paused'`) y "Reanudar" es un canal invoke nuevo.

## 1. Tipos de dominio + módulo de tarifas (base de todo)

- **src/renderer/src/types/domain.ts**:
  - `export interface AiUsage { calls: number; inputTokens: number; outputTokens: number; estimatedCostUsd: number }`
  - `Interview.aiUsage?: AiUsage | null` — opcional, comentado como SPEC-021 (ausente = sin datos; **sin bump de `schemaVersion`**).
  - `export interface AiCostSettings { limitUsd: number | null }` (null = sin límite).
  - `DbApi` gana `getAiCostSettings: () => Promise<DbResult<AiCostSettings>>` y `setAiCostSettings: (settings: AiCostSettings) => Promise<DbResult<AiCostSettings>>`.
  - `UpdateInterviewPatch` **NO** gana `aiUsage`: la acumulación va solo por una función dedicada del repositorio, nunca escribible desde el renderer.
- **src/main/aiCost.ts (nuevo)** — único lugar con tarifas y cálculo:
  - `export const INPUT_USD_PER_MTOK = 5` · `export const OUTPUT_USD_PER_MTOK = 25` (constantes documentadas: tarifa `claude-opus-4-8`; no configurables — decisión de la spec).
  - `export function computeCostUsd(inputTokens: number, outputTokens: number): number` → `(in/1e6)*5 + (out/1e6)*25`.
  - `export function roundUpUsd(value: number): number` → `Math.ceil(value * 100) / 100` (redondeo hacia arriba a 2 decimales, usado SOLO en la comparación con el límite: pausa antes de excederlo).
  - `export function extractUsage(response: Anthropic.Message): { inputTokens: number; outputTokens: number }` — defensivo: `typeof response.usage?.input_tokens === 'number'` → valor, si no → 0 (AC "respuesta sin bloque de uso → llamada con 0 tokens sin romper nada"). Import type-only de `@anthropic-ai/sdk`.
  - `export function recordInterviewUsage(interviewId: string, tokens: { inputTokens: number; outputTokens: number }): void` — construye el delta `{ calls: 1, ...tokens, estimatedCostUsd: computeCostUsd(...) }` y llama a `repository.addInterviewAiUsage` dentro de `try/catch` con `console.error('[aiCost] ...')` — **jamás lanza** (AC: el fallo de medición nunca rompe la generación).

## 2. Persistencia: store + repositorio + canales IPC + preload

- **src/main/db/store.ts**: `DbData` gana `aiCostSettings?: AiCostSettings` (import type-only). `emptyData()` NO lo incluye (ausente = sin límite). `isDbData` **no cambia** (verificado: lo tolera). Sin migración.
- **src/main/db/repository.ts**:
  - `getAiCostSettings(): AiCostSettings` — `read()`; **normalización defensiva** (AC "ajuste corrupto → sin límite sin crashear"): si `aiCostSettings` no es objeto, o `limitUsd` no es `null` ni un número finito `> 0` → devolver `{ limitUsd: null }`. Nunca lanza salvo store no inicializado.
  - `setAiCostSettings(settings: AiCostSettings): AiCostSettings` — si `limitUsd !== null` y (`!Number.isFinite` o `<= 0`) → `validationError('Introduce un importe positivo o deja el campo vacío')`; `mutate((draft) => { draft.aiCostSettings = { limitUsd }; return ... })` (atómico, patrón único del store).
  - `addInterviewAiUsage(id: string, delta: AiUsage): Interview` — UN `mutate()`: `findOrThrow` de la entrevista, `base = interview.aiUsage ?? { calls: 0, inputTokens: 0, outputTokens: 0, estimatedCostUsd: 0 }`, suma campo a campo y asigna. **No toca `updatedAt`** (la medición no es una edición del usuario; evita reordenar el listado de capturas — decisión documentada). NO se expone por IPC (solo lo usa main vía `recordInterviewUsage`).
- **src/main/db/ipc.ts**: `handleDb('db:ai-cost-settings:get', repository.getAiCostSettings)` y `handleDb('db:ai-cost-settings:set', repository.setAiCostSettings)` — heredan el envelope `DbResult`, nunca rechazan.
- **src/preload/index.ts**: `getAiCostSettings: () => ipcRenderer.invoke('db:ai-cost-settings:get')` y `setAiCostSettings: (settings) => ipcRenderer.invoke('db:ai-cost-settings:set', settings)` en el objeto `db`. El typecheck garantiza el contrato completo.

## 3. Medición en guión y nota (main)

Regla común: registrar **solo tras parseo/validación completos** y **antes** de persistir el resultado, para que la `Interview` devuelta al renderer ya incluya el `aiUsage` actualizado (la cabecera del detalle refresca vía `onInterviewUpdated` sin recargar). Un error de API o de formato no registra nada (AC "llamada que falla → acumulado no cambia"). **Prohibido tocar los parámetros de las llamadas** (`model`/`max_tokens`/structured outputs quedan byte a byte como están).

- **src/main/llmService.ts** (`doGenerate`, tras `parseGeneratedScript` y antes de `repository.updateInterview`): `recordInterviewUsage(interview.id, extractUsage(response))`. Import de `./aiCost`.
- **src/main/noteService.ts** (`doGenerate`, tras el parseo/validación de secciones y antes de `createNote/updateNote`): `recordInterviewUsage(interview.id, extractUsage(response))`.

## 4. Asistente: acumulador de sesión, límite, pausa/reanudar y volcado al parar (main)

- **src/renderer/src/types/assistant.ts**:
  - `AssistantState` gana `'paused'`.
  - `AssistantUpdateEvent` gana `usage?: AiUsage` (acumulado de la SESIÓN, viaja en cada evento tras el primer análisis) y `pauseLimitUsd?: number` (acompaña a `'paused'`). Import type-only de `./domain`.
  - `AssistantSessionSummary` gana `usage: AiUsage` (siempre presente; ceros si no hubo análisis) — al ser el objeto que `persistTranscript` serializa, el bloque `assistant` de transcript.json queda cubierto **gratis**.
  - `AssistantApi` gana `resume: () => Promise<void>`.
- **src/main/assistantService.ts**:
  - `AssistantSession` gana: `usage: AiUsage` (inicial a ceros), `persistedBaseUsd: number` (en `startAssistant`, dentro del try best-effort existente que lee la entrevista: `interview.aiUsage?.estimatedCostUsd ?? 0`), `pausedByLimit: boolean`, `limitOverridden: boolean`.
  - `requestSuggestion` devuelve el usage junto al outcome (extraído con `extractUsage(response)`); la acumulación ocurre en `runAnalysis` SOLO en el camino de éxito completo (tras `parseAnalysis`).
  - `runAnalysis`, en el camino de éxito: `usage.calls += 1; inputTokens += ...; outputTokens += ...; estimatedCostUsd = computeCostUsd(...)`. Añadir `usage: { ...target.usage }` a los `emitUpdate` (en `'active'` siempre; en `'analyzing'`/`'error'` cuando `calls > 0`, para que la línea no parpadee).
  - **Evaluación del límite** — en `maybeAnalyze`, **después** de los guards existentes (`inFlight`, `minLines`, `MIN_INTERVAL_MS` — los disparadores de SPEC-016 quedan intactos) y **justo antes** de lanzar el análisis: si `!limitOverridden` y `readLimitUsd() !== null` y `roundUpUsd(persistedBaseUsd + usage.estimatedCostUsd) >= limit` → primera vez: `pausedByLimit = true` + `emitUpdate('paused', usage, pauseLimitUsd: limit)`; siempre: `return` sin analizar. `readLimitUsd()` = helper local con `try/catch` (error/uninitialized → `null` = sin límite).
  - `export function resumeAssistantLimit(): void` — si `session === null` → no-op; `limitOverridden = true; pausedByLimit = false`; emitir `'active'` con la `suggestion` conservada (o `'idle'` si no hay) + `usage`; después `maybeAnalyze(session, 1)` respetando los guards existentes. El límite ya no vuelve a pausar en esa sesión (AC).
  - `stopAssistant()` devuelve `{ suggestionCount, feedback, usage: { ...target.usage } }`.
- **src/main/ipc.ts**:
  - `ipcMain.handle('assistant:resume', () => { resumeAssistantLimit() })` junto a `assistant:feedback`.
  - En `recording:stop`, **dentro** del bloque `if (activeInterviewId !== null)` y **antes** de `updateInterview(...)`: si `assistantSummary !== null && assistantSummary.usage.calls > 0` → `recordInterviewUsage(activeInterviewId, assistantSummary.usage)` (best-effort, nunca lanza). La `Interview` que devuelve `updateInterview` ya incluye el `aiUsage` con el gasto del asistente → la cabecera del detalle se actualiza sin recargar. El camino de error de `stopRecording` descarta el uso — coherente con que ya descarta transcript y consent.
- **src/main/transcriptionService.ts**: **cero cambios** (verificado).
- **src/preload/index.ts**: `assistant.resume: () => ipcRenderer.invoke('assistant:resume')`.

## 5. Renderer en vivo: hook + AssistantPanel + RecordingSection

- **src/renderer/src/hooks/useAssistant.ts**:
  - Estado nuevo: `usage: AiUsage | null` (se actualiza con cada evento que traiga `usage`) y `pauseLimitUsd: number | null` (se fija con `'paused'`, se limpia con `'active'`/`'idle'`). El estado `'paused'` NO borra la sugerencia guardada.
  - `resume: () => void` → `void window.api.assistant.resume()`.
  - `reset()` limpia también `usage` y `pauseLimitUsd`.
- **src/renderer/src/components/recording/AssistantPanel.tsx** — props nuevas `usage: AiUsage | null`, `pauseLimitUsd: number | null`, `onResume: () => void`:
  - Si `state === 'paused'`: en lugar del bloque de sugerencia, `<Alert data-testid="assistant-paused-alert">` (variant default, icono `PauseCircle` de lucide) con el copy exacto: `Límite de coste alcanzado ($X.XX). El asistente está en pausa; la grabación y la transcripción continúan.` y dentro `<Button variant="outline" size="sm" onClick={onResume}>Reanudar asistente</Button>`.
  - Pie del panel: `usage !== null && usage.calls >= 1` → `<p data-testid="assistant-usage-line" class="text-xs text-muted-foreground">IA: {calls} llamadas · {formatUsd(estimatedCostUsd)}</p>` (visible también en pausa y en error).
- **src/renderer/src/components/recording/RecordingSection.tsx**: destructurar `usage`, `pauseLimitUsd`, `resume` del hook y pasarlos al panel. Nada más cambia — grabación, transcripción y guión no se tocan (AC de aislamiento).

## 6. Coste en la cabecera del detalle (compartido por ambas páginas)

- **src/renderer/src/lib/aiCostFormat.ts (nuevo)**: `formatUsd(v): string` → `` `~$${v.toFixed(2)}` `` y `formatTokenCount(n): string` → `≥1000 ? '12.3k' : '840'`.
- **src/renderer/src/components/interviews/AiCostInline.tsx (nuevo, compartido)** — prop `aiUsage: AiUsage | null | undefined`:
  - Presente con `calls > 0` → `<Tooltip>` con trigger `<span data-testid="interview-ai-cost">IA {formatUsd(estimatedCostUsd)}</span>` y contenido `{calls} llamadas · {in} tokens entrada · {out} tokens salida`.
  - Ausente/null o a cero → texto muted `Sin datos de coste` **sin importe alguno** (resolución del conflicto AC/wireframe — ver Riesgo 1: mandan los ACs).
- **src/renderer/src/pages/InterviewDetailPage.tsx**: en la fila muted de referencias, segmento final `· <AiCostInline aiUsage={state.interview.aiUsage} />`.
- **src/renderer/src/pages/CaptureDetailPage.tsx**: ídem (SPEC-020 comparte cabecera).
- Ambas páginas ya refrescan `interview` vía `handleInterviewUpdated` → el segmento se actualiza sin recargar (gracias al orden de las fases 3 y 4).

## 7. Card "Coste de IA" en Ajustes

- **src/renderer/src/components/settings/AiCostCard.tsx (nuevo)**: `Card` (`data-testid="ai-cost-settings-card"`) con título "Coste de IA" y descripción muted "Límite de gasto estimado por entrevista para el asistente en vivo. El guión y la nota no se bloquean.".
  - Al montar: `getAiCostSettings()` → precarga el input (o vacío); mientras carga, input disabled.
  - Cuerpo: label "Límite por entrevista (USD)" + `<Input data-testid="ai-cost-limit-input" inputMode="decimal" placeholder="Sin límite">` en fila con `<Button type="submit">Guardar</Button>` (form real, patrón ApiKeyRow); en mobile apila en columna.
  - Validación on submit (antes del bridge): `trim() === ''` → `limitUsd: null`; normalizar coma decimal (`replace(',', '.')`); `!Number.isFinite || <= 0` → error inline exacto "Introduce un importe positivo o deja el campo vacío" sin llamar al bridge.
  - Éxito → `toast('Ajustes guardados')`; `{ ok: false }` → toast destructive con `error.message`.
  - Texto muted permanente: "Coste estimado según la tarifa del modelo configurado en la app; orientativo, no factura real.".
- **src/renderer/src/pages/SettingsPage.tsx**: montar `<AiCostCard />` en la pestaña de API keys, debajo de la sección de claves (mismo patrón visual de referencia; evita una pestaña nueva no contemplada).

## AC → fase

18 ACs: medición por llamada 5 → fases 1-4; visualización 3 → fases 5-6; límite y control 7 → fases 2, 4, 5, 7 (manual no bloqueado sale gratis en fase 3: guión/nota no consultan el límite); errores/edge 3 → fases 1-2.

## Breakage presupuestado (QA lo repone; el implementador NO escribe tests)

- `tsc -p tsconfig.test.json`: `tests/helpers/mockApi.ts` sin `getAiCostSettings`/`setAiCostSettings` (DbApi) ni `assistant.resume` (AssistantApi); fixtures que construyan `AssistantSessionSummary` sin `usage` (tests/unit/consent/transcriptionService.consent.test.ts y afines); renders directos de `AssistantPanel` sin las 3 props nuevas (tests/unit/recording y assistant).
- Runtime: `tests/unit/assistant/assistantService.test.ts` — aserciones de igualdad exacta sobre el summary de `stopAssistant` (ahora incluye `usage`) y sobre los eventos (ganan `usage`); el gate de límite lee settings con try/catch → en tests sin store se comporta como sin límite. `tests/unit/settings/*` que rendericen `SettingsPage` fallarán si el mock no resuelve `getAiCostSettings`. Documentar en el commit para `/somo-qa-dev`.

## Orden, validación y riesgos

**Orden**: fase 1 → 2 → 3 → 4 → 5 → 6 → 7. `npm run typecheck` + `npm run lint` por bloque; smoke manual final (humano): generar guión (aiUsage en db.json y segmento en cabecera), grabar con límite bajo (0.01) → pausa + Reanudar + volcado al parar, entrevista legada → "Sin datos de coste", ajuste corrupto → arranca sin límite.

**Riesgos**:
1. **Conflicto AC↔wireframe en "Sin datos de coste"**: el AC exige mostrar "Sin datos de coste" en entrevistas legadas; el wireframe dice "el segmento no se renderiza". Decisión: **mandan los ACs** — sin `aiUsage` o a cero se muestra el texto muted "Sin datos de coste" (no es un importe, así que el AC de "no mostrar ~$0.00" también se cumple). Señalado para el revisor.
2. **No tocar SPEC-016**: el gate de límite va DESPUÉS de los guards existentes de `maybeAnalyze`; no altera `MIN_NEW_FINAL_LINES`/`MIN_INTERVAL_MS`/`FALLBACK_INTERVAL_MS` ni resetea contadores.
3. **Regla del modelo**: cero cambios en los objetos de `client.messages.create`; solo se LEE `response.usage` después.
4. **Orden en `recording:stop`**: volcar el uso ANTES de `updateInterview`; ambos best-effort (fallo del volcado se loguea, no afecta a wavPath/transcriptPath). El catch de `stopRecording` descarta el uso de la sesión — coherente con transcript/consent.
5. **`readLimitUsd` con try/catch obligatorio**: sin él, un store no inicializado rompería el asistente, violando su invariante de degradabilidad.
6. **Pérdida de uso del asistente ante crash a media grabación**: aceptada por diseño (acumulación en memoria; evita una escritura de db.json por análisis).
7. **Tarifas hardcodeadas** ($5/$25 por MTok): si cambian, se actualiza `aiCost.ts` en una release (decisión de la spec).
8. **Input decimal es-ES**: normalizar coma→punto antes de parsear; sin ello "0,50" sería inválido con teclado español.
