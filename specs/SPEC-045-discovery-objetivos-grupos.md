# SPEC-045 — Discoveries con objetivos y grupos de entrevistas

> Origen: ítem 3 de H11 en `docs/checklist.md` (RF-DISC-008, RF-DISC-009), draft
> `docs/drafts/company-contact-entities-20260716.md`. Depende de SPEC-043 (modelo v3:
> `Discovery.objectives` e `InterviewGroup` ya persistidos con CRUD IPC) y de SPEC-044 (el detalle
> de discovery quedó vacío tras retirar la sección Empresas). Los grupos aún no contienen
> entrevistas en la UI: eso llega en H11.4.

## Descripción

El discovery gana un campo de objetivos (texto libre) visible y editable, y su detalle pasa a
organizar el trabajo en «Grupos de entrevistas»: cada grupo tiene nombre, un objetivo propio, un
template de preguntas que se aplicará a todas sus entrevistas y un template de notas por defecto.
Esta spec cubre el CRUD completo de ambos (discovery con objetivos, grupos dentro del detalle);
la creación de entrevistas dentro de un grupo es de la siguiente spec del hito.

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
proyecto no hay Supabase y esta spec NO cambia el schema (`db.json` sigue en v3; el CRUD de grupos
por IPC existe desde SPEC-043).
- El listado de discoveries y su Dialog (`DiscoveryNameDialog`) **se evolucionan, no se
reimplementan**; los grupos reutilizan los patrones existentes (List + DropdownMenu + Dialogs a
nivel de página).

## Criterios de aceptación

### Objetivos del discovery (listado y Dialog)

- GIVEN el listado de discoveries WHEN se pulsa «Nuevo discovery» THEN el Dialog muestra los campos Nombre (Input, requerido) y Objetivos (Textarea, opcional) y al crear con ambos se persiste el discovery con sus objetivos y aparece el Toast de creación.
- GIVEN el Dialog con nombre vacío WHEN se pulsa «Crear» THEN se muestra el error inline «Campo requerido» y no se crea nada.
- GIVEN un discovery existente WHEN se elige «Editar» en su menú de fila THEN el Dialog abre precargado con nombre y objetivos y al guardar los cambios se persisten con Toast.
- GIVEN un discovery WHEN se elige «Eliminar» THEN el AlertDialog describe la cascada v3 — se eliminarán permanentemente el discovery, sus grupos y sus entrevistas con sus notas, y las empresas y contactos se conservarán — y al confirmar desaparece con Toast.

### Objetivos del discovery (detalle)

- GIVEN el detalle de un discovery con objetivos WHEN se renderiza THEN bajo el h1 del nombre se muestra la sección «Objetivos» con el texto tal cual.
- GIVEN el detalle de un discovery sin objetivos WHEN se renderiza THEN la sección «Objetivos» muestra el mensaje muted «Aún no hay objetivos» junto al botón de edición.
- GIVEN el detalle WHEN se pulsa «Editar» en la cabecera THEN se abre el mismo Dialog de discovery (nombre + objetivos) precargado y al guardar el detalle refleja los cambios con Toast.

### Grupos de entrevistas — listado y creación

- GIVEN el detalle de un discovery con grupos WHEN se renderiza la sección «Grupos de entrevistas» THEN se listan sus grupos, cada fila con: nombre, objetivo del grupo truncado a una línea si existe, y los nombres de los templates asignados («Sin template de preguntas» / «Sin template de notas» como texto muted si faltan).
- GIVEN la sección de grupos WHEN se pulsa «Nuevo grupo» THEN se abre un Dialog con: Nombre (Input, requerido), Objetivo (Textarea, opcional), Template de preguntas (Select opcional, opciones = templates de entrevista con su fase, default «Sin template») y Template de notas (Select opcional, opciones = note-templates, default «Sin template»).
- GIVEN el Dialog de grupo con nombre vacío WHEN se pulsa «Crear» THEN se muestra el error inline «Campo requerido» y no se crea nada.
- GIVEN el Dialog de grupo válido WHEN se pulsa «Crear» THEN el grupo se crea en el discovery con los templates elegidos (o null), aparece en el listado y se muestra Toast «Grupo creado».
- GIVEN cero grupos en el discovery WHEN se renderiza la sección THEN se muestra un empty state con icono, texto «Aún no hay grupos de entrevistas» y botón «Crear primer grupo».

### Grupos de entrevistas — edición y borrado

- GIVEN un grupo WHEN se elige «Editar» en su menú de fila THEN el mismo Dialog abre precargado (nombre, objetivo, ambos templates) y al guardar los cambios se reflejan en la fila con Toast.
- GIVEN un grupo WHEN se elige «Eliminar» THEN el AlertDialog «Eliminar grupo» avisa de que sus entrevistas se conservarán sin grupo, y al confirmar el grupo desaparece con Toast.
- GIVEN un template de entrevista o de notas borrado desde su propia gestión WHEN se vuelve al detalle del discovery THEN la fila del grupo muestra el hueco correspondiente como «Sin template …» (SET NULL de SPEC-043, sin crash).

### Estados de la sección de grupos

- GIVEN el detalle cargando los grupos WHEN aún no hay respuesta THEN se muestran Skeletons de fila en la sección.
- GIVEN un fallo del bridge al listar los grupos WHEN se renderiza la sección THEN se muestra el mensaje de error muted del envelope.

## UX Design

### Wireframe textual

**Pantalla 1 — `/discoveries` (Layout 1 — Estándar, existente):**

