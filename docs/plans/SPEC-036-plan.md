# Plan de implementación — SPEC-036: Cola persistente de preguntas del asistente

> Generado por el subagente Plan (2026-07-12) y revisado por la orquestadora del loop.
> Spec: `specs/SPEC-036-cola-preguntas-asistente.md`.

## 1. Pasos ordenados por fichero

### Paso 1 — `src/renderer/src/types/assistant.ts` (contrato compartido; primero para que el typecheck guíe el resto)

- Añadir `AssistantQueueItem` y `AssistantQueue` (ver §2).
- `AssistantUpdateEvent`: eliminar `suggestion?: AssistantSuggestion` y añadir `queue: AssistantQueue` **obligatorio** (todo evento transporta la cola completa; main es la fuente de verdad). Conservar `state/objectivesMet/error?/usage?/pauseLimitUsd?`.
- Eliminar `AssistantVote`.
- `AssistantSessionSummary`: queda `{ suggestionCount: number; usage: AiUsage }` (desaparece `feedback`). Actualizar el doc-comment (derogación SPEC-016).
- `AssistantApi`: eliminar `sendFeedback`; añadir `setPinned: (itemId: string, pinned: boolean) => Promise<void>`. Mantener `onUpdate` y `resume`.
- `AssistantSuggestion` se conserva como forma de la candidata parseada (la usa `parseAnalysis`); el ítem de cola la extiende con `id`.

### Paso 2 — `src/renderer/src/types/domain.ts`

- Añadir `export interface AssistantSettings { queueSize: number }` (entero 1–5; default 3) junto a `AiCostSettings`.
- `DbApi`: añadir `getAssistantSettings: () => Promise<DbResult<AssistantSettings>>` y `setAssistantSettings: (settings: AssistantSettings) => Promise<DbResult<AssistantSettings>>` (espejo exacto de las de aiCost).

### Paso 3 — `src/main/db/store.ts`

- `DbData`: añadir `assistantSettings?: AssistantSettings` (singleton opcional, sin bump de `schemaVersion`, mismo comentario-patrón que `aiCostSettings`). `isDbData` solo valida colecciones → tolera el campo sin cambios.

### Paso 4 — `src/main/db/repository.ts`

Bajo la sección de coste de IA (~línea 740), replicar el patrón singleton:

- `getAssistantSettings(): AssistantSettings` — `read()` con normalización defensiva: si `store.assistantSettings` no es objeto o `queueSize` no es entero en [1,5] → `{ queueSize: 3 }`.
- `setAssistantSettings(settings: AssistantSettings): AssistantSettings` — valida entero 1–5 (`validationError` si no) y `mutate((draft) => { draft.assistantSettings = { queueSize } })`.

### Paso 5 — `src/main/db/ipc.ts`

- `handleDb('db:assistant-settings:get', repository.getAssistantSettings)` y `handleDb('db:assistant-settings:set', repository.setAssistantSettings)`.

### Paso 6 — `src/preload/index.ts`

- Bridge `db`: añadir `getAssistantSettings` / `setAssistantSettings` → `ipcRenderer.invoke('db:assistant-settings:get' / ':set', settings)`.
- Bridge `assistant`: eliminar `sendFeedback`; añadir `setPinned: (itemId, pinned) => ipcRenderer.invoke('assistant:set-pinned', itemId, pinned)`. Actualizar el doc-comment.

### Paso 7 — `src/main/assistantService.ts` (corazón del cambio)

**Estado de sesión (`AssistantSession`):**
- Eliminar `suggestion`, `currentVote`, `feedback`.
- Añadir `pending: AssistantQueueItem[]` (más reciente primero), `pinned: AssistantQueueItem[]` (orden de anclado) y `maxPending: number`.
- En `startAssistant`: `maxPending` se lee **UNA vez** con `try { repository.getAssistantSettings().queueSize } catch { 3 }` (patrón `readLimitUsd`). `pending`/`pinned` nacen vacíos. Los eventos `no-key` e `idle` inicial ganan `queue: { pending: [], pinned: [] }` (campo ahora obligatorio).

