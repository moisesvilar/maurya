# SPEC-038 — Detección en vivo de preguntas de la cola ya respondidas

## Descripción

Durante una entrevista real, una pregunta de la cola del asistente seguía mostrándose como
pendiente muchos minutos después de que el interlocutor la hubiera contestado explícitamente.
Esta spec robustece la resolución en vivo por dos vías: una **resolución determinista
inmediata** cuando el entrevistador formula (por el micrófono) una pregunta casi idéntica a una
pendiente, y una **primera barrera reforzada en el prompt** para que cada análisis revise una a
una las preguntas en cola y marque las ya respondidas aunque nadie las haya formulado con esas
palabras. No cambia la UI ni la cadencia de análisis.

Origen: petición humana directa (2026-07-15), §2 de
`docs/drafts/improvements-preguntas-20260715.md`. Evoluciona RF-ASIS-001 y RF-ASIS-002 sobre el
mecanismo `resolvedQueueIndexes` de SPEC-036.

## Alcance de implementación

- Esta spec define **únicamente el código de producción** que debe entregarse: UI (componentes,
  páginas, estados), datos (queries, mutations, schema si aplica) y lógica de negocio asociada.
- **Los tests automatizados están fuera del alcance del implementador.** No se deben escribir tests
  unitarios (Vitest / Testing Library) ni tests end-to-end (Playwright) como parte de esta entrega.
  Los tests los genera la skill `/somo-qa-dev` y los ejecuta `/somo-qa-tester` contra el código ya
  commiteado, en un paso posterior del pipeline de QA de SOMO. Cualquier test que el implementador
  entregue será descartado o reemplazado.
- Si la spec requiere algún ajuste de schema, migración Supabase o cambio de RLS, se indica
  explícitamente en "Notas técnicas". Si no se indica, no hay cambios de infraestructura.
- Esta spec **no tiene UI**: no se toca ningún componente del renderer, ningún tipo de
  `src/renderer/src/types/` ni ningún canal IPC. Todo el cambio vive en la lógica del asistente
  en main y en su prompt.

## Criterios de aceptación

### Resolución determinista al formular la pregunta (canal mic)

- GIVEN una cola con la pregunta pendiente «¿Cuánto pagasteis por la última herramienta que comprasteis?» WHEN llega una línea final del canal `mic` con el texto «¿Y cuánto pagasteis por esa última herramienta que comprasteis?» (casi idéntica según la similitud de SPEC-037) THEN la pregunta sale de la cola inmediatamente y se emite `assistant:update` con la cola actualizada, sin ninguna llamada al LLM.
- GIVEN una cola con una pregunta **anclada** WHEN llega una línea final del canal `mic` casi idéntica a ella THEN la pregunta anclada permanece intacta (las ancladas nunca se auto-resuelven).
- GIVEN una cola con una pregunta pendiente WHEN llega una línea final del canal `system` (interlocutor) casi idéntica a ella THEN la pregunta permanece en la cola (solo el entrevistador formula preguntas de la cola).
- GIVEN una cola con una pregunta pendiente WHEN llega una línea final del canal `mic` sobre otro tema THEN la pregunta permanece en la cola.
- GIVEN una línea final del canal `mic` casi idéntica a dos preguntas pendientes a la vez WHEN se procesa THEN ambas salen de la cola (la resolución cubre todas las coincidencias).
- GIVEN una línea `mic` que resuelve una pregunta WHEN se evalúan los disparadores del análisis THEN esa línea cuenta como material nuevo exactamente igual que antes (la resolución no altera los contadores de 3 líneas/20 s/45 s ni provoca llamadas extra).
- GIVEN una línea interim (no final) del canal `mic` casi idéntica a una pendiente WHEN se procesa THEN la cola no cambia (solo las líneas finales resuelven).

### Primera barrera reforzada (prompt)

