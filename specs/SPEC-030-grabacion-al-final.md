# SPEC-030 — Sección «Grabación» al final del detalle

> Requisito origen: petición directa del humano (2026-07-11), sección «Mover sección Grabación al
> final» de `docs/drafts/improvements-20260711.md` (checklist H9, ítem 3). Sin RF nuevo:
> reordenación de layout amparada por el design system §8.3 (lo menos consultado va al final).
> Relacionadas: SPEC-015 (RecordingSection), SPEC-020 (detalle de captura reutiliza la sección),
> SPEC-025 (Objetivos arriba), SPEC-027/029 (Nota/Guión).

## Descripción

La sección «Grabación» (latencia STT, rutas del WAV y del transcript, «Mostrar en Finder»,
«Nueva grabación») deja de estar entre los Objetivos y las secciones Nota/Guión y pasa al final
de la página de detalle. Una vez grabada la entrevista, esa sección es material de archivo que se
consulta poco; la nota y el guión son el contenido de trabajo y suben.

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
- Es una reordenación pura de composición en dos páginas del renderer: ningún componente de
  sección cambia por dentro, ni datos, ni IPC.

## Criterios de aceptación

### Detalle de entrevista

- GIVEN una entrevista WHEN se muestra su detalle THEN el orden de las secciones en la página es: cabecera (título, Badge, referencias), «Objetivos», Nota/Guión (NoteScriptSections) y «Grabación» en último lugar.
- GIVEN una grabación en curso en el detalle de entrevista WHEN la transcripción en vivo y el asistente están activos THEN funcionan igual que antes dentro de la sección «Grabación», ahora al final de la página.

### Detalle de captura

- GIVEN una captura WHEN se muestra su detalle THEN el orden de las secciones es: cabecera (con «Asignar empresa» si aplica), Nota/Guión (NoteScriptSections) y «Grabación» en último lugar.

### Comportamiento intacto

- GIVEN una entrevista grabada WHEN se muestra la sección «Grabación» al final THEN conserva íntegro su contenido actual (latencia STT, rutas WAV/transcript, «Mostrar en Finder», «Nueva grabación», Alert de modo degradado si aplica).
- GIVEN una acción que actualiza la entrevista desde la sección «Grabación» (asociar grabación, detener) WHEN ocurre THEN las secciones superiores (Objetivos, Nota/Guión, Badge de estado) se refrescan sin recargar, como hasta ahora.

> Derogación — la parte del AC de SPEC-025 y del wireframe de SPEC-015/SPEC-025 que fija la
> sección «Objetivos» "entre la cabecera y la sección Grabación" y la Grabación inmediatamente
> después de los Objetivos queda obsoleta y debe entenderse derogada **solo en lo relativo a la
> posición de «Grabación»**: los Objetivos siguen inmediatamente después de la cabecera; la
> Grabación pasa al final. El resto de esos ACs (contenido y comportamiento de cada sección) no
> cambia.

## UX Design

### Wireframe textual

**Detalle de entrevista** (Layout 2 — Página de detalle; solo cambia el orden):

1. Back button «Volver» + cabecera (h1 título + Badge estado + fila muted de referencias).
2. Sección «Objetivos» (sin cambios, SPEC-025/028).
3. Secciones Nota/Guión — NoteScriptSections (sin cambios, SPEC-027/029).
4. Sección «Grabación» — RecordingSection (sin cambios internos), al final.

**Detalle de captura** (Layout 2; solo cambia el orden):

1. Back button «Volver» + cabecera (h1 + Badge + referencias + botón «Asignar empresa» si no hay
   empresa).
2. Secciones Nota/Guión — NoteScriptSections (sin cambios).
3. Sección «Grabación» — RecordingSection (sin cambios internos), al final.

### Componentes shadcn utilizados

Los ya presentes en ambas páginas (Button, Badge, Skeleton, etc.); esta spec no añade ni retira
componentes.

### data-testid

Sin data-testid adicionales: el orden es assertable por la posición relativa en el DOM de los
headings existentes («Objetivos», «Grabación», «Nota»/«Guión»/pestañas), todos localizables por
role/name.

### Patrón de interacción

- **Zona inferior para lo menos consultado** (design system §8.3): tras el cierre del flujo
  end-to-end, la Grabación es historial/archivo (rutas de ficheros, métricas de latencia);
  la Nota y el Guión son el material de trabajo y ganan la posición.
- Ninguna otra interacción cambia: los flujos de grabación, transcripción en vivo y asistente
  viven donde vivían, solo que la sección se ancla al final.

### Comportamiento responsive

- **Mobile (< md):** mismo orden vertical; sin cambios respecto al comportamiento actual de cada
  sección.
- **Tablet (md-lg):** interpolado entre mobile y desktop.
- **Desktop (lg+):** layout completo del wireframe.

## Notas técnicas

- Cambio exclusivo en `InterviewDetailPage` y `CaptureDetailPage`: mover el
  `<RecordingSection …/>` después de `<NoteScriptSections …/>` (y actualizar los JSDoc de ambas
  páginas, que hoy documentan el orden antiguo). `AssignCompanySheet` en captura no es una
  sección visual (Sheet controlado): su posición en el JSX es irrelevante.
- Ningún cambio en RecordingSection, NoteScriptSections, ObjectivesSection ni en main/preload.

## Decisiones asumidas

- El cambio aplica también al detalle de captura (/captures/:id) → asumido: reutiliza las mismas
  secciones (SPEC-020, "misma experiencia") y el criterio §8.3 aplica igual; mantener órdenes
  distintos entre las dos páginas sería inconsistente. Alternativa: limitarlo al detalle de
  entrevista (literal estricto del draft, que dice "dentro de una entrevista").
- La sección queda al final también **durante** la grabación en curso (transcripción en vivo +
  asistente dentro de RecordingSection) → asumido: el requisito no distingue estados y los
  ítems 7-9 de H9 ya rediseñarán la experiencia de grabación de la Captura; introducir un orden
  condicional por estado sería complejidad no pedida. Alternativa: subir la sección solo mientras
  se graba.