**Helpers nuevos:**
- `buildQueuePayload(target): AssistantQueue` — copia superficial de ambos arrays.
- `normalizeQuestion(text: string): string` — minúsculas + puntuación fuera + espacios colapsados (`toLowerCase()`, reemplazar `[^\p{L}\p{N}]+`u por espacio, `trim()`). **Exportarla** para QA.
- `isSimilarToQueue(target, question): boolean` — igualdad de normalizados contra TODA la cola (`pending` + `pinned`). Esta comprobación determinista es la que garantiza los ACs.
- `setAssistantPinned(itemId: string, pinned: boolean): void` (export nuevo) — sin sesión o id inexistente → no-op silencioso. Anclar: mover de `pending` a `pinned` (append). Desanclar: mover de `pinned` al **frente** de `pending` (coherente con «más reciente primero»; puede exceder `maxPending` temporalmente — decisión asumida de la spec). Tras mutar, re-emitir `assistant:update` con la cola completa y estado derivado: `target.inFlight ? 'analyzing' : (cola no vacía ? 'active' : 'idle')`. Sin estado optimista en renderer.

**`OUTPUT_SCHEMA`:** añadir `resolvedQueueIndexes: { type: 'array', items: { type: 'integer' } }` y añadirlo a `required`. No tocar `maxLength` ni el resto.

**`buildSystemPrompt`** (texto estático — cambia entre releases, no dentro de la sesión; la byte-estabilidad en sesión se conserva):
- Sustituir la regla «No repitas la sugerencia anterior» por reglas de cola: «En cada mensaje recibirás la lista numerada de preguntas ya en cola; NO propongas una pregunta igual o casi igual a ninguna de ellas» (primera barrera de similitud) y «`resolvedQueueIndexes`: índices (0-based) de las preguntas en cola cuyo tema YA quedó cubierto por la conversación; array vacío si ninguna».

**`buildUserPrompt`:**
- Sustituir la sección «## Tu sugerencia anterior» por «## Preguntas en cola (índices 0-based)»: lista numerada con `pending` primero (índices `0..p-1`) y luego `pinned` marcadas `(anclada)`; «ninguna» si vacía. La cola viaja SOLO aquí, nunca en `systemBlocks`.
- `runAnalysis` captura un **snapshot** de la cola al construir el prompt (`[...pending, ...pinned]`): los índices de la respuesta se resuelven contra ese snapshot, no contra la cola viva.

**`parseAnalysis(raw, objectiveCount, queueCount)`:**
- Parseo defensivo de `resolvedQueueIndexes` idéntico al de `objectivesMet`: no-array → `[]`; filtrar no-enteros y fuera de `[0, queueCount)`. El outcome pasa a `{ suggestion, objectivesMet, resolvedQueueIndexes }`.

**`runAnalysis` (camino de éxito), en este orden:**
1. Resolución automática: para cada índice válido del snapshot, si apunta al tramo pendiente del snapshot (`idx < pendingSnapshotCount`) → localizar por `id` en `target.pending` y eliminar (si entre medias fue anclado, se ignora: las ancladas nunca se auto-resuelven). Índices del tramo anclado → ignorar.
2. Aceptación de la candidata: descartar si `isSimilarToQueue` (segunda barrera) o si `target.pending.length >= target.maxPending` (con `>=` cubre también el exceso temporal por desanclado). Si se acepta: `unshift` a `pending` con `id: randomUUID()` y **solo entonces** `suggestionCount += 1` (cuenta candidatas aceptadas).
3. Eliminar las líneas de `currentVote = null`.
4. Emitir `{ state: 'active', queue: buildQueuePayload(target), objectivesMet, usage }`.

**Resto de eventos:** `analyzing`, `error` y `paused` ganan `queue: buildQueuePayload(target)` (la cola viaja siempre; ya no hay `suggestion` condicional en `error`). `resumeAssistantLimit`: estado `pending.length + pinned.length > 0 ? 'active' : 'idle'` + cola.

**Retirada de feedback:** borrar `sendAssistantFeedback` completo y los imports de `AssistantVote`. `stopAssistant` devuelve `{ suggestionCount, usage }`.

**No tocar:** `maybeAnalyze` (disparadores + gate SPEC-021), `MIN_*`, `MAX_TOKENS`, `buildSystemBlocks`, `cache_control`, `requestSuggestion` salvo el paso de `queueCount` a `parseAnalysis`, `thinking`/`output_config`, modelo.

