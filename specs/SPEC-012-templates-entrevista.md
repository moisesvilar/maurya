# SPEC-012 — Templates de entrevista (crear, editar, duplicar, eliminar, metadatos y fase)

> Requisitos origen: RF-TPL-001 (Must) + RF-TPL-002 (Should) + RF-TPL-003 (Should) + RF-TPL-004 (Could) · Hito H2 ítems 6-9 · Checklist: "Crear template con listado de preguntas organizable en bloques" + "Metadatos por bloque/pregunta" + "Editar/duplicar/eliminar" + "Fase metodológica"
> Relacionados: SPEC-006 (entidad InterviewTemplate con blocks/questions/guidance/phase ya persistida), SPEC-008 (patrón de editor con secciones dinámicas), SPEC-009 (hub de Plantillas — la card "Disponible próximamente" se deroga aquí), docs/interview-sample.md (ejemplo de referencia), RF-GUION-001/002 (H3 asignará y personalizará estos templates)
> Naturaleza: feature de producto con UI. **Cierra H2.**

## Descripción

Permite crear y gestionar los templates de entrevista: el cuestionario base (bloques ordenados de preguntas, como interview-sample.md) del que H3 derivará el guión personalizado de cada entrevista. Cada bloque y cada pregunta pueden llevar notas de guía (tiempo estimado, propósito, señales de alarma), y el template puede marcarse con su fase metodológica (exploratoria / problema / solución, según The Mom Test y Running Lean). Se accede desde la sección Plantillas, cuya card de entrevistas pasa a ser funcional.

## Alcance de implementación

