# SPEC-052 — Unificar la terminología de plantillas en toda la app

## Descripción

Hoy la app nombra el mismo concepto de seis formas distintas según la pantalla: «Plantillas de entrevistas», «Template de preguntas», «Template», «Plantilla», «Sin template», «Note-template». Esta spec unifica toda la terminología visible al usuario en exactamente dos términos: **«Plantilla(s) de preguntas»** (antes plantillas/templates de entrevista o de preguntas) y **«Plantilla(s) de notas»** (antes templates de notas o note-templates), con «Sin plantilla» como ausencia. El cambio afecta a labels, pestañas, selects, tooltips, empty states, fallbacks y mensajes de error que cruzan IPC; no cambia ninguna funcionalidad, layout ni flujo.

## Alcance de implementación

- Esta spec define **únicamente el código de producción** que debe entregarse: UI (componentes, páginas, estados), datos (queries, mutations, schema si aplica) y lógica de negocio asociada.
- **Los tests automatizados están fuera del alcance del implementador.** No se deben escribir tests unitarios (Vitest / Testing Library) ni tests end-to-end (Playwright) como parte de esta entrega. Los tests los genera la skill `/somo-qa-dev` y los ejecuta `/somo-qa-tester` contra el código ya commiteado, en un paso posterior del pipeline de QA de SOMO.
- Si la spec requiere algún ajuste de schema, migración Supabase o cambio de RLS, se indica explícitamente en "Notas técnicas". Si no se indica, no hay cambios de infraestructura.
- **Fuera de alcance**: renombrar identificadores de código, tipos, nombres de archivo o componentes (`InterviewTemplate`, `NoteTemplate`, `useInterviewTemplates`, etc.); las claves persistidas de `db.json` (`interviewTemplates`, `noteTemplates`, `templateId`, `noteTemplateId`); las rutas y query params (`/settings?tab=interview-templates`, `/settings/interview-templates/*`, `/settings/note-templates/*` y sus redirects legados); los `id`/`htmlFor` de campos (`capture-template`, `interview-template`, `group-note-template`, etc.); el `LlmErrorKind` `'no-template'`; y los prompts personalizados ya persistidos por el usuario (solo cambian los defaults). El código sigue hablando inglés; la unificación es exclusivamente de textos en español.

## Criterios de aceptación

### Ajustes

- GIVEN la página de Ajustes WHEN se carga THEN la lista de pestañas muestra, en este orden, «Claves de IA», «Plantillas de notas», «Plantillas de preguntas» y «Prompts personalizados».
- GIVEN la URL `/settings?tab=interview-templates` WHEN se carga la página THEN la pestaña activa es «Plantillas de preguntas» y muestra el listado existente sin cambios funcionales.
- GIVEN cero plantillas de preguntas WHEN se abre la pestaña «Plantillas de preguntas» THEN el empty state muestra «Aún no hay plantillas de preguntas» con el CTA «Crear primera plantilla».
- GIVEN cero plantillas de notas WHEN se abre la pestaña «Plantillas de notas» THEN el empty state muestra «Aún no hay plantillas de notas» (sin cambios) con el CTA «Crear primera plantilla».

### Selects de plantilla en diálogos

- GIVEN el diálogo de nueva entrevista (`InterviewFormDialog`) WHEN se pinta THEN el label visible y el `aria-label` del select son «Plantilla de preguntas» (antes «Template») y la opción vacía es «Sin plantilla» (antes «Sin template»).
- GIVEN los diálogos de nueva captura y de edición de captura WHEN se pintan THEN el label visible y el `aria-label` del select son «Plantilla de preguntas» (antes «Plantilla») y la opción vacía es «Sin plantilla».
- GIVEN el diálogo de crear/editar grupo de entrevistas WHEN se pinta THEN los dos selects muestran labels y `aria-label` «Plantilla de preguntas» y «Plantilla de notas» (antes «Template de preguntas»/«Template de notas») y ambos ofrecen la opción «Sin plantilla».
- GIVEN el select de plantilla de la sección Nota WHEN se pinta THEN su `aria-label` es «Plantilla de notas» (antes «Note-template»).

### Fallbacks y filas informativas

- GIVEN un grupo sin plantilla de preguntas o de notas WHEN se pinta la página del grupo o la fila del grupo en el discovery THEN los fallbacks son «Sin plantilla de preguntas» y «Sin plantilla de notas» (antes «Sin template de …»).
- GIVEN una entrevista o captura sin plantilla asignada WHEN se pinta su página de detalle THEN la fila de metadatos muestra «Sin plantilla» (antes «Sin template»).

