# SPEC-039 — Acciones por pregunta: anclar, desanclar, descartar y respondida

## Descripción

El entrevistador necesita operar la cola de preguntas del asistente con acciones explícitas por
pregunta: **anclar** (la pregunta nunca se resuelve sola), **desanclar** (vuelve a ser
sustituible), **descartar** (la retira; al finalizar la entrevista se le pregunta por qué, para
dejar constancia en la nota y en los objetivos) y **respondida** (la retira y dispara en
background un análisis que actualiza los objetivos en vivo; lo respondido queda disponible para
la nota). Las preguntas descartadas o respondidas no vuelven a sugerirse en la sesión.

Origen: petición humana directa (2026-07-15), §3 de
`docs/drafts/improvements-preguntas-20260715.md`. Evoluciona RF-ASIS-002, RF-ASIS-004,
RF-ASIS-005 y RF-NOTE-001 sobre la cola de SPEC-036/037/038.

## Alcance de implementación

- Esta spec define **únicamente el código de producción** que debe entregarse: UI (componentes,
  páginas, estados), datos (queries, mutations, schema si aplica) y lógica de negocio asociada.
- **Los tests automatizados están fuera del alcance del implementador.** No se deben escribir tests
  unitarios (Vitest / Testing Library) ni tests end-to-end (Playwright) como parte de esta entrega.
  Los tests los genera la skill `/somo-qa-dev` y los ejecuta `/somo-qa-tester` contra el código ya
  commiteado, en un paso posterior del pipeline de QA de SOMO. Cualquier test que el implementador
  entregue será descartado o reemplazado.
- Si la spec requiere algún ajuste de schema, migración Supabase o cambio de RLS, se indica
  explícitamente en "Notas técnicas". Si no se indica, no hay cambios de infraestructura. (El
  campo nuevo de `Interview` sigue el patrón sin bump de schemaVersion de aiUsage/objectiveResults.)

## Criterios de aceptación

### Acciones visibles en el panel

- GIVEN una pregunta pendiente en el panel del asistente WHEN se renderiza THEN ofrece las acciones «Marcar respondida», «Descartar pregunta» y «Anclar pregunta» (por aria-label).
- GIVEN una pregunta anclada WHEN se renderiza THEN ofrece «Marcar respondida», «Descartar pregunta» y «Desanclar pregunta» (desanclar solo existe en ancladas y anclar solo en pendientes).
- GIVEN una pregunta pendiente WHEN se pulsa «Descartar pregunta» THEN se invoca la acción con su id y la pregunta desaparece de la lista al reflejarse el evento de main, sin confirmación ni Toast.
- GIVEN una pregunta pendiente WHEN se pulsa «Marcar respondida» THEN se invoca la acción con su id y la pregunta desaparece de la lista al reflejarse el evento de main.

### Servicio (main): descartar y responder

- GIVEN una sesión con una pregunta pendiente WHEN llega `assistant:resolve-item` con outcome `discarded` THEN la pregunta sale de la cola, se registra como descartada de la sesión y se emite `assistant:update` sin ninguna llamada al LLM.
- GIVEN una pregunta **anclada** WHEN llega `discarded` o `answered` con su id THEN sale de ancladas (la acción manual del entrevistador sí puede retirar una anclada).
- GIVEN una sesión sin análisis en vuelo y sin pausa por límite WHEN llega `answered` THEN la pregunta sale de la cola y se dispara UNA llamada de análisis inmediata en background cuyo `objectivesMet` actualiza el seguimiento en vivo (sin esperar a los disparadores de 3 líneas/20 s).
- GIVEN un análisis en vuelo WHEN llega `answered` THEN la pregunta sale de la cola igualmente y NO se lanza una llamada adicional (guard in-flight intacto).
- GIVEN el asistente pausado por límite de coste WHEN llega `answered` THEN la pregunta sale de la cola y NO hay llamada al LLM (gate de SPEC-021 intacto).
- GIVEN un id inexistente o ninguna sesión activa WHEN llega `assistant:resolve-item` THEN es un no-op silencioso (patrón `setPinned`).