### Paso 8 — `src/main/ipc.ts`

- Eliminar el handler `assistant:feedback`, el import de `sendAssistantFeedback` y el `import type { AssistantVote }`.
- Añadir junto a `assistant:resume`: `ipcMain.handle('assistant:set-pinned', (_event, itemId, pinned) => { setAssistantPinned(itemId, pinned) })` — fire-and-forget que nunca falla (no-ops en el servicio), mismo patrón que resume.
- El flujo de `recording:stop` no cambia (usa `assistantSummary.usage`, que se conserva).

### Paso 9 — `src/main/transcriptionService.ts`

- Sin cambios de código en `persistTranscript` (escribe el summary tal cual); solo se encoge el tipo importado. Ajustar el doc-comment para reflejar que el registro ya no incluye feedback.

### Paso 10 — `src/renderer/src/hooks/useAssistant.ts`

- Estado: sustituir `suggestion`/`vote` por `queue: AssistantQueue` (inicial `{ pending: [], pinned: [] }`). En `onUpdate`: `setQueue(event.queue)` en **todos** los eventos (main manda siempre la cola completa → la conservación en `analyzing`/`error`/`paused` es estructural). Mantener intacta la lógica de `error`, `usage`, `pauseLimitUsd` y la limpieza de error en `analyzing`.
- Eliminar `sendFeedback`/`vote`; añadir `setPinned = useCallback((itemId, pinned) => { void window.api.assistant.setPinned(itemId, pinned) })` — sin estado optimista (main re-emite).
- `reset()` limpia la cola.

### Paso 11 — `src/renderer/src/hooks/useRecordingController.ts`

- `RecordingControllerAssistant`: sustituir `suggestion`/`vote`/`sendFeedback` por `queue: AssistantQueue` y `setPinned: (itemId: string, pinned: boolean) => void`. Propagar en la destructuración y en el objeto devuelto.

### Paso 12 — `src/renderer/src/components/recording/AssistantPanel.tsx`

Reescritura según wireframe de la spec:
- Props: `state`, `queue`, `error`, `usage`, `pauseLimitUsd`, `onSetPinned`, `onResume` (fuera `suggestion`/`vote`/`onVote`).
- Rama no pausada: fila superior solo con el indicador «Analizando…» (derecha, sin desplazar la lista). Debajo, lista de pendientes `data-testid="assistant-queue"` con ítems `assistant-queue-item` (`border rounded-md p-2`): fila 1 = Badge acción (Profundiza ámbar / Continúa verde) + chips de alarma (reutilizar `ALARM_LABELS`) + a la derecha Button `ghost` `icon-sm` con icono `Pin`, `aria-label="Anclar pregunta"` y Tooltip; fila 2 = pregunta (`text-base font-medium`); fila 3 = porqué (`text-sm text-muted-foreground`).
- Sección «Ancladas» (`assistant-pinned-section`) solo si `queue.pinned.length > 0`: heading xs muted «Ancladas», ítems `assistant-pinned-item` **sin porqué**, botón `PinOff` con `aria-label="Desanclar pregunta"` + Tooltip.
- Estado vacío (`pending` y `pinned` vacíos): mensaje existente «El asistente te sugerirá…». Coexiste con «Analizando…».
- Rama `paused`: el Alert sustituye a toda la lista (sin cambios, `assistant-paused-alert`); `no-key`, línea de error y `assistant-usage-line`: sin cambios.
- Los badges de fila 1 con `flex-wrap` (responsive); el botón de anclar nunca se oculta.
- Usar el patrón `Tooltip`/`TooltipTrigger`/`TooltipContent` de `components/ui/tooltip.tsx` tal como se use ya en el proyecto (comprobar si exige `TooltipProvider` local).

### Paso 13 — `src/renderer/src/components/recording/RecordingSection.tsx`

- Actualizar las props pasadas al panel: `queue={assistant.queue}`, `onSetPinned={assistant.setPinned}`; eliminar `suggestion`/`vote`/`onVote`.

### Paso 14 — `src/renderer/src/components/settings/AssistantSettingsCard.tsx` (nuevo)