### Tooltips, avisos y mensajes de error

- GIVEN una entrevista sin plantilla asignada WHEN se consulta el tooltip del botón «Generar guión» deshabilitado THEN el texto es «Asigna una plantilla de preguntas para generar el guión» (antes «Asigna un template …»).
- GIVEN una entrevista sin plantilla asignada WHEN se solicita generar el guión THEN el error `no-template` que devuelve main lleva el mensaje «Asigna una plantilla de preguntas para generar el guión».
- GIVEN cero plantillas de notas y una transcripción presente WHEN se pinta la sección Nota THEN el aviso dice «Crea una plantilla de notas para generar la nota» y el link dice «Gestionar plantillas de notas» (antes «… un note-template …»/«Gestionar note-templates»).
- GIVEN cero plantillas de notas seleccionables WHEN se consulta el tooltip del botón de generar nota deshabilitado THEN el texto es «Necesitas una plantilla de notas» (antes «Necesitas un note-template»).
- GIVEN una plantilla de notas sin secciones WHEN se solicita generar la nota THEN el error devuelto por main lleva el mensaje «La plantilla de notas no tiene secciones. Añádelas para generar la nota.» (antes «El note-template …»).
- GIVEN una referencia a una plantilla inexistente en cualquier mutación del repositorio WHEN main construye el error del envelope THEN la entidad se nombra «plantilla de preguntas» o «plantilla de notas» (antes «template de entrevista»/«note-template»).

### Prompts LLM por defecto

