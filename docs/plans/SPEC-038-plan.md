# Plan de implementación — SPEC-038 Detección en vivo de preguntas respondidas

> Plan autorado por el orquestador (cambio quirúrgico en un solo fichero, precedente SPEC-030/035/037).
> Spec: `specs/SPEC-038-resolucion-preguntas-vivo.md`. Sin UI, sin IPC, sin schema, sin dependencias nuevas.

## Fichero afectado

`src/main/assistantService.ts` (único fichero de producción).

## Cambios

### 1. Resolución determinista por formulación en `handleFinalLine`

Nueva función privada `resolveAskedQuestions(target, line)` llamada desde `handleFinalLine`
DESPUÉS de apilar la línea y ANTES de `maybeAnalyze` (los contadores no cambian):

- Solo actúa con `line.channel === 'mic'` y línea final (handleFinalLine ya recibe solo finales).
- Recorre `target.pending` y elimina por id cada pregunta con
  `areQuestionsSimilar(line.text, item.suggestedQuestion)` (SPEC-037, mismo umbral). Puede
  eliminar varias de una vez. `target.pinned` NUNCA se toca.
- Si eliminó al menos una: emitir `assistant:update` con el patrón de estado derivado de
  `setAssistantPinned` (analyzing si `inFlight`, si no active/idle según contenido total;
  `usage` solo con `calls > 0`).
- `suggestionCount` no se toca.

### 2. Prompt de sistema (`buildSystemPrompt`)

Reescribir la regla de `resolvedQueueIndexes` (texto estático):

- Revisar UNA A UNA las preguntas en cola en cada análisis y marcar en `resolvedQueueIndexes`
  las que el interlocutor ya haya respondido, aunque la formulación difiera o la respuesta haya
  llegado sin que nadie hiciera la pregunta.

### 3. Sección `## Tarea` (`buildUserPrompt`)

Texto nuevo: primero revisar la cola y marcar las preguntas ya respondidas; después decidir la
siguiente jugada del entrevistador. (Parte variable: sin restricción de byte-estabilidad.)

## Invariantes a preservar (regresión)

- `systemBlocks` construido una vez por sesión, byte-estable (SPEC-023).
- Disparadores 3 líneas/20 s/45 s intactos; la resolución no provoca llamadas extra.
- Resolución por análisis (`resolvedQueueIndexes` sobre snapshot, ancladas ignoradas) intacta.
- Typecheck + lint en verde; sin cambios en tipos del renderer ni preload.
