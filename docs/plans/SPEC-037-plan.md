# Plan de implementación — SPEC-037 Supresión robusta de preguntas casi idénticas

> Plan autorado por el orquestador (cambio quirúrgico en un solo fichero, precedente SPEC-030/035).
> Spec: `specs/SPEC-037-similitud-preguntas.md`. Sin UI, sin IPC, sin schema, sin dependencias nuevas.

## Fichero afectado

`src/main/assistantService.ts` (único fichero de producción).

## Cambios

### 1. Nuevas utilidades deterministas de similitud (exportadas para QA)

Junto a `normalizeQuestion` (que se mantiene con su firma actual):

- Extender `normalizeQuestion` para eliminar diacríticos: `NFD` + strip de marcas combinantes
  (`̀-ͯ`), ANTES del replace de no-alfanuméricos. Precedente: `src/main/db/search.ts`.
  Efecto: la igualdad exacta de SPEC-036 pasa a ser insensible a diacríticos (más conservadora,
  cubierta por Decisiones asumidas de la spec).
- `const SIMILARITY_THRESHOLD = 0.7` y `const QUESTION_STOPWORDS: Set<string>` (lista fija de la
  spec: artículos, preposiciones, conjunciones, pronombres, interrogativos, «hoy, ahora,
  actualmente, vez»). Constantes documentadas estilo `MIN_NEW_FINAL_LINES`.
- `export function questionSignificantTokens(text: string): Set<string>` — normaliza, tokeniza
  por espacios, filtra stopwords y recorta «s» final de tokens con longitud > 3.
- `export function areQuestionsSimilar(a: string, b: string): boolean` —
  1. igualdad de `normalizeQuestion(a) === normalizeQuestion(b)` → `true` (superconjunto SPEC-036);
  2. conjuntos de tokens significativos; si alguno vacío → `false` (ya se comprobó la igualdad);
  3. equivalencia de tokens: idénticos O prefijo común ≥ 5 caracteres (constante
     `TOKEN_PREFIX_EQUIVALENCE_CHARS = 5`); la intersección cuenta tokens de A con algún
     equivalente en B;
  4. solapamiento `|A∩B| / min(|A|,|B|) >= SIMILARITY_THRESHOLD` → `true`.

> Ajuste de autoría pre-QA (2026-07-15): la equivalencia por prefijo se añadió tras la
> verificación numérica del implementador («gestionar»/«gestión» daba 0.67 < 0.7).

### 2. `isSimilarToQueue` usa la nueva métrica

Sustituir la igualdad de normalizados por `areQuestionsSimilar(item.suggestedQuestion, question)`
contra `[...pending, ...pinned]` (mismo ámbito). El orden observable en `runAnalysis` no cambia:
similitud primero, gate de capacidad después.

### 3. Primera barrera en `buildSystemPrompt`

Reescribir la línea de SPEC-036 (texto estático, byte-estable en sesión):

- No proponer preguntas iguales, casi iguales **ni reformulaciones del mismo tema con otras
  palabras** respecto a la cola.
- Si la mejor siguiente pregunta ya está en la cola, repetir **exactamente el mismo texto** de la
  cola (no reformular).

## Invariantes a preservar (regresión)

- `systemBlocks` construido una vez en `startAssistant`, sin estado nuevo (SPEC-023).
- `suggestionCount` solo cuenta aceptadas; candidata suprimida → evento `active` con cola intacta.
- Encolado al frente con `randomUUID()`; gate `pending.length >= maxPending` intacto (SPEC-036).
- Typecheck + lint en verde; sin cambios en tipos del renderer ni preload.
