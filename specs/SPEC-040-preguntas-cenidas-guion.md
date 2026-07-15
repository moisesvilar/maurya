# SPEC-040 — Generación de preguntas ceñida al guión y a su orden

## Descripción

Las preguntas que sugiere el asistente en vivo deben apoyarse en el guión generado para la
entrevista y seguir el orden que este establece: en ausencia de una razón Mom Test para
desviarse, la sugerencia debe ser la siguiente pregunta del guión aún no cubierta. Para que el
asistente sepa por dónde va la conversación más allá de la ventana reciente, cada análisis
devuelve además un **cursor de guión** (el bloque o pregunta que se está tratando) que se le
realimenta en el análisis siguiente. No cambia la UI ni la cadencia de análisis.

Origen: petición humana directa (2026-07-15), §4 de
`docs/drafts/improvements-preguntas-20260715.md`. Evoluciona RF-ASIS-002 y RF-GUION-002.

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
- Esta spec **no tiene UI**: no se toca ningún componente del renderer ni ningún canal IPC. Todo
  el cambio vive en la lógica del asistente en main y en su prompt.

## Criterios de aceptación

### Instrucciones de adherencia al guión (prompt de sistema)

- GIVEN una sesión de asistente activa WHEN se construye el prompt de sistema THEN incluye la instrucción de que, con `action` `continue`, la pregunta sugerida sea la **siguiente pregunta del guión aún no cubierta, respetando su orden**.
- GIVEN una sesión de asistente activa WHEN se construye el prompt de sistema THEN incluye la instrucción de que la desviación del guión solo se justifica por The Mom Test (falta de evidencia concreta o señal de alarma) y de volver al punto del guión donde se quedó después de profundizar.
- GIVEN una sesión de asistente activa WHEN se construye el prompt de sistema THEN incluye la instrucción de devolver en `scriptCursor` el bloque o pregunta del guión que se está tratando en la conversación.

### Cursor de guión (realimentación dinámica)

- GIVEN un análisis cuya respuesta trae `scriptCursor` «Bloque 2 — Presupuesto» WHEN se construye el mensaje de usuario del análisis siguiente THEN incluye la sección `## Punto actual del guión` con ese texto.
- GIVEN una sesión sin ningún análisis previo con cursor válido WHEN se construye el mensaje de usuario THEN la sección `## Punto actual del guión` no aparece.
- GIVEN una respuesta con `scriptCursor` vacío o en blanco WHEN se procesa THEN se conserva el último cursor válido (el vacío no lo borra).
- GIVEN una respuesta sin `scriptCursor` o con un tipo inesperado WHEN se procesa THEN el análisis sigue siendo válido y el cursor previo se conserva (parseo defensivo, patrón `objectivesMet`).

### Contrato de salida

- GIVEN el schema de structured outputs WHEN se inspecciona THEN `scriptCursor` es un string acotado (maxLength) incluido en `required`, sin alterar los topes existentes de `suggestedQuestion`/`reason`.

### Regresión (SPEC-021/023/036/037/038/039)

- GIVEN una sesión con varias llamadas y cursor cambiando entre ellas WHEN se comparan los `systemBlocks` THEN son byte-idénticos (el cursor viaja SOLO en el mensaje de usuario).
- GIVEN una respuesta válida con cursor WHEN se procesa THEN la aceptación/supresión de la candidata y la resolución de la cola se comportan exactamente como hasta ahora (el cursor no interfiere).
- GIVEN una entrevista sin guión WHEN se analiza THEN todo funciona igual (el cursor puede viajar o no; su ausencia no rompe nada).

## Notas técnicas

- **Dónde vive el cambio:** `src/main/assistantService.ts` — `OUTPUT_SCHEMA` (campo nuevo
  `scriptCursor`, `maxLength` 120, en `required`), `AssistantSession.scriptCursor: string | null`
  (nace null), `parseAnalysis` (extracción defensiva: solo string no vacío tras trim; si no,
  conservar el previo), `runAnalysis` (persistir el cursor en la sesión en el camino de éxito),
  `buildSystemPrompt` (tres reglas nuevas de texto estático) y `buildUserPrompt` (sección
  `## Punto actual del guión` condicional, entre los objetivos cubiertos y la conversación).
- El guión sigue viajando completo (truncado a `SCRIPT_EXCERPT_CHARS`) en el prefijo cacheado;
  el cursor es la única pieza dinámica y va en la parte variable (invariante SPEC-023).
- Sin dependencias nuevas, sin IPC, sin cambios de schema de datos.

## Decisiones asumidas

- [mecanismo de posición] → asumido cursor devuelto por el propio modelo y realimentado
  (alternativa: parsear el guión markdown en preguntas numeradas y trackear índices cubiertos;
  se descarta por fragilidad — el guión es texto libre — y por coste de mantenimiento).
- [persistencia del cursor] → asumido estado de sesión en memoria (muere con la sesión, como la
  cola); no se persiste en transcript.json ni en la Interview.
- [maxLength del cursor] → asumido 120 caracteres (suficiente para «bloque — pregunta», acota la
  latencia de salida, coherente con SPEC-023).
- [cursor con schema required] → asumido `required` con vacío permitido («» cuando el modelo no
  sabe) en lugar de opcional: structured outputs garantiza la forma y el parseo defensivo cubre
  ambos casos.
