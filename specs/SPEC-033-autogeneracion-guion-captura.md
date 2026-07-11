# SPEC-033 — Autogeneración del guión al crear la captura

> Requisito origen: petición directa del humano (2026-07-11), segunda viñeta de la sección
> «Mejoras en las capturas» de `docs/drafts/improvements-20260711.md` (checklist H9, ítem 6).
> Traza a RF-GUION-002. Relacionadas: SPEC-020 (creación de captura + navegación al detalle),
> SPEC-014 (generación de guión), SPEC-025 (patrón de tarea LLM en segundo plano con eventos),
> SPEC-029 (ScriptSection con edición siempre activa), SPEC-021 (coste de IA).

## Descripción

Al crear una captura con plantilla asignada, el guión empieza a generarse automáticamente en
segundo plano, sin pulsar «Generar guión». El usuario aterriza en el detalle de la captura
viendo el progreso («Generando guión…») y, al terminar, el guión y los objetivos aparecen solos.
Si la captura no tiene plantilla o no hay clave de Anthropic, no se genera nada (sin error) y el
flujo actual queda intacto.

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
- Sin cambios de schema: se añade un canal IPC de disparo y un canal de eventos (familia
  `llm:*`), detallados en Notas técnicas. La generación reutiliza íntegro el servicio existente.

## Criterios de aceptación

### Disparo automático

- GIVEN el Dialog «Nueva captura» con plantilla asignada y clave de Anthropic configurada WHEN el usuario pulsa «Crear» THEN la captura se crea, se navega a su detalle y la generación del guión arranca automáticamente sin pulsar «Generar guión».
- GIVEN la generación automática en curso WHEN se muestra el detalle de la captura THEN la sección Guión muestra el indicador «Generando guión…» en lugar del botón «Generar guión».
- GIVEN la generación automática completada WHEN termina THEN la sección Guión muestra el guión generado en el editor, la lista de objetivos se rellena y el coste queda acumulado en el aiUsage de la captura — sin ninguna acción del usuario.

### Guards (sin generación, sin error)

- GIVEN una captura creada sin plantilla («Sin template») WHEN se navega a su detalle THEN no se lanza ninguna generación automática y la sección Guión muestra su estado actual (empty state con «Generar guión» deshabilitado por falta de template).
- GIVEN una captura creada con plantilla pero sin clave de Anthropic configurada WHEN se crea THEN no se realiza ninguna llamada al LLM y la sección Guión queda en su estado actual (Alert de clave + botón deshabilitado).
- GIVEN una captura cuya generación automática ya produjo guión WHEN el disparo automático se repitiera (p. ej. doble invocación) THEN no se lanza una segunda generación (el guión existente nunca se sobrescribe por el disparo automático).

### Errores y coexistencia

- GIVEN la generación automática falla (error de red o de la API) WHEN termina THEN la captura queda intacta sin guión, y si el usuario está en el detalle aparece un Toast de error con el mensaje del fallo; el botón «Generar guión» vuelve a estar disponible como reintento manual.
- GIVEN el usuario navega fuera del detalle durante la generación automática WHEN esta termina con éxito THEN el guión queda persistido y se muestra al volver a entrar, sin señales de error.
- GIVEN el flujo de creación de entrevista desde una empresa (no captura) WHEN se crea la entrevista THEN el comportamiento no cambia (sin autogeneración; el guión se genera manualmente como hasta ahora).
- GIVEN la generación manual con «Generar guión» o «Regenerar» WHEN se usa THEN se comporta exactamente igual que hasta ahora.

## UX Design

### Wireframe textual

Sin pantallas nuevas. **Sección Guión del detalle de captura** (SPEC-029): el estado «Generando
guión…» (Button outline disabled con Loader2 `animate-spin`, ya existente para la generación
manual) se muestra también cuando la generación en curso es la automática, tanto en la cabecera
como sustituyendo al botón del empty state. Todo lo demás igual.

### Componentes shadcn utilizados

Los ya presentes en ScriptSection (Button, Alert, Tooltip, Toast). Sin componentes adicionales.

### data-testid