### Supresión y prompt sobre descartadas/respondidas

- GIVEN una pregunta descartada en la sesión WHEN un análisis posterior devuelve una candidata casi idéntica a ella (métrica SPEC-037) THEN la candidata se descarta y no entra en la cola.
- GIVEN una pregunta marcada respondida WHEN un análisis posterior devuelve una candidata casi idéntica a ella THEN la candidata se descarta y no entra en la cola.
- GIVEN una sesión con al menos una descartada o respondida WHEN se construye el mensaje de usuario del análisis THEN incluye la lista de preguntas ya descartadas o respondidas con la instrucción de no volver a proponerlas.

### Persistencia al parar la grabación

- GIVEN una sesión con una descartada y una respondida WHEN se detiene la grabación THEN el campo `assistant` del transcript.json incluye `questionOutcomes` con cada pregunta y su outcome, y la entrevista persiste `questionOutcomes` con las mismas entradas.
- GIVEN una sesión sin acciones manuales WHEN se detiene la grabación THEN `questionOutcomes` queda vacío y el resto del registro (`suggestionCount`, `usage`) se conserva como hasta ahora.

### Diálogo de motivos al finalizar

- GIVEN una parada de grabación cuya entrevista quedó con al menos una pregunta descartada WHEN el resultado llega al renderer THEN se abre el Dialog «Preguntas descartadas» con cada pregunta descartada y un Textarea de motivo (opcional).
- GIVEN el Dialog abierto con motivos escritos WHEN se pulsa «Guardar motivos» THEN los motivos se persisten en las entradas descartadas de `questionOutcomes` de la entrevista y aparece el Toast «Motivos guardados».
- GIVEN el Dialog abierto WHEN se pulsa «Omitir» THEN se cierra sin persistir ningún motivo.
- GIVEN una parada sin preguntas descartadas WHEN el resultado llega al renderer THEN el Dialog no se abre.

### Constancia en nota y objetivos

- GIVEN una entrevista con `questionOutcomes` (descartada con motivo y respondida) WHEN se genera la nota de resumen THEN el prompt de la nota incluye una sección con las preguntas descartadas y sus motivos y otra con las marcadas como respondidas.
- GIVEN una entrevista sin `questionOutcomes` WHEN se genera la nota THEN el prompt no incluye esas secciones (idéntico al actual).
- GIVEN una entrevista con descartadas con motivo WHEN se evalúan los objetivos (automática o botón «Evaluar objetivos») THEN el prompt de evaluación incluye la sección de preguntas descartadas con sus motivos.

### Regresión (SPEC-021/023/036/037/038)

- GIVEN una sesión con varias llamadas de análisis y acciones manuales entre medias WHEN se comparan los `systemBlocks` THEN son byte-idénticos (las listas de descartadas/respondidas viajan SOLO en el mensaje de usuario).
- GIVEN acciones manuales de descartar/responder WHEN termina la sesión THEN `suggestionCount` sigue contando solo candidatas aceptadas.
- GIVEN una pregunta pendiente WHEN se ancla y se desancla THEN el comportamiento de SPEC-036 se conserva (mover a «Ancladas», volver al frente de pendientes).

## UX Design

### Wireframe textual

**Panel del asistente (Card existente de SPEC-016/036, dentro de la vista de grabación):**

- Cada ítem pendiente (`assistant-queue-item`) conserva su estructura: fila 1 con Badge de acción
  («Profundiza»/«Continúa») + chips de alarma a la izquierda y, alineado a la derecha
  (`ml-auto`), un grupo de **tres Button (variant ghost, size icon-sm)** en este orden:
  1. «Marcar respondida» — icono `Check` (Lucide), Tooltip «Respondida: actualiza los objetivos».
  2. «Descartar pregunta» — icono `X` (Lucide), Tooltip «Descartar: al finalizar se te pedirá el porqué».
  3. «Anclar pregunta» — icono `Pin` (existente), Tooltip actual.
