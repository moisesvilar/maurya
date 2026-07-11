# SPEC-029 — Edición markdown por defecto en Nota y Guión

> Requisito origen: petición directa del humano (2026-07-11), sección «Edición markdown por
> defecto» de `docs/drafts/improvements-20260711.md` (checklist H9, ítem 2). Traza a RF-NOTE-004
> (consulta y edición del resumen) y RF-GUION-005 (editar guión y objetivos).
> Relacionadas: SPEC-027 (editor WYSIWYG + pestañas Notas/Guión, base directa), SPEC-017 (sección
> Nota), SPEC-014 (sección Guión y edición de objetivos), SPEC-025 (los objetivos en lectura viven
> en ObjectivesSection).

## Descripción

La Nota y el Guión dejan de tener modo lectura separado: el editor WYSIWYG se muestra
directamente, siempre visible y editable, sin pasar por un botón «Editar». Los botones «Guardar»
y «Descartar» solo aparecen cuando hay cambios respecto al contenido persistido. Las acciones
«Exportar», «Ver transcripción» y «Regenerar» están siempre visibles, y el botón «Regenerar»
queda unificado en diseño y texto entre ambas secciones.

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
- No hay cambios de datos en esta spec: es una reorganización de la interacción de edición en el
  renderer. Los canales IPC y las entidades existentes no cambian.

## Criterios de aceptación

### Nota — edición siempre activa

- GIVEN una entrevista con nota WHEN se abre su detalle THEN la sección Nota muestra directamente el editor WYSIWYG con el contenido de la nota, editable, sin botón "Editar" y sin botones "Guardar"/"Descartar" visibles.
- GIVEN el editor de la nota sin cambios WHEN el usuario escribe una modificación THEN aparecen los botones "Guardar" (default) y "Descartar" (outline) en la barra inferior de la sección.
- GIVEN el editor de la nota con cambios WHEN el usuario deshace sus cambios hasta igualar el contenido persistido THEN los botones "Guardar" y "Descartar" desaparecen.
- GIVEN cambios sin guardar en la nota WHEN el usuario pulsa "Guardar" THEN la nota se persiste, aparece el Toast "Nota guardada" y los botones "Guardar"/"Descartar" desaparecen manteniéndose el editor visible con el contenido guardado.
- GIVEN cambios sin guardar en la nota WHEN el usuario pulsa "Descartar" THEN aparece el AlertDialog "Descartar cambios" (Cancelar + "Descartar" destructive); al confirmar, el editor restaura el contenido persistido y los botones desaparecen.
- GIVEN un fallo de persistencia al guardar la nota WHEN el usuario pulsa "Guardar" THEN aparece un Toast de error y el editor conserva los cambios con los botones visibles.

### Nota — acciones siempre visibles

- GIVEN una entrevista con nota WHEN se muestra la sección THEN la cabecera presenta siempre "Exportar" (DropdownMenu), "Ver transcripción" (si hay transcripción) y "Regenerar", incluso mientras hay cambios sin guardar en el editor.
- GIVEN cambios sin guardar en el editor de la nota WHEN el usuario pulsa "Regenerar" y confirma el AlertDialog THEN la nota regenerada sustituye el contenido del editor y los botones "Guardar"/"Descartar" desaparecen.

### Guión — edición siempre activa

- GIVEN una entrevista con guión WHEN se abre su detalle THEN la sección Guión muestra directamente el editor WYSIWYG con el guión y, debajo, la lista editable de objetivos (Input por objetivo + "Añadir objetivo"/"Eliminar objetivo"), sin botón "Editar".
- GIVEN el guión y los objetivos sin cambios WHEN el usuario modifica el texto del guión o cualquier objetivo (texto, alta o baja) THEN aparecen los botones "Guardar" y "Descartar" en la barra inferior de la sección.
- GIVEN cambios sin guardar en el guión u objetivos WHEN el usuario pulsa "Guardar" THEN se persisten guión y objetivos (los objetivos vacíos se descartan silenciosamente), aparece el Toast "Cambios guardados" y los botones desaparecen.
- GIVEN cambios sin guardar en el guión u objetivos WHEN el usuario pulsa "Descartar" THEN aparece el AlertDialog "Descartar cambios"; al confirmar, editor y lista de objetivos restauran los valores persistidos y los botones desaparecen.
- GIVEN un fallo de persistencia al guardar el guión WHEN el usuario pulsa "Guardar" THEN aparece un Toast de error y el editor conserva los cambios con los botones visibles.
- GIVEN la sección Guión WHEN se muestra con guión existente THEN el botón de la cabecera se llama "Regenerar", con el mismo variant, icono y posición que el "Regenerar" de la Nota, siempre visible (deshabilitado con Tooltip si faltan template o clave).