Sin data-testid adicionales: el indicador «Generando guión…», el botón «Generar guión» y el Toast
de error son localizables por role/text (y `script-regenerate-button` ya existe, SPEC-029).

### Patrón de interacción

- **Generación en segundo plano, nunca bloqueante** (patrón SPEC-025): crear la captura y navegar
  no esperan al LLM; el progreso se comunica con el Loader2 inline existente (§5.4/§6.4, spinner
  de acción).
- **Degradación silenciosa en los guards** (patrón asistente inerte): sin plantilla o sin clave
  no hay error ni aviso nuevo — la UI existente ya explica cómo habilitar la generación (Tooltip
  y Alert de SPEC-014).
- **Toast de error solo si el usuario está presente** (§6.1): un fallo de la generación
  automática con el detalle abierto produce Toast destructive con el mensaje; si se fue, el
  silencio es correcto porque el estado resultante (sin guión, botón disponible) es autoexplicativo.
- Sin Toast de éxito para la automática: el guión apareciendo es el feedback (mismo criterio que
  la evaluación automática de SPEC-025).

### Comportamiento responsive

Sin cambios respecto al comportamiento actual de las páginas implicadas.

## Notas técnicas

- **Canal de disparo** `llm:auto-generate-script` (familia `llm:*`, envelope `LlmResult<void>` o
  equivalente): lo invoca el flujo de creación de captura (fire-and-forget, sin await del
  resultado de la generación). Corre íntegro en main.
- **Guards en main, silenciosos** (retorno ok sin acción): entrevista inexistente, sin
  `templateId`, con `scriptMarkdown` ya presente, o sin clave de Anthropic → cero llamadas al
  LLM. Sin guard de límite de coste: una captura recién creada tiene aiUsage cero (documentado).
- **Reutilización íntegra**: la generación en sí es la existente (`generateInterviewScript` de
  SPEC-014, con contexto histórico, structured outputs, acumulación de coste SPEC-021 y
  persistencia por `updateInterview`). Esta spec solo añade el disparo y los eventos.
- **Canal de eventos** `llm:script-generation` (patrón `llm:objective-evaluation`, SPEC-025):
  eventos tipados `{ interviewId, status: 'generating' } | { interviewId, status: 'done',
  interview } | { interviewId, status: 'error', message }` emitidos a las ventanas. ScriptSection
  se suscribe (patrón ObjectivesSection: filtra por interviewId, ref para el callback del padre):
  `generating` → estado visual «Generando guión…»; `done` → `onInterviewUpdated(interview)`;
  `error` → Toast destructive con el mensaje. La generación manual existente no cambia de
  mecanismo (sigue por invoke), pero su estado visual y el del evento comparten el mismo
  indicador.
- **Idempotencia**: el guard de `scriptMarkdown` presente hace inocuo cualquier disparo duplicado;
  además main mantiene un guard in-flight por entrevista (una generación automática simultánea
  como máximo).

## Decisiones asumidas

- El disparo vive en el flujo de creación de captura (renderer llama al canal tras crear, antes de
  navegar) y no dentro del handler de creación de db → asumido: los handlers `db:*` son
  persistencia pura (invariante de arquitectura); acoplar db→llm en main rompería la separación.
  Alternativa: disparo dentro de main al crear.
- Solo capturas: la creación de entrevistas desde empresa (RF-GUION-001) no autogenera → asumido
  por el literal del requisito («tras la creación de la captura»). Alternativa: unificar ambos
  flujos.
- Sin guard de límite de coste en el disparo automático → asumido: aiUsage de una captura recién
  creada es cero, el guard nunca aplicaría (documentado para no aparentar omisión). Alternativa:
  incluirlo por simetría con SPEC-025.
- Toast de error solo con el detalle montado; sin Toast de éxito → asumido (criterios de SPEC-025
  para la evaluación automática). Alternativa: notificación global.
- El guión existente nunca se sobrescribe por el disparo automático (guard) → asumido: sobrescribir
  requiere la intención explícita de «Regenerar» con AlertDialog (SPEC-014). Alternativa: regenerar
  si el guión existía.