- Fila 2: la pregunta (font-medium). Fila 3: el porqué (muted). Sin cambios.
- Cada ítem anclado (`assistant-pinned-item`): mismo grupo de tres botones pero el tercero es
  «Desanclar pregunta» — icono `PinOff` (existente). Las ancladas siguen sin mostrar el porqué.

**Dialog «Preguntas descartadas» (se abre al llegar el resultado de la parada, en el detalle de
entrevista y en el de captura):**

- Dialog (no Sheet: 1 Textarea por pregunta, interacción < 30 s, sin necesidad de ver la página).
- Título: «Preguntas descartadas». Descripción: «Deja constancia de por qué las descartaste; se
  tendrá en cuenta en la nota y en los objetivos.»
- Cuerpo con scroll: por cada pregunta descartada, el texto de la pregunta (font-medium) y un
  Textarea debajo con placeholder «¿Por qué la descartaste? (opcional)».
- Footer: Button «Omitir» (variant outline) a la izquierda del Button «Guardar motivos»
  (variant default).

### Componentes shadcn utilizados

Componentes: Card, Badge, Button, Tooltip, Dialog, Textarea, Toast (sonner existente).
Todos instalados en el scaffold; sin componentes nuevos.

### data-testid

- `assistant-item-answered` — botón «Marcar respondida» de cada ítem (pendiente y anclado)
- `assistant-item-discard` — botón «Descartar pregunta» de cada ítem (pendiente y anclado)
- `discard-reasons-dialog` — el Dialog de motivos al finalizar
- `discard-reason-input` — cada Textarea de motivo (uno por pregunta descartada)
- `discard-reasons-save` — botón «Guardar motivos»
- `discard-reasons-skip` — botón «Omitir»

Los botones de anclar/desanclar conservan sus aria-labels de SPEC-036 («Anclar pregunta» /
«Desanclar pregunta»).

### Patrón de interacción

- Acciones por ítem: inline icon-only con `aria-label` y Tooltip (regla §10: icon-only solo en
  acciones obvias + aria-label; el panel es glanceable y tres botones con texto romperían el
  «tamaño justo» de RF-ASIS-004). Descartar y responder son atómicas e inmediatas, sin
  AlertDialog: la consecuencia es reversible en espíritu (la pregunta puede volver a surgir si el
  tema reaparece… no literalmente, pero el coste del error es bajo y el contexto es una
  conversación en directo donde una confirmación rompería la atención). Decisión no cubierta por
  el design system (acción destructiva ligera en contexto de tiempo real): se resuelve sin
  confirmación por coste de interrupción; el diálogo de motivos del final actúa de red.
- Dialog para los motivos (1–5 Textareas, <30 s): regla §4.1. «Guardar motivos» → Toast de éxito
  (regla §6.1). «Omitir», Escape o cerrar = no persistir (ningún dato se pierde: los outcomes ya
  están guardados; solo se omiten los motivos).
- El Dialog se abre una sola vez por parada (no reaparece al navegar de vuelta).

### Comportamiento responsive

- **Mobile (< md):** los tres botones de acción se mantienen visibles (acción primaria nunca se
  oculta, regla §9.2); la fila 1 hace wrap (badges arriba, botones a la derecha). El Dialog ocupa
  el ancho estándar de shadcn en mobile con su scroll interno.
- **Tablet (md–lg):** interpolado entre mobile y desktop.
- **Desktop (lg+):** wireframe completo.

## Notas técnicas

