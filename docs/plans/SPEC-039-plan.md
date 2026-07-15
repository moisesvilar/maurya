# Plan de implementación — SPEC-039 Acciones por pregunta (anclar/desanclar/descartar/respondida)

> Plan autorado por el orquestador. Spec: `specs/SPEC-039-acciones-preguntas-asistente.md`.
> Multi-fichero (main + preload + tipos + renderer). Sin dependencias nuevas, sin bump de schema.

## 1. Tipos

### `src/renderer/src/types/assistant.ts`
- `export type AssistantQuestionOutcome = 'discarded' | 'answered'`
- `export interface AssistantQuestionRecord { question: string; outcome: AssistantQuestionOutcome }`
- `AssistantSessionSummary` gana `questionOutcomes: AssistantQuestionRecord[]`.
- `AssistantApi` gana `resolveItem(itemId: string, outcome: AssistantQuestionOutcome): Promise<void>`.

### `src/renderer/src/types/domain.ts`
- `export interface InterviewQuestionOutcome { question: string; outcome: 'discarded' | 'answered'; reason?: string | null }`
- `Interview.questionOutcomes?: InterviewQuestionOutcome[] | null` (patrón aiUsage: opcional,
  sin bump de schemaVersion, comentario «solo lo escribe main»).
- `DbApi` gana `setInterviewDiscardReasons(interviewId: string, reasons: Array<{ index: number; reason: string }>): Promise<DbResult<Interview>>`.
- NO tocar `UpdateInterviewPatch` (el renderer no escribe questionOutcomes directamente).

## 2. Main — assistantService.ts

- `AssistantSession` gana `discarded: AssistantQueueItem[]` y `answered: AssistantQueueItem[]`
  (estado de sesión, nace vacío en startAssistant).
- `export function resolveAssistantItem(itemId: string, outcome: AssistantQuestionOutcome): void`
  (patrón setAssistantPinned: sin sesión o id inexistente → no-op):
  1. Busca el ítem en `pending` O en `pinned`; lo elimina de donde esté y lo apila en
     `discarded`/`answered` según outcome.
  2. Emite `assistant:update` con el patrón de estado derivado (analyzing si inFlight; si no
     active/idle; usage solo con calls>0).
  3. Si outcome === 'answered' y `!inFlight`: replica el gate de límite de SPEC-021 (mismo bloque
     que maybeAnalyze, incluido el emit de 'paused' si aplica) y si pasa → `void runAnalysis(target)`
     directo (sin exigir material nuevo ni intervalo). Los contadores newLinesSinceLastCall no se
     tocan.
- `isSimilarToQueue` compara contra `[...pending, ...pinned, ...discarded, ...answered]`
  (renombrar mentalmente «cola» → «cola + histórico manual»; mantener nombre exportado si lo hay).
- `buildUserPrompt`: sección condicional nueva tras «## Preguntas en cola»:
  `## Preguntas ya descartadas o respondidas por el entrevistador (NO las repitas ni propongas variantes)`
  con la lista `- <pregunta>` (solo si hay ≥1). systemBlocks intactos.
- `stopAssistant()` devuelve además `questionOutcomes`: descartadas primero y respondidas después,
  cada una `{ question: item.suggestedQuestion, outcome }`.
- La resolución en vivo por mic (SPEC-038) y la resolución por análisis NO registran outcomes
  (solo las acciones manuales).

## 3. Main — repository.ts

- `export function setInterviewQuestionOutcomes(id: string, outcomes: InterviewQuestionOutcome[]): Interview`
  (patrón setInterviewObjectiveResults; main-only, sin validación de contenido más allá de
  findOrThrow).
- `export function setInterviewDiscardReasons(id: string, reasons: Array<{ index: number; reason: string }>): Interview`:
  índice contra el array `questionOutcomes` completo; solo aplica si la entrada existe y es
  `outcome === 'discarded'`; motivo trim; entradas inválidas se ignoran en silencio; una sola
  mutación atómica.