- GIVEN la generación de guión WHEN se construye el prompt THEN el system prompt y la cabecera de sección usan «plantilla de preguntas» («adaptar la plantilla de preguntas proporcionada …», «## Plantilla de preguntas») en lugar de «template de entrevista», tanto en `llmService` como en el default de prompts personalizados.
- GIVEN la generación de nota WHEN se construye el prompt THEN el system prompt y la cabecera de sección usan «plantilla de notas» («… siguiendo las secciones de la plantilla de notas …», «## Secciones de la plantilla de notas (en este orden)») en lugar de «note-template».

### Textos que se conservan

- GIVEN los editores de plantilla (de preguntas y de notas) WHEN se pintan THEN sus títulos siguen siendo «Nueva plantilla»/«Editar plantilla» y sus acciones y validaciones no cambian.
- GIVEN las acciones de fila de ambos listados de Ajustes WHEN se ejecutan eliminar o duplicar THEN los `aria-label` («Editar plantilla», «Duplicar plantilla», «Eliminar plantilla»), el AlertDialog «Eliminar plantilla» y los Toasts «Plantilla eliminada»/«Plantilla duplicada» se conservan tal cual.

## UX Design

### Wireframe textual

Sin cambios de layout, componentes ni flujos: esta spec sustituye copys literales en pantallas ya existentes. Correspondencia término a término:

| Pantalla / componente | Texto actual | Texto nuevo |
| --- | --- | --- |
| Ajustes — pestaña | «Plantillas de entrevistas» | «Plantillas de preguntas» |
| Pestaña Plantillas de preguntas — empty state | «Aún no hay plantillas de entrevista» | «Aún no hay plantillas de preguntas» |
| InterviewFormDialog — label + aria-label del select | «Template» | «Plantilla de preguntas» |
| NewCaptureDialog / EditCaptureDialog — label + aria-label | «Plantilla» | «Plantilla de preguntas» |
| InterviewGroupFormDialog — labels + aria-labels | «Template de preguntas» / «Template de notas» | «Plantilla de preguntas» / «Plantilla de notas» |
| Todos los selects de plantilla — opción vacía | «Sin template» | «Sin plantilla» |
| NoteSection — aria-label del select | «Note-template» | «Plantilla de notas» |
| NoteSection — aviso sin plantillas + link | «Crea un note-template para generar la nota» / «Gestionar note-templates» | «Crea una plantilla de notas para generar la nota» / «Gestionar plantillas de notas» |
| NoteSection — tooltip botón deshabilitado | «Necesitas un note-template» | «Necesitas una plantilla de notas» |
| ScriptSection — tooltip botón deshabilitado | «Asigna un template para generar el guión» | «Asigna una plantilla de preguntas para generar el guión» |
| InterviewGroupDetailPage / DiscoveryDetailPage — fallbacks | «Sin template de preguntas» / «Sin template de notas» | «Sin plantilla de preguntas» / «Sin plantilla de notas» |
| InterviewDetailPage / CaptureDetailPage — fila de metadatos | «Sin template» | «Sin plantilla» |

### Componentes shadcn utilizados

Componentes: Tabs, Select, Button, Tooltip, Toast, AlertDialog, Badge, Skeleton (todos ya presentes; no se añade ni cambia ningún componente, solo sus textos).

### data-testid

Sin data-testid adicionales: todos los elementos son localizables por role/label/text. Atención QA: los nombres accesibles de varios selects cambian con esta spec («Template» → «Plantilla de preguntas», «Note-template» → «Plantilla de notas», etc.), por lo que los locators `getByLabelText`/`getByRole` existentes deben actualizarse a los textos nuevos de la tabla anterior.

### Patrón de interacción

Sin cambios: se conservan los patrones vigentes (Toast tras mutación, AlertDialog antes de eliminar, Tooltip explicativo en botones deshabilitados, empty/error states con CTA). Esta spec solo modifica el texto que esos patrones muestran.

### Comportamiento responsive

Sin cambios en ningún breakpoint. Los textos nuevos son de longitud comparable a los actuales y no alteran el layout; la pestaña «Plantillas de preguntas» es incluso más corta que «Plantillas de entrevistas».

## Notas técnicas

- **Superficies afectadas** (guía, no lista cerrada): renderer — `SettingsPage`, `InterviewTemplatesTab`, `InterviewFormDialog`, `NewCaptureDialog`, `EditCaptureDialog`, `InterviewGroupFormDialog`, `NoteSection`, `ScriptSection`, `InterviewGroupDetailPage`, `DiscoveryDetailPage`, `InterviewDetailPage`, `CaptureDetailPage`; main — `llmService.ts`, `noteService.ts`, `prompts/defaults.ts`, `db/repository.ts` (etiquetas de entidad en errores del envelope).
- **Verificación de cierre recomendada**: barrido `grep -rniE "sin template|template de (entrevista|preguntas|notas)|note-template|plantillas? de entrevista" src/` sobre cadenas visibles debe quedar a cero; las ocurrencias restantes de «template» deben ser solo identificadores, rutas, ids o claves persistidas (inglés técnico permitido por el alcance).
- **Prompts personalizados**: `prompts/defaults.ts` alimenta los defaults editables en Ajustes; los prompts ya guardados por el usuario con la redacción antigua no se migran ni se tocan.
- **Comentarios de código** que citan literales de UI («"Sin template" viaja como 'none'…») deben actualizarse junto al literal para no quedar desincronizados; los comentarios históricos que citan specs pasadas no se reescriben.
- **Trazabilidad**: requisito directo del humano (2026-07-24), no proviene de una fila del checklist; contexto en RF-TPL-001..004, RF-NOTE-001/RF-NOTE-006 y RF-GUION-001..002 del PRD. Las specs históricas (`specs/SPEC-0XX-*.md`) y `docs/prd.md`/`docs/checklist.md` no se modifican: son registro.

## Decisiones asumidas

- Los labels ambiguos «Template»/«Plantilla» a secas en los selects de entrevista y captura → asumido «Plantilla de preguntas» completo (alternativa: «Plantilla» a secas). Criterio: el requisito exige exactamente dos términos y el label corto reintroduce ambigüedad entre los dos tipos.
- La opción vacía de los selects → asumido «Sin plantilla» genérico (alternativa: «Sin plantilla de preguntas/notas» por select). Criterio: dentro del select el tipo ya lo da el label del campo; el sufijo completo se reserva para los fallbacks fuera de contexto (páginas de detalle).
- Los prompts LLM por defecto se incluyen en la unificación aunque no sean visibles → asumido cambiarlos (alternativa: excluirlos y minimizar el diff). Criterio: «toda la app» y coherencia; cambio inocuo para la calidad de generación.
- Títulos genéricos «Nueva plantilla»/«Editar plantilla» y los Toasts «Plantilla eliminada/duplicada» → asumido conservarlos (alternativa: sufijarlos con el tipo). Criterio: no contienen ninguna variante prohibida y el contexto de navegación ya identifica el tipo.
- Concordancia de género al pasar de «un template» a «una plantilla» → asumido revisar cada frase afectada (artículos, participios) como parte del cambio, reflejada ya en los literales de los ACs.