- **Tipos** (`src/renderer/src/types/assistant.ts`): `AssistantQuestionOutcome =
  'discarded' | 'answered'`; `AssistantQuestionRecord { question: string; outcome:
  AssistantQuestionOutcome }`; `AssistantSessionSummary` gana `questionOutcomes:
  AssistantQuestionRecord[]` (los transcript.json antiguos siguen legibles: lectores tolerantes).
  `AssistantApi` gana `resolveItem(itemId: string, outcome: AssistantQuestionOutcome)`.
- **Dominio** (`src/renderer/src/types/domain.ts`): `Interview.questionOutcomes?:
  Array<{ question: string; outcome: 'discarded' | 'answered'; reason?: string | null }> | null` —
  opcional sin bump de schemaVersion (patrón aiUsage/objectiveResults); solo lo escribe main
  (recording:stop y el guardado de motivos).
- **IPC**: `assistant:resolve-item` fire-and-forget (patrón `assistant:set-pinned`). Guardado de
  motivos por el dominio db (`DbResult`): método que recibe `interviewId` y los motivos indexados
  contra las entradas `discarded` de `questionOutcomes`; solo rellena `reason` de entradas
  descartadas, ignora índices inválidos, mutación atómica única.
- **Sesión** (`assistantService`): listas `discarded`/`answered` de la sesión (mueren con ella).
  `answered` dispara `runAnalysis` directo si `!inFlight` y el gate de límite lo permite (mismo
  chequeo que `maybeAnalyze`, sin exigir material nuevo ni intervalo); los contadores de disparo
  no se resetean por ello. La supresión de candidatas (SPEC-037) compara además contra
  descartadas y respondidas. El mensaje de usuario gana una sección con esas preguntas y la
  instrucción de no repetirlas (parte variable; systemBlocks intactos).
- **recording:stop** (`src/main/ipc.ts`): el summary del asistente lleva `questionOutcomes`; si
  hay entrevista activa, se persiste en `updateInterview` junto a wavPath/transcriptPath. El
  transcript.json lo escribe `persistTranscript` como parte de `assistant` (sin cambio de firma).
- **Renderer**: el resultado de la parada (`StopResult.interview`) trae `questionOutcomes`; el
  Dialog vive junto a la superficie de grabación compartida (entrevista y captura). La evaluación
  automática de objetivos corre al parar (antes de que existan motivos): los motivos solo
  alimentan la reevaluación manual y la nota.
- **noteService / objectiveEvaluationService**: secciones condicionales nuevas en sus
  `buildUserPrompt` a partir de `interview.questionOutcomes` (descartadas con motivo;
  respondidas solo en la nota).

## Decisiones asumidas

- [forma de los botones] → asumido icon-only (Check/X/Pin·PinOff) con Tooltip y aria-label, patrón
  SPEC-036, en vez de botones con texto «ANCLAR/DESANCLAR/DESCARTAR/RESPONDIDA» (alternativa
  literal del draft; se descarta por espacio y por RF-ASIS-004 «glanceable, sin abrumar»).
- [descartar/responder ancladas] → asumido permitido (la acción manual prima sobre la protección
  del anclado, que solo blinda contra la resolución automática).
- [reaparición de descartadas] → asumido suprimir candidatas casi idénticas a descartadas Y
  respondidas durante toda la sesión (alternativa: solo cola visible como SPEC-037; se descarta
  porque el entrevistador ya se pronunció sobre ese tema).
- [momento de la evaluación automática] → asumido que corre al parar sin los motivos (aún no
  existen); la reevaluación manual y la nota sí los incorporan (alternativa: retrasar la
  evaluación hasta el diálogo, rompería el fire-and-forget de SPEC-025).
- [motivos opcionales] → asumido Textarea opcional y botón «Omitir» sin fricción (alternativa:
  motivo obligatorio; se descarta: el final de una entrevista real es un momento de prisa).
- [análisis de respondida] → asumido que reutiliza el análisis estándar (una llamada normal, con
  su coste SPEC-021) en lugar de un prompt específico de «actualiza objetivos»: menos superficie,
  mismo efecto (objectivesMet acumulativo viaja en cada análisis).