## 4. Main — ipc.ts

- `assistant:resolve-item` → `ipcMain.on`/handle fire-and-forget → `resolveAssistantItem(itemId, outcome)`
  (mismo registro que assistant:set-pinned).
- `db:set-discard-reasons` → `handleDb('db:set-discard-reasons', (interviewId, reasons) => setInterviewDiscardReasons(...))`
  en `src/main/db/ipc.ts` (familia DbResult).
- En `recording:stop`: si `assistantSummary !== null && assistantSummary.questionOutcomes.length > 0`
  y hay `activeInterviewId`, llamar `setInterviewQuestionOutcomes(activeInterviewId, outcomes)`
  ANTES de `updateInterview` (best-effort try/catch como recordInterviewUsage) para que la
  Interview devuelta en StopResult ya los lleve.
- `persistTranscript` no cambia de firma: el summary ya lleva questionOutcomes dentro.

## 5. Preload — preload/index.ts

- `assistant.resolveItem(itemId, outcome)` → invoke/send del canal nuevo.
- `db.setInterviewDiscardReasons(interviewId, reasons)` → canal db.

## 6. Renderer

### `hooks/useAssistant.ts`
- `resolveItem(itemId, outcome)` delega en window.api.assistant.resolveItem (patrón setPinned).

### `components/recording/AssistantPanel.tsx`
- Props: `onResolveItem(itemId: string, outcome: AssistantQuestionOutcome)`.
- Grupo de tres botones por ítem según wireframe de la spec (Check/X/Pin en pendientes,
  Check/X/PinOff en ancladas), testids `assistant-item-answered` / `assistant-item-discard`,
  aria-labels y Tooltips literales de la spec.

### Dialog de motivos — `components/recording/DiscardReasonsDialog.tsx` (nuevo)
- Props: `open`, `outcomes` (descartadas: pregunta + índice real en questionOutcomes),
  `onSave(reasons)`, `onSkip()`. Estructura y testids según la spec.
- Integración: donde el resultado de la parada llega al renderer —
  `useRecordingController.stop()` devuelve `StopResult | null` con `interview` incluida.
  En `RecordingSectionView`/las superficies que consumen el controller, tras un stop con
  `interview?.questionOutcomes` conteniendo ≥1 'discarded', abrir el Dialog UNA vez.
  «Guardar motivos» → `window.api.db.setInterviewDiscardReasons` → Toast «Motivos guardados» y
  propagar la Interview actualizada (callback onInterviewUpdated existente si aplica).
  «Omitir»/Escape → cerrar sin llamada.

## 7. Main — noteService.ts y objectiveEvaluationService.ts

- `noteService.buildUserPrompt`: tras `## Conversación`, secciones condicionales:
  - `## Preguntas descartadas por el entrevistador (con su motivo)` — líneas
    `- <pregunta> — Motivo: <reason | 'sin motivo indicado'>` (solo outcome 'discarded').
  - `## Preguntas ya respondidas marcadas por el entrevistador` — líneas `- <pregunta>`.
  Ambas ausentes si no hay questionOutcomes (prompt byte-igual al actual).
- `objectiveEvaluationService.buildUserPrompt`: sección condicional
  `## Preguntas descartadas por el entrevistador (con su motivo)` (solo descartadas).
  Firma: pasar la interview o el array; mantener el resto intacto.

## Invariantes a preservar

- systemBlocks byte-estables (nada nuevo en el prefijo cacheado).
- suggestionCount = candidatas aceptadas; outcomes manuales no lo tocan.
- Pin/unpin SPEC-036, resolución mic SPEC-038 y similitud SPEC-037 intactos (la similitud SOLO
  amplía su ámbito).
- Typecheck+lint verdes; tests/helpers/mockApi.ts NO se toca (lo extiende QA Dev si hace falta).