### Sincronización con el resto del detalle

- GIVEN una edición de objetivos guardada desde la sección Guión WHEN se guarda THEN la sección "Objetivos" superior refleja la lista actualizada sin recargar la página (comportamiento SPEC-025 intacto).
- GIVEN la vista con pestañas Notas/Guión (nota y guión coexisten) WHEN el usuario cambia de pestaña con cambios sin guardar y vuelve THEN el borrador se conserva y los botones "Guardar"/"Descartar" siguen visibles (comportamiento SPEC-027 intacto).
- GIVEN una entrevista sin nota WHEN se muestra la sección Nota THEN los controles de generación (select de note-template + "Generar nota") no cambian respecto al comportamiento actual.
- GIVEN una entrevista sin guión WHEN se muestra la sección Guión THEN el empty state y el botón "Generar guión" no cambian respecto al comportamiento actual.

> Derogaciones (edición siempre activa):
>
> - El AC de SPEC-017 "GIVEN una entrevista con nota WHEN se abre su detalle THEN la sección Nota
>   muestra el contenido de la nota en modo lectura con los botones 'Editar' y 'Exportar' y el
>   botón 'Regenerar nota'" queda obsoleto y debe entenderse derogado: no hay modo lectura ni
>   botón "Editar"; las acciones de cabecera las definen los ACs de esta spec.
> - Los ACs de SPEC-017 "GIVEN la nota en modo lectura WHEN el usuario pulsa 'Editar' THEN el
>   contenido pasa a un editor…" y "GIVEN el editor sin cambios WHEN el usuario pulsa 'Descartar'
>   THEN se vuelve a modo lectura directamente, sin AlertDialog" quedan obsoletos y deben
>   entenderse derogados (sin cambios los botones no existen; no hay modo lectura al que volver).
> - El AC de SPEC-014 "GIVEN una entrevista con guión WHEN el usuario pulsa 'Editar' THEN el guión
>   pasa a un Textarea editable y los objetivos a una lista editable…, con botones
>   Guardar/Cancelar" queda obsoleto y debe entenderse derogado: editor y lista de objetivos están
>   siempre activos y los botones pasan a "Guardar"/"Descartar" solo con cambios.
> - Los ACs de SPEC-027 "GIVEN un guión en modo lectura WHEN el usuario pulsa 'Editar'…", "GIVEN
>   el editor del guión sin cambios WHEN el usuario pulsa 'Cancelar' THEN se vuelve a modo lectura
>   directamente…", "GIVEN una nota en modo lectura WHEN el usuario pulsa 'Editar'…" y "GIVEN el
>   editor de la nota sin cambios WHEN el usuario pulsa 'Descartar' THEN se vuelve a modo lectura
>   directamente…" quedan obsoletos y deben entenderse derogados por los ACs de esta spec. El AC
>   de SPEC-027 "GIVEN un guión editado y guardado WHEN el usuario regenera… THEN el nuevo guión…
>   se muestra renderizado en modo lectura" queda obsoleto y debe entenderse derogado en su
>   desenlace: el nuevo guión se muestra en el editor. Los ACs de SPEC-027 sobre conservación de
>   borradores al cambiar de pestaña y sobre el AlertDialog con cambios NO se derogan.

## UX Design

### Wireframe textual

**Sección Nota (con nota)** (Layout 2 — Página de detalle; dentro de NoteScriptSections):

