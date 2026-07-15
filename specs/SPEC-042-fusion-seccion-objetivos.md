# SPEC-042 — Fusión de las dos secciones «Objetivos»

## Descripción

En el detalle de entrevista coexisten dos secciones «Objetivos»: la de estado (sección superior,
solo lectura, con seguimiento en vivo, evaluación y marcas manuales) y la de edición (dentro del
Guión: inputs, eliminar, añadir). Se fusionan en **una sola sección** — la superior — donde cada
objetivo son tres cosas: un **icono** que muestra en tiempo real si está cumplido (verde) o no
(color estándar), una **descripción corta editable** en el momento, y un **botón para
eliminarlo**. Se conserva añadir objetivos, la evaluación post-grabación y las marcas manuales
con comentario. El bloque de objetivos desaparece de la sección Guión.

Origen: petición humana directa (2026-07-15), §6 de
`docs/drafts/improvements-preguntas-20260715.md`. Evoluciona RF-GUION-004, RF-GUION-005 y
RF-ASIS-005.

**Derogaciones:** la superficie de edición de objetivos dentro de la sección Guión (SPEC-014
AC de edición de objetivos, mantenida por SPEC-025/029 — «el bloque de edición de objetivos
vive dentro del Guión») queda obsoleta y debe entenderse derogada. La coexistencia de dos
headings «Objetivos» documentada en el spec-test-map como regresión presupuestada desaparece.

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
- Cambio solo de renderer (`ObjectivesSection`, `ScriptSection`); main y tipos intactos (la
  persistencia usa `db.updateInterview({ objectives })` existente y su invariante).

## Criterios de aceptación

### Sección fusionada — composición

- GIVEN una entrevista con objetivos WHEN se renderiza la sección «Objetivos» THEN cada objetivo muestra: el icono de estado, un Input editable con su texto, el lápiz de cumplimiento y un botón «Eliminar objetivo».
- GIVEN una grabación en curso WHEN un evento del asistente marca un objetivo como cubierto THEN su icono pasa a cumplido (CheckCircle2 verde) en tiempo real, igual que hasta ahora.

### Edición en la sección

- GIVEN los objetivos persistidos WHEN se edita el texto de un Input THEN aparecen los botones «Guardar» y «Descartar» (ausentes sin cambios, patrón SPEC-029).
- GIVEN cambios en los objetivos WHEN se pulsa «Guardar» THEN se persisten con éxito, aparece el Toast «Objetivos guardados» y los Inputs muestran lo guardado sin botones de acción.
- GIVEN un objetivo editado a texto vacío o en blanco WHEN se guarda THEN ese objetivo se descarta de la lista persistida (comportamiento de SPEC-014 conservado).
- GIVEN cambios sin guardar WHEN se pulsa «Descartar» THEN un AlertDialog confirma y, al aceptar, los Inputs vuelven a lo persistido.
- GIVEN un objetivo WHEN se pulsa su botón «Eliminar objetivo» THEN desaparece de la lista mostrada y aparecen «Guardar»/«Descartar» (la eliminación solo se persiste al guardar).
- GIVEN la sección WHEN se pulsa «Añadir objetivo» THEN se añade un Input vacío al final de la lista.
- GIVEN una entrevista con evaluación o marcas manuales previas WHEN se guardan objetivos modificados THEN los motivos de la evaluación y las marcas manuales dejan de mostrarse (invariante de SPEC-025/028: cambiar la lista las invalida).

### Estados previos conservados

- GIVEN una entrevista con evaluación post-grabación y una marca manual WHEN se renderiza la sección THEN el motivo por objetivo, el texto reescrito de la marca y el lápiz siguen presentes y funcionales.
- GIVEN una entrevista con transcripción y sin evaluación WHEN se renderiza THEN el botón «Evaluar objetivos» sigue presente y funcional.
- GIVEN una entrevista sin objetivos WHEN se renderiza THEN el empty state «Sin objetivos» incluye el botón «Añadir objetivo» (ahora se añaden aquí).

### Sección Guión sin objetivos

- GIVEN una entrevista con guión WHEN se renderiza la sección Guión THEN ya no contiene ningún bloque «Objetivos» (ni heading, ni Inputs, ni «Añadir objetivo»).
- GIVEN una edición del guión WHEN se guarda THEN solo persiste `scriptMarkdown` y los objetivos no cambian.
- GIVEN una regeneración del guión que produce objetivos nuevos WHEN termina THEN los objetivos nuevos aparecen en la sección «Objetivos» fusionada.

## UX Design

### Wireframe textual

**Sección «Objetivos» (Layout 2 — Detalle, misma posición actual):**

- Fila de cabecera: `h3` «Objetivos» a la izquierda; a la derecha, «Evaluando objetivos…» /
  «Evaluar objetivos» (sin cambios).
- Lista (`ul`): por objetivo (`li`, `objective-item` con `data-state` actual):
  - Icono a la izquierda: CheckCircle2 verde (cumplido) / Target muted (no cumplido) — sin cambios.
  - **Input (shadcn) editable** con el texto del objetivo, `aria-label` «Objetivo N», flex-1.
  - Botón lápiz «Editar cumplimiento del objetivo» (existente, ghost icon).
  - **Botón «Eliminar objetivo»** (ghost icon, Trash2, aria-label literal).
  - Debajo del Input, cuando existan: motivo de evaluación (tachado si hay marca) y texto de la
    marca manual — sin cambios.
