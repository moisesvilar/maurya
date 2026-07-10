# SPEC-023 — Plan de implementación

> Generado por subagente Plan (2026-07-10). Contrato: specs/SPEC-023-optimizacion-latencia-asistente.md. Verificado sobre el código real y el SDK pinneado (`@anthropic-ai/sdk` **0.110.0**): (a) hoy el `system` del asistente es un **string estático** (`buildSystemPrompt()`, assistantService.ts:314-328) y el guión + objetivos viajan en el **mensaje user** junto a la ventana (buildUserPrompt, :330-367) — los objetivos llevan estado dinámico `[cubierto]/[pendiente]` que **impide** cachearlos tal cual: el estado debe salir del prefijo; (b) el SDK soporta lo necesario: `system?: string | Array<TextBlockParam>` (messages.ts:3204), `TextBlockParam.cache_control?: CacheControlEphemeral | null` (:1592-1603), `CacheControlEphemeral { type: 'ephemeral', ttl?: '5m' | '1h' }` (:293-308) y `Usage.cache_creation_input_tokens / cache_read_input_tokens: number | null` (:2332-2346) — **son `| null`**, el defensivo degrada null→0; (c) el coste de sesión se recalcula hoy **desde totales acumulados** (assistantService.ts:277-280), no por llamada — conservar ese patrón con acumuladores por componente o los tests de SPEC-021 (que asertan `computeCostUsd(2000, 1000)` exacto) se desajustan; (d) el único test que inspecciona el prompt del asistente es `tests/unit/degradation/assistantService.degraded.test.ts:169-175`: lee `messages[0].content` **como string** y aserta el formato `[mic] texto` → el user sigue siendo string y la sección de conversación no cambia de formato; (e) `AssistantPanel.tsx:136-137` renderiza pregunta y razón completas sin clamp → los `maxLength` solo acortan latencia, no rompen UI; (f) llmService.ts:448 y noteService.ts:342 llaman `recordInterviewUsage(id, extractUsage(response))` pasando el objeto entero → añadir campos opcionales es retrocompatible.

## 1. aiCost: tarifas de caché y extracción defensiva (src/main/aiCost.ts)

- Constantes nuevas junto a las existentes (que **no cambian**: `INPUT_USD_PER_MTOK = 5`, `OUTPUT_USD_PER_MTOK = 25`):
  ```ts
  export const CACHE_WRITE_USD_PER_MTOK = 6.25 // escritura de caché: 1,25× entrada
  export const CACHE_READ_USD_PER_MTOK = 0.5   // lectura de caché: 0,1× entrada
  ```
- `computeCostUsd` gana dos parámetros **opcionales con default 0** (retrocompatible: toda llamada existente de 2 args produce el valor idéntico al actual): `computeCostUsd(inputTokens, outputTokens, cacheWriteTokens = 0, cacheReadTokens = 0)` — `inputTokens` = SOLO tokens de entrada no cacheados.
- `extractUsage` devuelve dos campos más, defensivos (0 si falta, no es number **o es null**): `{ inputTokens, outputTokens, cacheCreationInputTokens, cacheReadInputTokens }`. JSDoc: con caché, `usage.input_tokens` del SDK son solo los NO cacheados; total de entrada = suma de los 3.
- `recordInterviewUsage`: `tokens` gana `cacheCreationInputTokens?` / `cacheReadInputTokens?` (default 0). El delta pliega sin cambiar la forma de `AiUsage`: `delta.inputTokens = input + cacheWrite + cacheRead`; `delta.estimatedCostUsd = computeCostUsd(input, output, cacheWrite, cacheRead)`. Sin campos de caché → byte-idéntico al actual. llmService/noteService **no se tocan**.

## 2. assistantService: prefijo fijo cacheado + user reducido (src/main/assistantService.ts)

- **Construcción única por sesión** (estabilidad byte a byte): en `startAssistant`, tras cargar `objectives`/`scriptExcerpt`, construir y guardar en `AssistantSession` un campo `systemBlocks: Anthropic.TextBlockParam[]` que NO se recalcula durante la sesión:
  - **Bloque 1**: el texto actual de `buildSystemPrompt()` con dos retoques mínimos: (i) refuerzo de brevedad en `suggestedQuestion` (máximo ~200 caracteres) y `reason` (UNA sola frase corta, máximo ~140); (ii) ajuste de la frase "Recibirás la ventana reciente…" para reflejar la nueva distribución. Diff quirúrgico.
  - **Bloque 2** (solo si hay objetivos o guión): secciones `## Objetivos de la entrevista` (numeradas 0-based, **SIN** estado `[cubierto|pendiente]` — es lo que las hace estables) y `## Guión de la entrevista` (`scriptExcerpt` ya truncado).
  - `cache_control: { type: 'ephemeral' }` **únicamente en el último bloque** del array. TTL 5 min; llamadas ≥20 s aparte → dentro del TTL.
- `requestSuggestion`: `system: target.systemBlocks`. Nada más cambia en la llamada (sin temperature/top_p/top_k/budget_tokens; el resto de la llamada se conserva).
- `buildUserPrompt` reducido a la **parte variable**, siempre string (el test degradado lee `messages[0].content` como string):
  1. Sección compacta nueva: `## Objetivos ya cubiertos (índices)` + índices ordenados o `ninguno` (sustituye los marcadores del prefijo). Omitir si no hay objetivos.
  2. `## Conversación reciente (mic = entrevistador, system = interlocutor)` — **formato y truncado intactos** (`TRANSCRIPT_WINDOW_CHARS`, `[canal sN] texto`).
  3. `## Tu sugerencia anterior (no la repitas)` — intacta.
  4. `## Tarea` — intacta.