1. Cabecera: heading `h3` "Nota" a la izquierda; a la derecha, siempre visibles:
   DropdownMenu "Exportar" (Button outline, icono Download; ítems "Exportar nota (.md)" y, con
   transcripción, "Exportar transcripción (.md)") · Button outline "Ver transcripción" (icono
   FileText, solo con transcripción) · Button outline "Regenerar" (icono RefreshCw; deshabilitado
   con Tooltip explicativo si faltan transcripción/template/clave; en curso: Loader2 +
   "Generando nota…").
2. Select de note-template (sin cambios, cuando aplica).
3. Editor WYSIWYG (MarkdownEditor) siempre montado con el contenido persistido de la nota.
4. Barra inferior sticky **solo con cambios**: Button "Descartar" (outline) a la izquierda del
   Button "Guardar" (default; Loader2 mientras persiste).

**Sección Guión (con guión)**:

1. Cabecera: heading `h3` "Guión" a la izquierda; a la derecha, siempre visible: Button outline
   "Regenerar" (icono RefreshCw, idéntico en variant/icono/posición al de la Nota; deshabilitado
   con Tooltip si faltan template o clave; en curso: Loader2 + "Generando guión…").
2. Editor WYSIWYG (MarkdownEditor) siempre montado con el guión persistido.
3. Bloque "Objetivos" (heading `h4`) siempre visible debajo del editor: fila por objetivo (Input +
   Button ghost icon Trash2 aria-label "Eliminar objetivo") + Button outline (Plus) "Añadir
   objetivo" (estructura SPEC-014 sin cambios).
4. Barra inferior sticky **solo con cambios** (guión u objetivos): "Descartar" (outline) +
   "Guardar" (default).

**Estados sin contenido** (nota inexistente / guión inexistente): sin cambios respecto a
SPEC-017/SPEC-014 (controles de generación y empty state actuales).

**AlertDialogs**: "Descartar cambios" (Cancelar + "Descartar" destructive) en ambas secciones;
"Regenerar nota"/"Regenerar guión" sin cambios.

### Componentes shadcn utilizados

Componentes: Button, DropdownMenu, Select, Tooltip, AlertDialog, Skeleton, Alert, Input, Toast
(sonner, ya global), Tabs (disposición SPEC-027 sin cambios). Editor: MarkdownEditor/MarkdownView
existentes (components/markdown/). Iconos Lucide: Download, FileText, RefreshCw, Loader2,
Sparkles, Plus, Trash2. Sin componentes adicionales no instalados. El icono Pencil deja de usarse
en estas dos cabeceras.

### data-testid

- `note-markdown-editor` / `script-markdown-editor` — (ya existen) los editores WYSIWYG, ahora
  siempre montados cuando hay nota/guión.
- `note-editor-actions` — la barra Guardar/Descartar de la Nota (presente solo con cambios).
- `script-editor-actions` — la barra Guardar/Descartar del Guión (presente solo con cambios).
- `note-regenerate-button` — el botón "Regenerar" de la Nota.
- `script-regenerate-button` — el botón "Regenerar" del Guión.

(Los dos "Regenerar" comparten nombre accesible y pueden coexistir montados en las pestañas con
forceMount — el testid desambigua.) El resto de elementos (Guardar, Descartar, Exportar,
AlertDialogs, Toasts) son localizables por role/name dentro de su sección.

### Patrón de interacción

- **Edición inline siempre activa con Guardar/Descartar top-visible al ensuciarse**: aplica el
  patrón "Top-right / detalle en modo edición inline" (§5.3) llevado a barra inferior sticky ya
  existente (SPEC-017/027); la aparición condicionada a cambios evita botones muertos y sigue la
  convención actual del dirty-check contra el string persistido (SPEC-027: el editor solo emite
  onChange en ediciones reales, sin falsos positivos de normalización).
- **"Descartar" siempre con AlertDialog**: como los botones solo existen con cambios, pulsarlo
  siempre implica perder trabajo → confirmación obligatoria (§6.3, acción irreversible). El caso
  "sin cambios, sin AlertDialog" de SPEC-017/027 desaparece por construcción.
- **Acciones de cabecera persistentes**: Exportar/Ver transcripción/Regenerar ya no dependen del
  modo (requisito literal); sus prerrequisitos se comunican con disabled + Tooltip (§5.4).