- Card «Asistente en vivo» con `CardTitle`/`CardDescription` («Número máximo de preguntas pendientes visibles a la vez durante la entrevista.»), `Label` «Tamaño de la cola de preguntas» + `Select` con opciones 1–5, trigger con `data-testid="assistant-queue-size-select"`.
- Patrón AiCostCard adaptado a guardado inmediato: precarga con `window.api.db.getAssistantSettings()` (disabled mientras carga); `onValueChange` → `setAssistantSettings({ queueSize })` → `toast('Ajustes guardados')` / `toast.error(result.error.message)`. Sin botón Guardar (el Select ES el commit). Guard de escritura en curso (disabled) opcional, patrón SPEC-024.

### Paso 15 — `src/renderer/src/pages/SettingsPage.tsx`

- Importar y renderizar `<AssistantSettingsCard />` inmediatamente debajo de `<AiCostCard />` en la pestaña «Claves de IA».

### Paso 16 — Verificación del implementador

- `npm run typecheck` + `npm run lint` + prettier. Los tests NO son parte de la entrega (los adapta/genera QA Dev; `tests/helpers/mockApi.ts` romperá el typecheck de la suite hasta que QA lo actualice — esperado).

## 2. Contrato de tipos/eventos

```ts
// types/assistant.ts
export interface AssistantQueueItem extends AssistantSuggestion {
  /** uuid generado en main al aceptar la candidata; clave de pin/unpin y de React. */
  id: string
}
export interface AssistantQueue {
  pending: AssistantQueueItem[]   // más reciente primero
  pinned: AssistantQueueItem[]    // orden de anclado
}
export interface AssistantUpdateEvent {
  state: AssistantState
  queue: AssistantQueue           // SIEMPRE presente (sustituye a suggestion?)
  objectivesMet: number[]
  error?: LlmError
  usage?: AiUsage
  pauseLimitUsd?: number
}
export interface AssistantSessionSummary { suggestionCount: number; usage: AiUsage }
export interface AssistantApi {
  onUpdate: (cb: (event: AssistantUpdateEvent) => void) => () => void
  setPinned: (itemId: string, pinned: boolean) => Promise<void>
  resume: () => Promise<void>
}

// types/domain.ts
export interface AssistantSettings { queueSize: number } // entero 1–5, default 3
```

**Canales IPC:** `assistant:set-pinned (itemId, pinned)` fire-and-forget; `db:assistant-settings:get|set` con envelope `DbResult`.

**Mensaje de usuario:** sección nueva antes de «## Tarea», en lugar de «## Tu sugerencia anterior»:

```
## Preguntas en cola (índices 0-based)
0. ¿Cuándo fue la última vez que pasó?
1. ¿Quién más participó en esa decisión?
2. (anclada) ¿Cuánto pagasteis por la solución actual?
```

(`ninguna` si vacía). Pendientes primero (índices `0..p-1`), ancladas después.

## 3. Riesgos / gotchas

1. **Pin/unpin durante una llamada en vuelo:** los índices de `resolvedQueueIndexes` refieren a la cola tal como viajó en el prompt; si el usuario ancla/desancla en vuelo, los índices vivos se desplazan. Por eso la resolución va contra un **snapshot de ids** capturado al construir el prompt, y la eliminación es por `id` sobre `target.pending` actual (anclado entre medias → se ignora; ya eliminado → no-op).
2. **Eventos con cola completa:** el hook ya no «conserva» nada por su cuenta; como `queue` es obligatorio en todo evento y main lo envía siempre, la conservación en error/analyzing/paused es estructural. Riesgo simétrico: **todo** punto de emisión en main debe rellenar `queue` (incluidos `no-key` y el `idle` inicial) — el typecheck lo fuerza.
3. **Re-emisión tras pin con análisis en vuelo:** derivar el estado (`inFlight → 'analyzing'`) para no retirar el spinner. Caso menor asumido: anclar justo después de un `error` re-emite `active` y retira la línea de error (equivalente al comportamiento actual de `analyzing`, aceptable).
4. **Compatibilidad del transcript.json:** ningún lector consume el campo `assistant` (los lectores tipados son `recording:get-transcript-stats` → `latency`, y `readTranscriptLines` en `noteService.ts` → `lines`). Archivos antiguos con `assistant.feedback` siguen legibles (campo extra ignorado). Sin migración.
5. **Byte-estabilidad SPEC-023:** el texto de `buildSystemPrompt` cambia entre releases, no dentro de la sesión — la invariante se conserva. Nada del texto nuevo puede depender del estado de la cola (la cola solo en `buildUserPrompt`).
6. **`>=` en el gate de capacidad** (no `===`): con desanclado por encima del máximo, bloquea candidatas hasta volver por debajo — exactamente la decisión asumida.
7. **`suggestionCount` cambia de semántica** (aceptadas, no respuestas del LLM): no confundir con `usage.calls`, que sigue contando llamadas para la línea «IA: N llamadas».
8. **Select de Ajustes:** el `Select` de shadcn trabaja con `string`; convertir a `number` antes de `setAssistantSettings`. El default 3 debe verse aunque el store esté vacío (la normalización del repo lo garantiza).
9. **`tests/helpers/mockApi.ts`** tipa `AssistantApi` con `sendFeedback`: romperá el typecheck de la suite hasta que QA lo actualice — esperado, queda para QA Dev.