- Esta spec define **únicamente el código de producción** que debe entregarse: UI (componentes, páginas, estados), datos (queries, mutations, schema si aplica) y lógica de negocio asociada.
- **Los tests automatizados están fuera del alcance del implementador.** No se deben escribir tests unitarios (Vitest / Testing Library) ni tests end-to-end (Playwright) como parte de esta entrega. Los tests los genera la skill `/somo-qa-dev` y los ejecuta `/somo-qa-tester` contra el código ya pusheado, en un paso posterior del pipeline de QA de SOMO. Cualquier test que el implementador entregue será descartado o reemplazado.
- Si la spec requiere algún ajuste de schema, migración Supabase o cambio de RLS, se indica explícitamente en "Notas técnicas". Si no se indica, no hay cambios de infraestructura. **Sin Supabase**; persistencia = api.db de SPEC-006 sin cambios (la entidad ya soporta todo el contrato).
- **Matiz:** sin drag & drop (botones subir/bajar, como SPEC-008); la asignación del template a entrevistas es H3; sin biblioteca compartida (exclusión #7).

## Criterios de aceptación

### Acceso y listado

- GIVEN la sección Plantillas WHEN se muestra THEN la card "Plantillas de entrevista" es funcional y navega al listado (deroga "Disponible próximamente" de SPEC-009).
- GIVEN templates existentes WHEN se muestra el listado THEN cada fila presenta el nombre, el Badge de fase si la tiene ("Exploratoria" / "Problema" / "Solución"), el resumen "N bloques · M preguntas" y el menú de acciones (aria-label "Acciones") con "Editar", "Duplicar" y, tras separador, "Eliminar".
- GIVEN ningún template WHEN se muestra el listado THEN empty state "Aún no hay plantillas de entrevista" con el botón "Crear primera plantilla".
- GIVEN el listado cargando WHEN tarda THEN Skeletons; GIVEN error del bridge THEN error state con "Reintentar".

### Creación y edición (editor)

- GIVEN el listado WHEN el usuario pulsa "Nueva plantilla" (o el CTA) THEN navega al editor vacío con un bloque inicial que contiene una pregunta en blanco.
- GIVEN el editor WHEN se muestra THEN presenta: campo Nombre, selector de Fase (opcional: "Sin fase", "Exploratoria", "Problema", "Solución"), y la lista de bloques.
- GIVEN un bloque WHEN se muestra THEN presenta: campo Título, campo Guía del bloque (Textarea opcional, placeholder sobre tiempo/propósito/señales), la lista de sus preguntas, y acciones de bloque (subir/bajar/eliminar, aria-labels "Subir bloque"/"Bajar bloque"/"Eliminar bloque").
- GIVEN una pregunta WHEN se muestra THEN presenta: campo de texto de la pregunta, campo Guía de la pregunta (Input opcional) y acciones (subir/bajar/eliminar, aria-labels "Subir pregunta"/"Bajar pregunta"/"Eliminar pregunta").
- GIVEN el editor WHEN el usuario pulsa "Añadir bloque" THEN se añade un bloque vacío al final (con una pregunta en blanco) y el foco va a su título.
- GIVEN un bloque WHEN el usuario pulsa "Añadir pregunta" THEN se añade una pregunta vacía al final del bloque con el foco en su texto.
- GIVEN bloques o preguntas WHEN el usuario usa subir/bajar THEN intercambian posición; los extremos quedan deshabilitados con Tooltip.
- GIVEN un único bloque (o una única pregunta en un bloque) WHEN el usuario intenta eliminarlo THEN el botón está deshabilitado con Tooltip ("La plantilla necesita al menos un bloque" / "El bloque necesita al menos una pregunta").
- GIVEN el editor válido WHEN el usuario guarda THEN se persiste con el orden visual exacto de bloques y preguntas, aparece el Toast "Plantilla creada" (o "Cambios guardados" en edición) y se vuelve al listado.
- GIVEN el nombre vacío, o un título de bloque vacío, o un texto de pregunta vacío WHEN el usuario guarda THEN error inline "Campo requerido" bajo cada campo afectado y no se persiste.
- GIVEN la fase "Sin fase" WHEN se guarda THEN se persiste sin fase (null) y la fila del listado no muestra Badge.
- GIVEN el editor con cambios sin guardar WHEN el usuario pulsa "Volver" o "Cancelar" THEN AlertDialog "Descartar cambios"; sin cambios, vuelve directo.
- GIVEN una plantilla existente WHEN el usuario elige Editar THEN el editor carga nombre, fase, bloques, guías y preguntas en su orden exacto.

### Duplicado

- GIVEN el menú de acciones WHEN el usuario elige "Duplicar" THEN se crea inmediatamente una copia completa (bloques, guías, preguntas, fase) con el nombre "«nombre» (copia)", aparece el Toast "Plantilla duplicada" y la copia figura en el listado.

### Eliminación

- GIVEN el menú de acciones WHEN el usuario elige "Eliminar" THEN AlertDialog "Eliminar plantilla" ("Se eliminará permanentemente la plantilla «nombre».") y confirmar la elimina con el Toast "Plantilla eliminada".

### Error de mutación

- GIVEN cualquier mutación con error del bridge WHEN falla THEN Toast de error y la UI no cambia.

## UX Design

### Wireframe textual

**Hub de Plantillas** (`/templates`, SPEC-009): la card "Plantillas de entrevista" pasa a clicable (hover, Link) → `/templates/interview`; pierde el texto "Disponible próximamente" y gana descripción corta ("Cuestionarios base para tus entrevistas").

**Listado** (`/templates/interview`) — Layout 1 dentro del shell (top bar "Plantillas"):

1. Back button ghost ArrowLeft "Volver" (→ `/templates`) — el listado es sub-página del hub.
2. Fila: descripción `muted` + Button (Plus) "Nueva plantilla".
3. **List**: nombre (font-medium) + Badge outline de fase (si existe) + `muted` "N bloques · M preguntas" + DropdownMenu ⋯: "Editar" (Pencil), "Duplicar" (Copy), separador, "Eliminar" (Trash2 destructive).
4. Empty: icono ClipboardList, "Aún no hay plantillas de entrevista", Button "Crear primera plantilla".
5. Error: AlertTriangle + mensaje + "Reintentar".

**Editor** (`/templates/interview/new` y `/templates/interview/:id`) — Layout 3 formulario (max-width 768px):

1. Back button "Volver" con guard.
2. `h1` "Nueva plantilla" / "Editar plantilla".
3. Campo **Nombre** (Input, placeholder "Entrevista de problema — MDR").
4. Campo **Fase** (Select: "Sin fase" —default—, "Exploratoria", "Problema", "Solución") con ayuda `muted` "Marco metodológico del cuestionario (The Mom Test / Running Lean)".
5. **Bloques** (heading `h3`): Card por bloque:
   - Cabecera: "Bloque N" `muted` + acciones (ChevronUp/ChevronDown/Trash2 con aria-labels de bloque).
   - Título (Input, placeholder "Contexto y sistemas (5-7 min)") + error inline.
   - Guía del bloque (Textarea 2 filas, placeholder "Propósito, tiempo, señales de alarma…").
   - **Preguntas** (lista dentro de la card): fila por pregunta — texto (Input, placeholder "¿Quién lleva hoy el regulatorio y calidad?") + error inline, Guía (Input, placeholder "Qué buscar en la respuesta…"), acciones (ChevronUp/ChevronDown/Trash2 con aria-labels de pregunta).
   - Button outline (Plus) "Añadir pregunta".
6. Button outline (Plus) "Añadir bloque".
7. **Sticky bottom bar**: Cancelar (outline, guard) / Guardar (default).

### Componentes shadcn utilizados

Ya instalados todos: `Button`, `Input`, `Textarea`, `Select`, `Card`, `Badge`, `Tooltip`, `AlertDialog`, `Dialog`, `DropdownMenu`, `Toast/sonner`, `Skeleton`. Sin instalaciones nuevas.

### Patrón de interacción

- **Editor como página** (formulario anidado de dos niveles, regla 4.1) con **sticky bottom bar** (regla 5.3).
- **Select para la fase** (4 opciones incluida "Sin fase", regla 4.4).
- **Reordenación con botones + extremos deshabilitados con Tooltip** (patrón SPEC-008; wrapper span tabIndex=0).
- **Eliminar bloque/pregunta sin confirmación** (reversible no guardando, coherente con SPEC-008); **eliminar plantilla con AlertDialog**.
- **"Duplicar" sin diálogo**: acción no destructiva e inmediatamente reversible (eliminar la copia); Toast como feedback. Decisión no cubierta por el design system, documentada aquí.
- **Validación on submit** con "Campo requerido" por campo; guard de descartar por snapshot (patrón SPEC-008).
- **Back button en listado y editor** (sub-páginas de hub — regla 2.3; el hub es la sección raíz).

### Comportamiento responsive

- **Desktop (lg+):** completo. **Tablet/Mobile:** no aplican (excepción SPEC-001).

## Notas técnicas

- **Bridge:** `api.db.{createInterviewTemplate,listInterviewTemplates,updateInterviewTemplate,deleteInterviewTemplate}` (SPEC-006; verificar si existe `getInterviewTemplate` para la precarga del editor — si no, list+find). Duplicar = `create` con la copia y nombre "«nombre» (copia)".
- **Contrato de datos:** `InterviewTemplate.blocks[] = { title, guidance (null si vacía), questions[] = { text, guidance (null si vacía) } }`; `phase: 'exploratory' | 'problem' | 'solution' | null`. Etiquetas UI: Exploratoria/Problema/Solución.
- **Editor:** uids de cliente para bloques Y preguntas (keys estables + foco direccionable, patrón SPEC-008); snapshot serializado sin uids para el guard.
- **Rutas nuevas:** `/templates/interview`, `/templates/interview/new`, `/templates/interview/:id`. Top bar sigue "Plantillas" (prefijo).
- **Regresión presupuestada en tests:** la card del hub (SPEC-009 AC-09: "Disponible próximamente", sin `<a>`) cambia a clicable → QA remapea.
- **Divergencia de stack:** igual que specs previas.
