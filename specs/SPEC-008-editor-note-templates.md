# SPEC-008 — Editor de plantillas de notas (note-templates)

> Requisito origen: RF-APP-004 (Must) · Hito H1 ítem 5 · Checklist: "Editor de note-templates (contexto + secciones, como note-template-sample.md)"
> Relacionados: SPEC-006 (entidad `NoteTemplate` y `api.db` ya existen), SPEC-007 (página de Ajustes donde se integra), RF-NOTE-001 (H6 consumirá estas plantillas para generar el resumen), docs/note-template-sample.md (ejemplo de referencia)
> Naturaleza: feature de producto con UI.

## Descripción

Permite al usuario crear, editar y eliminar sus plantillas de notas: el molde con el que el LLM redactará el resumen de cada entrevista (H6). Una plantilla tiene un nombre, un contexto (instrucciones generales de extracción, como el preámbulo de note-template-sample.md) y una lista ordenada de secciones (título + descripción de qué debe contener). Se gestiona desde Ajustes, que pasa a tener navegación por pestañas.

## Alcance de implementación

- Esta spec define **únicamente el código de producción** que debe entregarse: UI (componentes, páginas, estados), datos (queries, mutations, schema si aplica) y lógica de negocio asociada.
- **Los tests automatizados están fuera del alcance del implementador.** No se deben escribir tests unitarios (Vitest / Testing Library) ni tests end-to-end (Playwright) como parte de esta entrega. Los tests los genera la skill `/somo-qa-dev` y los ejecuta `/somo-qa-tester` contra el código ya pusheado, en un paso posterior del pipeline de QA de SOMO. Cualquier test que el implementador entregue será descartado o reemplazado.
- Si la spec requiere algún ajuste de schema, migración Supabase o cambio de RLS, se indica explícitamente en "Notas técnicas". Si no se indica, no hay cambios de infraestructura. **Sin Supabase**; la persistencia es la de SPEC-006 (sin cambios de esquema).
- **Matiz:** sin drag & drop (reordenación con botones subir/bajar); sin duplicar plantillas ni biblioteca compartida (exclusión #7 del PRD). El consumo por el LLM es H6.

## Criterios de aceptación

### Navegación (Ajustes con pestañas)

- GIVEN la página de Ajustes WHEN carga THEN muestra dos pestañas: "Claves de IA" (activa por defecto) y "Plantillas de notas".
- GIVEN la pestaña "Plantillas de notas" WHEN el usuario la selecciona THEN se muestra el listado de plantillas sin recargar la página.

### Listado

- GIVEN plantillas existentes WHEN se muestra el listado THEN cada fila presenta el nombre y el número de secciones ("6 secciones"), con las acciones Editar y Eliminar.
- GIVEN ninguna plantilla WHEN se muestra el listado THEN aparece el empty state con icono, el texto "Aún no hay plantillas de notas" y el botón "Crear primera plantilla".
- GIVEN el listado cargando WHEN tarda THEN se muestran Skeletons en el área de la lista.
- GIVEN el bridge devuelve error al listar WHEN se muestra el listado THEN aparece el error state con mensaje y botón "Reintentar".

### Creación

- GIVEN el listado WHEN el usuario pulsa "Nueva plantilla" THEN navega al editor vacío (página propia) con una sección inicial en blanco.
- GIVEN el editor con nombre "Problem Discovery", un contexto y dos secciones tituladas WHEN el usuario pulsa "Guardar" THEN se persiste, aparece el Toast "Plantilla creada" y se vuelve al listado donde figura la nueva plantilla.

### Edición

- GIVEN una plantilla existente WHEN el usuario pulsa Editar THEN el editor se abre precargado con nombre, contexto y secciones en su orden.
- GIVEN el editor precargado WHEN el usuario cambia el título de una sección y pulsa "Guardar" THEN se persiste, aparece el Toast "Cambios guardados" y el listado refleja el cambio.

### Secciones (dentro del editor)

- GIVEN el editor WHEN el usuario pulsa "Añadir sección" THEN se añade una sección vacía al final con el foco en su campo de título.
- GIVEN una sección intermedia WHEN el usuario pulsa su botón subir (aria-label "Subir sección") THEN intercambia posición con la anterior; el botón subir de la primera y el bajar de la última están deshabilitados con Tooltip.
- GIVEN una plantilla con dos secciones WHEN el usuario pulsa el botón eliminar de una sección (aria-label "Eliminar sección") THEN la sección desaparece sin confirmación (es recuperable no guardando).
- GIVEN una única sección WHEN el usuario intenta eliminarla THEN el botón está deshabilitado con Tooltip "La plantilla necesita al menos una sección".

### Validación

- GIVEN el editor con el nombre vacío WHEN el usuario pulsa "Guardar" THEN error inline "Campo requerido" bajo el nombre y no se persiste.
- GIVEN una sección con título vacío WHEN el usuario pulsa "Guardar" THEN error inline "Campo requerido" bajo ese título y no se persiste.
- GIVEN el contexto vacío WHEN el usuario pulsa "Guardar" con el resto válido THEN se guarda igualmente (el contexto es opcional).

### Cancelación (edge)

- GIVEN el editor con cambios sin guardar WHEN el usuario pulsa "Volver" THEN se muestra un AlertDialog "Descartar cambios" (Cancelar outline / Descartar destructive); confirmar descarta y vuelve al listado.
- GIVEN el editor sin cambios WHEN el usuario pulsa "Volver" THEN vuelve al listado directamente sin diálogo.

### Eliminación

- GIVEN el listado WHEN el usuario pulsa Eliminar en una plantilla THEN AlertDialog "Eliminar plantilla" con la consecuencia explícita ("Se eliminará permanentemente la plantilla «nombre»") y botones Cancelar (outline) / Eliminar (destructive).
- GIVEN el AlertDialog WHEN el usuario confirma THEN la plantilla desaparece del listado y aparece el Toast "Plantilla eliminada".

## UX Design

### Wireframe textual

**Página de Ajustes** (`/settings`) — pasa a **Layout 4 — Settings**: se mantiene el back button "Volver" y el `h1` "Ajustes"; debajo, **Tabs** horizontales: "Claves de IA" (contenido actual de SPEC-007, intacto) y "Plantillas de notas".

**Pestaña "Plantillas de notas"** (listado):

1. Fila superior: descripción `muted` ("Moldes con los que se redactará el resumen de cada entrevista") a la izquierda, Button (variant `default`, icono Plus) "Nueva plantilla" a la derecha.
2. **List** (no Table: 2 datos por ítem, lectura secuencial): cada fila con nombre (texto medio) + `muted` "N secciones", y a la derecha dos acciones inline: Button ghost icono Pencil (aria-label "Editar plantilla") y Button ghost icono Trash2 `text-destructive` (aria-label "Eliminar plantilla").
3. Empty state centrado: icono FileText, "Aún no hay plantillas de notas", Button "Crear primera plantilla".
4. Error state centrado: icono AlertTriangle, mensaje, Button outline "Reintentar".

**Editor de plantilla** (`/settings/note-templates/new` y `/settings/note-templates/:id`) — **Layout 3 — Formulario** (max-width 640-768px):

1. Back button ghost ArrowLeft "Volver" (con guard de cambios sin guardar).
2. `h1`: "Nueva plantilla" / "Editar plantilla".
3. Campo **Nombre**: label + Input (placeholder "Problem Discovery").
4. Campo **Contexto**: label + Textarea alto (~6 filas, placeholder "Instrucciones generales: qué extraer, qué distinguir, a qué prestar atención…") + ayuda `muted` "Opcional. Se antepone a las secciones al generar la nota."
5. **Secciones** (heading `h3`): lista de cards ligeras, cada una con: fila de acciones a la derecha (Button ghost icon ChevronUp aria-label "Subir sección", ChevronDown "Bajar sección", Trash2 "Eliminar sección"), campo Título (Input) y campo Descripción (Textarea ~3 filas, placeholder "Qué debe contener esta sección…").
6. Button (variant `outline`, icono Plus) "Añadir sección" bajo la lista.
7. **Sticky bottom bar**: "Cancelar" (outline, mismo guard que Volver) a la izquierda, "Guardar" (default) a la derecha.

### Componentes shadcn utilizados

Ya instalados: `Button`, `Input`, `Badge`, `Tooltip`, `AlertDialog`, `Toast/sonner`, `Alert`, `Skeleton`, `Tabs`*, `Textarea`*, `Card`*.

*Componentes a instalar con CLI: `Tabs`, `Textarea`, `Card` (no están en el scaffold actual).

### Patrón de interacción

- **Tabs en Ajustes** (Layout 4): dos áreas de configuración excluyentes y del mismo peso — regla 4.3.
- **Editor como página nueva, no Sheet/Dialog**: formulario con lista dinámica de secciones (10+ campos potenciales, >30 s de interacción) — regla 4.1.
- **List, no Table**: 1-2 datos por ítem, sin sorting — regla 4.2.
- **Acciones inline (2) en la fila, no DropdownMenu**: son exactamente dos y frecuentes; la destructiva va en ghost `text-destructive` (excepción consciente a "no destructivas inline" por ser solo dos acciones y llevar AlertDialog detrás; alternativa dropdown penalizaría la acción principal Editar). Decisión documentada.
- **AlertDialog para eliminar plantilla y para descartar cambios** (regla 6.3); eliminar una sección dentro del editor NO lleva diálogo (reversible no guardando) — coherente con "no usar AlertDialog para acciones reversibles".
- **Validación inline on submit** con mensajes literales "Campo requerido" (regla 5.1); botón Guardar siempre habilitado.
- **Toast tras crear/guardar/eliminar** con los textos literales de los ACs (regla 6.1).
- **Sticky bottom bar** en el editor (formulario con scroll — regla 5.3).
- **Botones icon-only siempre con aria-label** (regla 10/11.3).

### Comportamiento responsive

- **Desktop (lg+):** layout completo. Ventana Electron ≥720×640; el editor centra a max-width 640-768.
- **Tablet/Mobile:** no aplican (excepción documentada en SPEC-001).

## Notas técnicas

- **Persistencia:** exclusivamente `api.db.{createNoteTemplate,listNoteTemplates,updateNoteTemplate,deleteNoteTemplate}` de SPEC-006. Sin cambios en main ni en el esquema. `sections` se guarda en el orden visual del editor.
- **Rutas nuevas (HashRouter existente):** `/settings/note-templates/new`, `/settings/note-templates/:id`. La pestaña activa de Ajustes se refleja en la URL (`/settings?tab=note-templates` o sub-ruta) para que "Volver" del editor regrese a la pestaña correcta.
- **Guard de cambios sin guardar:** comparación superficial del estado del formulario contra el snapshot cargado; sin bloqueo del router más allá del click en Volver/Cancelar (no interceptar cierre de app: eso ya lo cubre el close guard global solo durante captura).
- **Errores del bridge:** los `DbResult` con `ok: false` se mapean a error state (listar) o Toast destructive (guardar/eliminar) con el `message` del error.
- **Divergencia de stack:** igual que specs previas.