- **Acumulación de uso con caché** (SPEC-021): acumulador privado por componentes `tokenTotals: { input; output; cacheWrite; cacheRead }`. En el camino de éxito: sumar los 4 componentes; `usage.inputTokens = input + cacheWrite + cacheRead`; `usage.outputTokens = output`; `usage.estimatedCostUsd = computeCostUsd(input, output, cacheWrite, cacheRead)` — **recomputar desde totales** (sin caché → idéntico al actual, los tests de SPEC-021 siguen exactos). `AnalysisResult.tokens` lleva los 4 componentes.
- **Cero cambios** en: disparadores SPEC-016, gate de límite SPEC-021, `parseAnalysis`, feedback, `stopAssistant`, eventos IPC.

## 3. Salida acotada: schema + MAX_TOKENS (src/main/assistantService.ts)

- `OUTPUT_SCHEMA`: `suggestedQuestion: maxLength: 200` y `reason: maxLength: 140`. Nombres de campos, enums y `required` **intactos**.
- `MAX_TOKENS`: `1024` → `512` (salida acotada por schema; baseline ~136 tok; margen ~3,7×). Red de seguridad existente: JSON truncado → `stop_reason !== 'end_turn'` → `LlmOperationError('format')` → evento `error` sin resetear contadores → reintento natural.
- Los topes del prompt (fase 2) y del schema deben ser **los mismos números** (200/140).

## 4. Verificación de no-cambios (sin código)

- **llmService.ts** (:448) y **noteService.ts** (:342): llamadas únicas, sin `cache_control`; consumen `extractUsage(response)` entero → retrocompatibles por construcción.
- Disparadores SPEC-016 y gate de coste SPEC-021: intactos. Sin cambios de schema de datos, IPC ni UI; sin dependencias nuevas.

## 5. Validación

- `npm run typecheck` + `npm run lint`.
- **Re-medición instrumentada (MANUAL, cierre del ítem)**: protocolo del baseline (docs/MEMORY.md 2026-07-10): app dev con `--remote-debugging-port`, listeners CDP sobre `assistant:update`, guion `say`, ≥3 ciclos, **mediana < 5 s**; verificar `cache_read_input_tokens > 0` en la 2ª+ llamada. Registrar en MEMORY.md.
- Mediana ≥ 5 s → **ESCALAR al humano** (cambio de modelo contradice CLAUDE.md).

## AC → fase

| AC | Fase |
|---|---|
| Prefijo fijo con cache_control, solo ventana fuera | 2 |
| Prefijo byte a byte idéntico entre llamadas | 2 |
| Guión/nota sin cambios | 4 |
| maxLength + brevedad en prompt | 3 (+2) |
| Panel conserva estructura visible | 3 |
| max_tokens 1024→512 sin truncado | 3 |
| Coste con caché (1,25×/0,1×; inputTokens = suma) | 1, 2 |
| Sin caché → cálculo idéntico | 1, 2 |
| Mediana re-medida < 5 s en MEMORY.md | 5 (MANUAL) |
| Mediana ≥ 5 s → escalar modelo a humano | 5 |

## Breakage presupuestado (QA lo repone; el implementador NO escribe tests)

- **`tests/unit/ai-cost/aiCost.test.ts` — 1 test roto seguro**: `extractUsage` asertado con `toEqual` exacto de 2 campos; devolver 4 lo rompe. QA lo repone con la forma nueva + casos null/ausente.
- **Cero roturas adicionales** si se respetan: (1) user como **string** con la sección de conversación intacta (`assistantService.degraded.test.ts:169-175`); (2) coste de sesión recomputado desde totales por componente (`assistantService.aiCost.test.ts` aserta `computeCostUsd(2000, 1000)` exacto); (3) `computeCostUsd` mantiene los 2 primeros parámetros (`aiCost.test.ts:47-55`).
- Puntos de test nuevos para /somo-qa-dev: system como array con cache_control solo en el último bloque; estabilidad del prefijo entre 2 llamadas; user sin guión/objetivos-con-estado; extractUsage con campos null/number; acumulación con caché (inputTokens suma, coste 4 tarifas); maxLength en el schema enviado; MAX_TOKENS === 512.

## Orden y riesgos

**Orden**: fase 1 → 2 → 3 (4 verificación, 5 cierre).

**Riesgos**:
1. **Prefijo no estable = cache miss silencioso** (y 1,25× por reescritura en cada llamada). Mitigación estructural: `systemBlocks` se construye UNA vez en `startAssistant`; nada del prefijo depende de `objectivesMet`, `suggestion` ni `Date`.
2. **Mínimo cacheable** (~1024 tokens de prefijo en Opus): con guiones cortos o sin guión el prefijo puede no cachearse → degradación silenciosa sin error (la ganancia de salida de fase 3 se mantiene). Documentar en el código; verificar en la re-medición.
3. **JSON truncado si max_tokens corto**: recuperable vía `LlmOperationError('format')`; si la re-medición muestra truncados, subir margen antes que tocar el schema. La salida incluye el thinking adaptativo además del JSON.
4. **Coste mal plegado**: recomputar desde `usage.inputTokens` ya sumado tarificaría el caché a $5/MTok — mantener componentes separados en el acumulador.
5. **Campos `| null` del SDK**: el defensivo typeof-number degrada null→0; test explícito.
6. **Contradicción prompt↔schema**: usar los mismos topes (200/140) en ambos.