- GIVEN una sesión de asistente activa WHEN se construye el prompt de sistema THEN incluye la instrucción de revisar **una a una** las preguntas en cola en cada análisis y marcar en `resolvedQueueIndexes` las que el interlocutor ya haya respondido, **aunque la formulación difiera o la respuesta haya llegado sin que nadie hiciera la pregunta**.
- GIVEN una sesión de asistente activa WHEN se construye la sección `## Tarea` del mensaje de usuario THEN pide primero revisar la cola marcando las preguntas ya respondidas y después decidir la siguiente jugada.

### Regresión (SPEC-023/036/037)

- GIVEN una sesión con varias llamadas de análisis WHEN se compara `systemBlocks` entre llamadas THEN es byte-idéntico (las instrucciones nuevas son texto estático).
- GIVEN un análisis que devuelve `resolvedQueueIndexes` con un índice del tramo pendiente del snapshot WHEN se aplica THEN la pregunta correspondiente sale de la cola por id (mecanismo de SPEC-036 intacto).
- GIVEN un análisis que devuelve en `resolvedQueueIndexes` el índice de una anclada WHEN se aplica THEN se ignora (SPEC-036 intacto).
- GIVEN una pregunta resuelta por formulación del entrevistador WHEN termina la sesión THEN `suggestionCount` no cambia por la resolución (sigue contando solo candidatas aceptadas).

## Notas técnicas

- **Dónde vive el cambio:** `src/main/assistantService.ts` — `handleFinalLine` (nueva resolución
  determinista antes de `maybeAnalyze`), `buildSystemPrompt` y `buildUserPrompt` (sección
  `## Tarea`). Sin dependencias nuevas, sin llamadas LLM adicionales, sin cambios de IPC.
- **Resolución por formulación:** en cada línea final con `channel === 'mic'`, comparar su texto
  con `areQuestionsSimilar` (SPEC-037, mismo umbral y equivalencias) contra cada pregunta
  **pendiente** (nunca las ancladas). Cada coincidencia se elimina por id. Si hubo al menos una,
  emitir `assistant:update` con el estado derivado (patrón `setAssistantPinned`: `analyzing` si
  hay análisis en vuelo, si no `active`/`idle` según contenido, `usage` solo con ≥1 llamada).
- La comparación pregunta-contra-línea funciona razonablemente porque la línea del entrevistador
  al formular contiene los mismos tokens significativos; una línea larga con la pregunta embebida
  puede no superar el umbral (min(|A|,|B|) la favorece si la pregunta es corta) — limitación
  aceptada, la primera barrera del prompt la cubre.
- **Prompt:** reescribir la regla de `resolvedQueueIndexes` del prompt de sistema (texto estático,
  cambia entre releases, no dentro de la sesión — patrón SPEC-036/037) y la sección `## Tarea`
  del mensaje de usuario (parte variable, sin restricción de bytes).
- La resolución determinista ocurre ANTES de evaluar los disparadores del análisis para esa misma
  línea, pero no los modifica: la línea se apila en el buffer y cuenta como material nuevo igual
  que hoy.

## Decisiones asumidas

- [momento de resolver] → asumido resolver cuando el entrevistador **formula** la pregunta (no
  cuando el interlocutor termina de responderla): el propósito de la sugerencia ya está servido y
  retira la tarjeta en ~1 s (alternativa: esperar a la respuesta, requiere juicio del LLM y
  reintroduce los minutos de retraso que motivan la spec). El caso «respondida sin formularse»
  queda en manos del análisis LLM con la instrucción reforzada.
- [canal] → asumido solo `mic` resuelve por formulación (el interlocutor no hace las preguntas de
  la cola); una línea `system` similar es coincidencia temática, no formulación.
- [métrica] → asumido reutilizar `areQuestionsSimilar` de SPEC-037 sin umbral propio (alternativa:
  umbral distinto para línea-contra-pregunta; se descarta para no duplicar constantes sin
  evidencia de necesidad).
- [ancladas] → asumido que la resolución por formulación respeta la invariante de SPEC-036: una
  anclada solo sale por desanclado manual.