## 4. Tests existentes previsiblemente afectados (nota para QA Dev — fuera del alcance del implementador)

- `tests/unit/assistant/assistantService.test.ts` (SPEC-016/020/035): feedback, forma de eventos con `suggestion`, summary de `stopAssistant`.
- `tests/unit/assistant/AssistantPanel.test.tsx` (SPEC-016/023/025): botones 👍/👎, render de sugerencia única.
- `tests/unit/ai-cost/assistantService.aiCost.test.ts` y `tests/unit/ai-cost/AssistantPanel.aiCost.test.tsx` (SPEC-021): eventos `paused`/`resume` ahora llevan `queue`; props del panel.
- `tests/unit/latency/assistantService.latency.test.ts` (SPEC-023): asserts sobre `OUTPUT_SCHEMA`/`required`, forma del mensaje de usuario y byte-estabilidad de `systemBlocks`.
- `tests/unit/degradation/assistantService.degraded.test.ts` (SPEC-022): fixtures de eventos/sugerencias.
- `tests/unit/custom-prompts/customPromptsResolution.test.ts` (SPEC-026/031): si asserta texto exacto del system prompt del asistente.
- `tests/helpers/mockApi.ts`: `assistant.sendFeedback` → `assistant.setPinned`; añadir `db.getAssistantSettings`/`setAssistantSettings`; fixtures de `AssistantUpdateEvent` ganan `queue`.
- `tests/unit/captures/CaptureDetailPage.liveTranscript.test.tsx` (SPEC-035): emite eventos del asistente vía mock.
- Posible impacto menor: tests de `tests/unit/settings/` (nueva card en la pestaña «Claves de IA») y de `tests/unit/recording/` que monten `RecordingSection` con el controller.

## 5. Qué NO tocar

- Disparadores del análisis (`MIN_NEW_FINAL_LINES=3`, `MIN_INTERVAL_MS=20s`, `FALLBACK_INTERVAL_MS=45s`), guard `inFlight`, gate de pausa SPEC-021 en `maybeAnalyze` y `resumeAssistantLimit` (salvo la forma del evento emitido).
- `MAX_TOKENS=512`, `maxLength` de `suggestedQuestion`/`reason` (SPEC-023), `thinking: adaptive`, `output_config effort/format`, y jamás `temperature`/`top_p`/`top_k`/`budget_tokens` con `claude-opus-4-8`.
- `buildSystemBlocks` (estructura, `cache_control` ephemeral en el último bloque, construcción única en `startAssistant`) y la salvaguarda de prompts SPEC-026/031 (`buildPersonaBlock`).
- Semántica de `usage`/`tokenTotals`/coste (SPEC-021/023), `recordInterviewUsage`, orden `stopAssistant → finishTranscription → stopRecording → persistTranscript` en `recording:stop`.
- `getAiCostSettings`/`setAiCostSettings` y su card; `objectivesMet` (acumulativo) y SPEC-025.
- Inercia sin clave / sin `interviewId` (nunca en `/capture`); patrón envelope IPC; `docs/prd.md`/`docs/checklist.md`.
- Ningún test (los hace QA Dev).