- Sin cambios de estructura. El Dialog `DiscoveryNameDialog` evoluciona: bajo el Input «Nombre», campo nuevo «Objetivos» (Textarea, 4 filas, placeholder «¿Qué quieres aprender con este discovery?», opcional, sin validación). El AlertDialog de borrado cambia su descripción a la cascada v3 (ver AC).

**Pantalla 2 — `/discoveries/:id` (Layout 2 — Detalle):**

- Back button ghost «Volver» → `/discoveries` (existente).
- Cabecera: h1 con el nombre a la izquierda; Button (variant outline, icono Pencil) «Editar» a la derecha del h1 (patrón cabecera de CompanyDetailPage).
- Sección «Objetivos» (h3): texto de los objetivos en `text-sm` con saltos de línea respetados (`whitespace-pre-wrap`); si null/vacío → «Aún no hay objetivos» muted.
- Sección «Grupos de entrevistas» (h3) con Button (variant default, icono Plus) «Nuevo grupo» a la derecha del heading (patrón sección Empresas de SPEC-011):
  - List (ul divide-y, borde redondeado): por fila → columna principal con nombre (`text-sm font-medium`) y debajo, en una línea muted truncada (`truncate`), el objetivo del grupo si existe; columna de refs con «{template de preguntas | Sin template de preguntas} · {template de notas | Sin template de notas}» en muted; a la derecha DropdownMenu ⋯ («Editar» · separator · «Eliminar» destructive).
  - Empty state centrado: icono `Layers` 24px muted, «Aún no hay grupos de entrevistas», Button «Crear primer grupo».
  - Error: mensaje muted centrado. Loading: 3 Skeletons h-12.
- Dialog «Nuevo grupo» / «Editar grupo» (4 campos → Dialog, regla 4.1): Nombre (Input requerido, foco inicial), Objetivo (Textarea 3 filas, opcional), Template de preguntas (Select con item «Sin template» + templates con etiqueta «{nombre} — {fase}» como el Dialog de entrevista), Template de notas (Select con item «Sin template» + note-templates por nombre). Footer: Cancelar (outline) + Crear/Guardar (default).

### Componentes shadcn utilizados

Componentes: Button, Dialog, AlertDialog, DropdownMenu, Input, Textarea, Select, Toast (sonner), Skeleton. Todos instalados.

### data-testid

- `discovery-objectives-textarea` — el Textarea de objetivos del Dialog de discovery.
- `discovery-objectives` — el contenedor del texto de objetivos en el detalle.
- `interview-groups-list` — la List de grupos.
- `group-row-actions` — el trigger del DropdownMenu de cada fila de grupo.
- `group-form-dialog` — el content del Dialog de grupo.
- `group-interview-template-select` / `group-note-template-select` — los dos Selects del Dialog de grupo.

### Patrón de interacción

- Formularios en Dialog: discovery 2 campos, grupo 4 campos (≤4, regla 4.1 — no Sheet).
- List para grupos (2 datos + refs, sin sorting; volumen decenas → sin paginación, reglas 4.2/7.1).
- AlertDialog antes de borrar con consecuencia explícita v3 (regla 6.3); Toast tras cada mutación (6.1); validación inline on submit (5.1); Selects opcionales con item «Sin template» (sentinel, patrón InterviewFormDialog).
- Dialogs a nivel de página fuera del DropdownMenu con apertura diferida `setTimeout(0)` (patrón del repo).

### Comportamiento responsive

- **Mobile (< md):** columna de refs de templates bajo el nombre (stack vertical); Dialogs a ancho completo. Botón «Nuevo grupo» a ancho completo bajo el heading.
- **Tablet (md-lg):** interpolado entre mobile y desktop.
- **Desktop (lg+):** layout completo del wireframe.

## Notas técnicas

- Datos: todo existe desde SPEC-043 — `window.api.db.{create,list,get,update,delete}InterviewGroup`,
  `CreateDiscoveryInput.objectives`, `UpdateDiscoveryPatch.objectives`. Sin cambios en main/preload.
- Hook nuevo `useInterviewGroups(discoveryId)` siguiendo el patrón de `useCompanies` (estado
  loading/error/ready + mutaciones con Toast dentro del hook).
- `DiscoveryNameDialog` pasa a manejar `{ name, objectives }`; `useDiscoveries` propaga el campo en
  create/update. Al guardar objetivos vacíos o solo espacios se persiste `null` (normalización en el
  submit del Dialog).
- Las filas de grupo NO navegan todavía (el detalle del grupo con sus entrevistas es H11.4).
- Derogaciones: SPEC-010 (Dialog de discovery solo-nombre y texto del AlertDialog con cascada de
  empresas). Sus tests se adaptan como evolución presupuestada.

## Decisiones asumidas

- [¿Los objetivos del discovery se editan inline en el detalle o vía Dialog?] → asumido Dialog
  compartido con el listado (alternativa: edición inline tipo SPEC-042). Criterio: un solo punto de
  edición para 2 campos (regla 4.1); la edición inline multiplica superficies para un campo de
  texto libre poco cambiante.
- [¿Icono del empty state de grupos?] → asumido `Layers` de Lucide (alternativa: `FolderOpen`).
  Criterio: representa agrupación; no colisiona con los iconos ya usados en el sidebar.
- [¿Las filas de grupo navegan a un detalle?] → asumido NO en esta spec (alternativa: página de
  detalle vacía). Criterio: el detalle del grupo solo tiene sentido con entrevistas (H11.4); una
  página vacía transicional no aporta.
- [Etiqueta de los templates en los Selects] → asumido reutilizar el formato del Dialog de
  entrevista («{nombre} — {fase}» para los de preguntas; nombre a secas para los de notas).
  Criterio: consistencia con SPEC-013.