- Bajo la lista: Button «Añadir objetivo» (variant outline, icono Plus).
- Con cambios sin guardar: barra sticky inferior (patrón `script-editor-actions` de SPEC-029)
  con «Descartar» (outline) y «Guardar» (default, spinner al guardar).
- Empty state: icono Target + «Sin objetivos» + «Se generan con el guión o añádelos aquí» +
  Button «Añadir objetivo».

**Sección «Guión»:** igual que hoy menos el bloque completo de objetivos (h4 + Inputs +
eliminar + añadir). La barra Guardar/Descartar del guión pasa a depender solo del draft del
markdown.

### Componentes shadcn utilizados

Componentes: Button, Input, Tooltip, AlertDialog, Toast (sonner). Todos instalados.

### data-testid

- `objectives-section`, `objective-item`, `objective-reason`, `objective-override-text`,
  `objective-override-button`, `objectives-evaluate-button` — existentes, sin cambios.
- `objective-input` — el Input de cada objetivo.
- `objective-delete-button` — el botón eliminar de cada objetivo.
- `objectives-add-button` — el botón «Añadir objetivo».
- `objectives-editor-actions` — la barra sticky Guardar/Descartar de la sección.

### Patrón de interacción

- Edición inline siempre activa con Guardar/Descartar solo ante cambios: patrón «draft
  null-prístino» de SPEC-029 (dirty = draft !== null && distinto de lo persistido; guardar
  resetea el draft a null; descartar SIEMPRE con AlertDialog).
- Eliminar objetivo muta el draft, no persiste: la acción destructiva real es «Guardar», que ya
  tiene confirmación implícita (botón explícito); el AlertDialog se reserva para descartar
  cambios (regla §6.3 aplicada a la pérdida de trabajo, no a la edición reversible del draft).
- Toast «Objetivos guardados» tras persistir (regla §6.1).
- El lápiz de cumplimiento opera sobre lo PERSISTIDO (índices estables): con draft sucio sigue
  funcionando porque no reordena la lista mostrada (misma longitud salvo altas/bajas del draft,
  que solo cambian al guardar — ver Notas técnicas).

### Comportamiento responsive

- **Mobile (< md):** la fila del objetivo mantiene Input flex-1 con los dos icon-buttons a la
  derecha (sin ocultarlos); la barra sticky se mantiene.
- **Tablet (md–lg):** interpolado.
- **Desktop (lg+):** wireframe completo.

## Notas técnicas

- `ObjectivesSection` adopta el estado `objectivesDraft: string[] | null` (null = prístino) y el
  guardado de `ScriptSection` (filtra vacíos con trim, `db.updateInterview(id, { objectives })`,
  `onInterviewUpdated`); la invalidación de evaluación/marcas al cambiar la lista ya vive en el
  repositorio (SPEC-025/028) — el renderer no la reimplementa.
- El icono/motivos/lápiz se calculan sobre `interview.objectives` persistidos POR ÍNDICE; la
  lista mostrada es `draft ?? persistidos`. Con draft de longitud distinta (alta/baja sin
  guardar), los adornos por índice (icono, motivo, lápiz) se muestran solo para los índices que
  existen en lo persistido y en el draft con el mismo texto no importa: basta indexar contra la
  lista mostrada y tolerar `undefined` (los adornos de índices nuevos simplemente no existen).
- `ScriptSection` pierde `objectivesDraft`/`displayedObjectives` y el bloque JSX de objetivos;
  su `isDirty` y `handleSave` quedan solo sobre el markdown. El flujo de generación/regeneración
  no cambia (los objetivos los escribe main en la Interview y llegan por `onInterviewUpdated`).

## Decisiones asumidas

- [semántica de guardado] → asumido draft + Guardar/Descartar (patrón SPEC-029) en vez de
  auto-guardado on-blur por «editable en tiempo real»: el auto-guardado dispararía la
  invalidación de evaluación/marcas (invariante SPEC-025/028) en cada tecleo perdido, un coste
  destructivo silencioso; con Guardar explícito la invalidación es una decisión visible.
- [eliminar sin AlertDialog] → asumido que eliminar muta el draft (reversible con Descartar);
  la confirmación vive en Guardar. Alternativa: AlertDialog por eliminación, descartada por
  fricción (regla §6.3 aplica a acciones irreversibles).
- [empty state] → asumido añadir el botón «Añadir objetivo» al empty state y actualizar el hint
  a «Se generan con el guión o añádelos aquí» (el texto anterior remitía a editar el guión, que
  deja de ser cierto).
- [edición durante la grabación] → asumido que editar objetivos en vivo NO reinicia la sesión
  del asistente (sus systemBlocks se construyen al arrancar, SPEC-023): el seguimiento en vivo
  sigue sobre los índices de arranque hasta la siguiente grabación. Limitación preexistente,
  fuera de alcance.
