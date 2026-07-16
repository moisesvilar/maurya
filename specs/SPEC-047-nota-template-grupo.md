# SPEC-047 — Nota con el template del grupo por defecto y regeneración con override

> Origen: ítem 5 de H11 en `docs/checklist.md` (RF-NOTE-006, RF-NOTE-001), draft
> `docs/drafts/company-contact-entities-20260716.md`. Depende de SPEC-045/046 (grupos con
> `noteTemplateId` y entrevistas con `interviewGroupId`). El selector de note-template y la
> regeneración con otro template YA existen en `NoteSection` (SPEC-017); esta spec cambia el
> template por defecto.

## Descripción

Cuando una entrevista pertenece a un grupo que tiene un template de notas asignado, la nota se
genera por defecto con ese template: el selector de note-template de la sección Nota aparece
preseleccionado con el template del grupo, tanto en la generación inicial como al regenerar. El
usuario puede seguir eligiendo otro template para esa entrevista en particular (comportamiento
existente). Sin grupo, sin template en el grupo o con la referencia rota, todo funciona como hasta
ahora (se preselecciona el primer template de la lista).

## Alcance de implementación

- Esta spec define **únicamente el código de producción** que debe entregarse: UI (componentes,
páginas, estados), datos (queries, mutations, schema si aplica) y lógica de negocio asociada.
- **Los tests automatizados están fuera del alcance del implementador.** No se deben escribir tests
unitarios (Vitest / Testing Library) ni tests end-to-end (Playwright) como parte de esta entrega.
Los tests los genera la skill `/somo-qa-dev` y los ejecuta `/somo-qa-tester` contra el código ya
commiteado, en un paso posterior del pipeline de QA de SOMO. Cualquier test que el implementador
entregue será descartado o reemplazado.
- Si la spec requiere algún ajuste de schema, migración Supabase o cambio de RLS, se indica
explícitamente en "Notas técnicas". Si no se indica, no hay cambios de infraestructura. En este
proyecto no hay Supabase y esta spec NO cambia schema ni canales IPC (todo existe desde SPEC-043).
- **Fuera de alcance:** la generación de la nota en sí (prompt, structured outputs, edición,
export — SPEC-017/027/029/046 intactos) y cualquier cambio en el selector más allá de su valor
por defecto.

## Criterios de aceptación

### Template del grupo por defecto

- GIVEN una entrevista de un grupo cuyo `noteTemplateId` apunta a un template existente WHEN se renderiza la sección Nota con transcripción disponible THEN el selector de note-template aparece preseleccionado con el template del grupo (no con el primero de la lista).
- GIVEN esa entrevista WHEN se pulsa «Generar nota» sin tocar el selector THEN la generación se invoca con el template del grupo.
- GIVEN una nota ya generada de esa entrevista WHEN se abre el flujo «Regenerar» THEN el selector vuelve a ofrecer por defecto el template del grupo, y elegir otro template regenera la nota con el elegido SOLO para esta entrevista (el grupo no cambia).

### Degradaciones (comportamiento actual intacto)

- GIVEN una entrevista sin grupo (`interviewGroupId` null, p. ej. una captura) WHEN se renderiza la sección Nota THEN el selector se preselecciona con el primer template de la lista (comportamiento SPEC-017).
- GIVEN una entrevista de un grupo SIN template de notas (`noteTemplateId` null) WHEN se renderiza la sección Nota THEN se preselecciona el primer template de la lista.
- GIVEN una entrevista cuyo grupo fue borrado con la página abierta o cuya referencia de template no resuelve WHEN se renderiza la sección Nota THEN se preselecciona el primer template de la lista, sin errores.
- GIVEN el usuario cambia manualmente el selector WHEN aún no ha generado THEN su elección se respeta (la preselección del grupo no la pisa).

## UX Design

### Wireframe textual

Sin pantallas nuevas: la sección Nota de los detalles de entrevista y captura conserva su layout
(SPEC-017/029). El único cambio de comportamiento es el valor inicial del Select de note-template
ya existente (aria-label «Note-template»).

### Componentes shadcn utilizados

Componentes: Select (existente en `NoteSection`). Sin componentes nuevos.

### data-testid

Sin data-testid adicionales: el Select existente es localizable por `aria-label` «Note-template» y
los botones por texto («Generar nota», «Regenerar»).

### Patrón de interacción

- Preselección inteligente sin quitar control al usuario (el Select sigue siendo editable y su
  elección manual manda) — regla 5.4/6 del design system: defaults útiles, nunca bloqueos.
- Sin cambios de flujo: Generar/Regenerar/AlertDialog de SPEC-017 intactos.

### Comportamiento responsive

Sin cambios (hereda el de `NoteSection`).

## Notas técnicas

- `NoteSection` recibe la entrevista (prop existente): con `interview.interviewGroupId` no null,
  resolver el grupo vía `window.api.db.getInterviewGroup` (envelope; fallo → tratar como sin
  grupo) y usar su `noteTemplateId` como preselección si está en la lista de templates cargada
  (si el id no resuelve en la lista → fallback al primero).
- La preselección solo aplica mientras el usuario no haya elegido manualmente (estado
  `selectedTemplateId` vacío = sin elección manual, patrón actual `effectiveTemplateId`).
- La captura (`/captures/:id`) usa la misma `NoteSection`: con `interviewGroupId` null no hay
  llamada extra (cero coste en el flujo de capturas).
- Sin cambios en `noteService` (ya recibe `noteTemplateId` explícito por IPC).

## Decisiones asumidas

- [¿Indicador visual de «template del grupo»?] → asumido NO (alternativa: Badge junto al Select).
  Criterio: el valor preseleccionado ya comunica el default; un Badge añade ruido a una sección
  cargada y ningún AC del draft lo pide.
- [¿Persistir el override elegido para futuras regeneraciones de esa entrevista?] → asumido NO
  (alternativa: guardar el último template usado en la entrevista). Criterio: el draft pide «se
  pueden volver a generar seleccionando otro template para esta entrevista en particular» — es una
  elección puntual de la acción de regenerar; persistirla requeriría campo nuevo en el modelo
  (fuera del alcance v3 congelado en SPEC-043).