- **Unificación de "Regenerar"**: mismo label ("Regenerar"), variant (outline), icono (RefreshCw)
  y posición (extremo derecho de la cabecera de sección) en Nota y Guión; el ghost "Regenerar
  nota" de SPEC-017 se sustituye. AlertDialog previo en ambos (ya existente) por ser
  destructivo (§6.3).
- **Los objetivos se editan siempre en el Guión** (estructura SPEC-014): la sección superior
  "Objetivos" (SPEC-025) sigue siendo la vista de estado con iconos, y el bloque del Guión la
  única superficie de edición. Decisión no cubierta por el design system: dos representaciones de
  los objetivos visibles a la vez de forma permanente; se resuelve manteniéndolas porque cumplen
  roles distintos (estado/cumplimiento arriba, edición junto al guión) y era el comportamiento ya
  aceptado del modo edición.

### Comportamiento responsive

- **Mobile (< md):** las acciones de cabecera hacen wrap bajo el heading si no caben (nunca se
  oculta la acción primaria, §9.2); la barra Guardar/Descartar sticky permanece accesible; el
  editor ocupa el ancho completo.
- **Tablet (md-lg):** interpolado entre mobile y desktop.
- **Desktop (lg+):** layout completo del wireframe.

## Notas técnicas

- Sin cambios de datos ni de canales IPC: `db.updateNote`, `db.updateInterview`,
  `llm.generateNote`, `llm.generateScript` y `notes:export` se usan tal cual.
- El editor debe **resincronizarse con el contenido persistido cuando este cambia desde fuera**
  (regeneración con éxito, descarte confirmado): remontar el MarkdownEditor con el nuevo
  contenido (p. ej. keyed por el string persistido o mecanismo equivalente) sin acumular
  instancias. Tras "Guardar", NO remontar: el contenido del editor ya es el persistido y el foco
  y caret del usuario no deben perderse.
- El dirty-check del Guión combina el markdown del editor y la lista de objetivos (mismo criterio
  `isDirty` actual); el de la Nota, solo el markdown.
- La invariante de SPEC-025/028 (cambiar `objectives` descarta evaluación y marcas manuales) no
  cambia: guardar desde el Guión con objetivos modificados seguirá descartándolas — comportamiento
  ya especificado, no lo re-especifica esta spec.

## Decisiones asumidas

- "Descartar" con cambios siempre pide AlertDialog → asumido (el botón solo existe con cambios;
  el camino "sin cambios → volver sin diálogo" desaparece por construcción). Alternativa:
  descartar directo sin confirmación. Regla: §6.3 (perder trabajo es irreversible).
- La lista editable de objetivos del Guión pasa a estar siempre visible bajo el editor → asumido
  (era parte del modo edición de SPEC-014 y es la única superficie de edición de objetivos;
  RF-GUION-005 exige poder editarlos). Alternativa: mover la edición de objetivos a la sección
  "Objetivos" superior — cambio de producto no pedido.
- Label unificado "Regenerar" (no "Regenerar nota") con variant outline en ambas secciones →
  asumido por el literal "unificarás el botón Regenerar entre este botón del Guión y el de la
  Nota" tomando como base el diseño del Guión (outline, ya llamado "Regenerar"). Alternativa:
  unificar hacia el ghost "Regenerar nota".
- "Exportar" y "Ver transcripción" siempre visibles se interpreta dentro de su aplicabilidad
  (Exportar requiere nota; Ver transcripción requiere transcripción): lo que elimina esta spec es
  su ocultación por estado de edición. Alternativa: mostrarlos deshabilitados también sin
  nota/transcripción — ruido sin acción posible.
- Tras "Guardar" el editor mantiene foco y contenido (sin remontar ni volver a ninguna vista) →
  asumido: no existe modo lectura al que volver. Alternativa: remontar el editor (perdería caret).
- El Tooltip de prerrequisitos del "Regenerar" del Guión (hoy sin Tooltip, solo disabled) se
  añade para igualar el patrón de la Nota (§5.4: disabled siempre con Tooltip explicativo).
