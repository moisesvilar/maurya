# SPEC-020 — Capturas: flujo capture-first con asignación diferida de empresa y contacto

> Origen: petición humana directa (2026-07-10), fuera del checklist. Reorganiza en un flujo nuevo
> requisitos ya implementados: RF-GUION-001/002/004 (crear entrevista, guión, objetivos),
> RF-AUDIO-001..005 (grabación + transcripción), RF-ASIS-001..006 (asistencia en vivo) y
> RF-DISC-003/004 (empresas y contactos, aquí como asignación a posteriori). Introduce un cambio de
> modelo: la empresa deja de ser prerequisito de la entrevista.

## Descripción

Hoy, para grabar una entrevista hay que crear antes discovery → empresa → contacto → entrevista,
lo que penaliza la agilidad (muchas entrevistas acaban en no-show y esas entidades quedan
huérfanas). Esta spec convierte la sección "Captura" del sidebar (harness provisional de los
spikes) en "Capturas": un listado de todas las capturas guardadas desde el que se inicia una
captura nueva eligiendo solo discovery y plantilla, se genera el guión con IA, y se graba con la
misma experiencia completa de entrevista (transcripción en vivo, objetivos y asistente Mom Test).
La empresa y el contacto se crean o asignan después, cuando la entrevista realmente ha ocurrido.

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
proyecto no hay Supabase: el cambio de schema afecta al JSON store local (`db.json`) y se detalla
en "Notas técnicas" (entrevistas con `companyId` nullable + `discoveryId` propio).
- Las secciones reutilizadas del detalle de entrevista (`RecordingSection`, `ScriptSection`,
`NoteSection`) **no se reimplementan**: se montan tal cual en la nueva pantalla. Solo se toca su
código si un supuesto interno (p. ej. empresa siempre presente) lo impide.

## Criterios de aceptación

### Navegación y listado

- GIVEN el sidebar de navegación WHEN se renderiza THEN el ítem antes llamado "Captura" se muestra como "Capturas" (mismo icono `Mic`, misma posición) y navega a `/captures`.
- GIVEN la ruta legado `/capture` o el index `/` WHEN se navega a ellas THEN redirigen a `/captures` (el harness de spike deja de estar enrutado).
- GIVEN capturas existentes WHEN se abre `/captures` THEN se listan todas las entrevistas del sistema ordenadas por `updatedAt` descendente, cada fila con: título (link al detalle), Badge de estado, y fila muted "{discovery} · {empresa | Sin empresa} · {contacto | Sin contacto}".
- GIVEN una captura sin empresa asignada WHEN se muestra su fila THEN "Sin empresa" se presenta como Badge (variant outline), no como texto muted, para que lo pendiente destaque.
- GIVEN el listado WHEN se pulsa el filtro "Sin empresa" THEN solo se muestran las capturas con `companyId` null, y aparece el botón "Limpiar filtros".
- GIVEN cero capturas en el sistema WHEN se abre `/captures` THEN se muestra un empty state con icono, texto "Aún no hay capturas" y botón "Crear primera captura".
- GIVEN un fallo del bridge al listar WHEN se abre `/captures` THEN se muestra el error state con el mensaje y botón "Reintentar".
- GIVEN el listado cargando WHEN aún no hay respuesta THEN se muestran Skeletons de fila.

### Nueva captura

- GIVEN el listado de capturas WHEN se pulsa "Nueva captura" THEN se abre un Dialog con los campos: Título (Input, requerido), Discovery (Select, requerido) y Plantilla (Select opcional, default "Sin template", mismas etiquetas nombre + fase que el Dialog de entrevista).
- GIVEN el Dialog de nueva captura con título vacío WHEN se pulsa "Crear" THEN se muestra el error inline "Campo requerido" bajo el Título y no se crea nada.
- GIVEN el Dialog sin discovery seleccionado WHEN se pulsa "Crear" THEN se muestra el error inline "Campo requerido" bajo Discovery y no se crea nada.
- GIVEN cero discoveries en el sistema WHEN se abre el Dialog de nueva captura THEN el Select de Discovery indica "No hay discoveries" y el Dialog muestra un aviso con link "Crear discovery" que navega a `/discoveries`.
- GIVEN el Dialog válido WHEN se pulsa "Crear" THEN se crea la entrevista con `discoveryId` elegido, `companyId` null, `contactId` null, status `draft`, se muestra Toast "Captura creada" y se navega a `/captures/:id`.

### Detalle de captura (misma experiencia que la entrevista de Discoveries)

- GIVEN una captura existente WHEN se abre `/captures/:id` THEN se muestra el back button "Volver" (a `/captures`), h1 con el título, Badge de estado y fila muted "{discovery} · {empresa | Sin empresa} · {contacto | Sin contacto} · {template | Sin template}".
- GIVEN el detalle de una captura WHEN se renderiza THEN aparecen las mismas secciones y en el mismo orden que en el detalle de entrevista: Grabación (`RecordingSection`), Nota (`NoteSection`) y Guión (`ScriptSection`), con su comportamiento íntegro (permisos y selección de micro, transcripción en vivo con diarización, aviso de consentimiento, seguimiento de objetivos, sugerencias del asistente Mom Test con 👍/👎, generación/edición de nota y export).
- GIVEN una captura sin empresa WHEN se graba con el asistente configurado THEN el asistente proactivo funciona igual que en una entrevista de empresa (se activa por `interviewId`; la ausencia de empresa no lo inhibe).
- GIVEN un id de captura inexistente WHEN se abre `/captures/:id` THEN se muestra el error state con link "Volver a Capturas".

### Guión y objetivos sin empresa

- GIVEN una captura con plantilla asignada y sin empresa WHEN se pulsa "Generar guión" THEN el guión y los objetivos se generan con la plantilla y el nombre del discovery como contexto, omitiendo las secciones de empresa/contacto y el contexto histórico, y el status pasa a `prepared`.
- GIVEN una captura sin plantilla WHEN se intenta generar el guión THEN aplica el mismo bloqueo que en entrevistas (error `no-template` / CTA de asignar plantilla), sin llamada al LLM.
- GIVEN una captura a la que después se asigna empresa WHEN se regenera el guión THEN la generación vuelve a incluir los datos de la empresa, el contacto (si lo hay) y el contexto histórico de esa empresa.

### Asignación de empresa y contacto

- GIVEN una captura sin empresa WHEN se abre su detalle THEN junto a la cabecera aparece el botón "Asignar empresa" (variant outline) que abre el Sheet de asignación.
- GIVEN el listado de capturas WHEN se abre el menú ⋯ de una fila sin empresa THEN incluye la acción "Asignar empresa y contacto" que abre el mismo Sheet.
- GIVEN el Sheet de asignación WHEN se renderiza THEN muestra: Select "Empresa" con las empresas del discovery de la captura más la opción "+ Nueva empresa", y Select "Contacto" (deshabilitado con Tooltip "Selecciona primero una empresa" hasta que haya empresa elegida) con los contactos de la empresa elegida más "+ Nuevo contacto" y "Sin contacto".
- GIVEN "+ Nueva empresa" seleccionada WHEN se muestra el Sheet THEN aparecen inline los campos Nombre (requerido), Website y LinkedIn (opcionales) — sin abrir un segundo modal.
- GIVEN "+ Nuevo contacto" seleccionado WHEN se muestra el Sheet THEN aparecen inline los campos Nombre (requerido), Posición y LinkedIn (opcionales).
- GIVEN el Sheet con empresa nueva de nombre vacío WHEN se pulsa "Asignar" THEN error inline "Campo requerido" y no se persiste nada.
- GIVEN el Sheet válido con empresa existente WHEN se pulsa "Asignar" THEN la captura se actualiza (`companyId`, `contactId`), se muestra Toast "Empresa asignada", el Sheet se cierra y la cabecera/fila reflejan la asignación sin recargar.
- GIVEN el Sheet válido con empresa y/o contacto nuevos WHEN se pulsa "Asignar" THEN se crean la empresa (en el discovery de la captura) y/o el contacto (en esa empresa) y se asignan a la captura en la misma operación percibida; si la creación falla, no se asigna nada y se muestra el error.
- GIVEN una captura ya asignada a una empresa WHEN se consulta el detalle de esa empresa en Discoveries THEN la captura aparece en su sección "Entrevistas" como una entrevista más, con navegación a su detalle.
- GIVEN un fallo del bridge al asignar WHEN se pulsa "Asignar" THEN el Sheet permanece abierto y se muestra el error (Toast destructive), sin estado a medias.

### Edición y eliminación

- GIVEN el menú ⋯ de una fila del listado WHEN se abre THEN incluye "Editar" (Dialog con Título y Plantilla; incluye Contacto solo si la captura tiene empresa) y "Eliminar" (destructive, tras separador).
- GIVEN "Eliminar" WHEN se confirma en el AlertDialog ("Eliminar captura" / "Se eliminarán permanentemente «{título}» y sus notas.") THEN la captura desaparece del listado y se muestra Toast.
- GIVEN un discovery con capturas sin empresa WHEN se elimina el discovery THEN esas capturas se eliminan en cascada igual que las entrevistas de sus empresas.

### Integraciones existentes

- GIVEN la búsqueda global (⌘K) WHEN un resultado es una captura sin empresa THEN el hit se muestra con "Sin empresa" como contexto y navega a `/captures/:id` (los hits de entrevistas con empresa conservan su ruta actual).
- GIVEN una entrevista creada desde el detalle de empresa (flujo actual) WHEN se abre `/captures` THEN también aparece en el listado (el listado es global) y su link navega a `/captures/:id`.

## UX Design

### Wireframe textual

**Pantalla 1 — Listado de capturas (`/captures`) — Layout 1 estándar**

- Cabecera: h1 "Capturas" a la izquierda; a la derecha Button (variant default, icono Plus) "Nueva captura".
- Bajo la cabecera, fila de filtros: dos chips/toggle (Button variant ghost/secondary según activo): "Todas" (default) y "Sin empresa". Con filtro activo distinto de "Todas": Button (variant outline) "Limpiar filtros".
- Lista (`ul` divide-y rounded-md border, mismo patrón que la sección Entrevistas de CompanyDetailPage): por fila —
  - Izquierda: link con el título (font-medium, hover underline) · Badge secondary con el estado ("Borrador"/"Preparada"/"Grabada"/"Resumida") · si `companyId` null, Badge outline "Sin empresa" · texto muted "{discovery} · {contacto o nada} · {template o nada}".
  - Derecha: DropdownMenu (icono MoreHorizontal, aria-label "Acciones") con: "Asignar empresa y contacto" (solo si sin empresa), "Editar", separador, "Eliminar" (destructive).
- Empty state centrado: icono `Mic` 24px muted + "Aún no hay capturas" + Button default "Crear primera captura".
- Empty por filtro: "No hay capturas sin empresa" + Button outline "Limpiar filtros".
- Error state: mensaje + Button outline "Reintentar". Loading: 3 Skeletons h-12.

**Pantalla 2 — Dialog "Nueva captura" (Dialog: 3 campos, &lt; 10 seg)**

- Título del Dialog: "Nueva captura".
- Campos en orden: Input "Título" (placeholder "Captura {fecha local dd/mm/aaaa}", requerido, foco al abrir) · Select "Discovery" (requerido, placeholder "Selecciona un discovery") · Select "Plantilla" (default "Sin template"; etiquetas "nombre (fase)" como en InterviewFormDialog).
- Si no hay discoveries: el Select queda deshabilitado y bajo él un texto muted "No hay discoveries. <link>Crear discovery</link>".
- Footer: Button outline "Cancelar" · Button default "Crear" (spinner inline mientras crea).

**Pantalla 3 — Detalle de captura (`/captures/:id`) — Layout 2 detalle**

- Back button ghost "Volver" (a `/captures`), arriba izquierda.
- Cabecera: h1 título + Badge secondary de estado; a la derecha de la cabecera, si `companyId` null, Button outline (icono Building2) "Asignar empresa".
- Fila muted bajo el h1: "{discovery} · {empresa | Sin empresa} · {contacto | Sin contacto} · {template | Sin template}".
- Secciones, en este orden (idénticas al detalle de entrevista, componentes reutilizados): Grabación (`RecordingSection`) → Nota (`NoteSection`) → Guión (`ScriptSection`).
- Error state (id inexistente): mensaje + link "Volver a Capturas".

**Pantalla 4 — Sheet "Asignar empresa y contacto" (5-8 campos potenciales → Sheet, lateral derecha)**

- Título: "Asignar empresa y contacto". Descripción muted: "La captura se moverá a la empresa dentro de su discovery «{nombre del discovery}»."
- Campo 1: Select "Empresa" — opciones: empresas del discovery de la captura + item destacado "+ Nueva empresa".
  - Si "+ Nueva empresa": aparecen inline Input "Nombre" (requerido), Input "Website", Input "LinkedIn".
- Campo 2: Select "Contacto" — deshabilitado (con Tooltip "Selecciona primero una empresa") hasta elegir empresa; opciones: "Sin contacto" (default) + contactos de la empresa elegida + "+ Nuevo contacto".
  - Si "+ Nuevo contacto": aparecen inline Input "Nombre" (requerido), Input "Posición", Input "LinkedIn".
  - Si la empresa elegida es nueva, el Select de contacto ofrece solo "Sin contacto" y "+ Nuevo contacto".
- Sticky bottom bar: Button outline "Cancelar" (izquierda) · Button default "Asignar" (derecha, spinner inline mientras persiste).

### Componentes shadcn utilizados

Componentes: Button, Badge, Dialog, Sheet, Select, Input, DropdownMenu, AlertDialog, Skeleton, Tooltip, Toast (sonner ya integrado).
Todos instalados en el proyecto; sin componentes adicionales.

### data-testid

- `captures-list` — la lista del listado de capturas
- `captures-filter-unassigned` — el chip de filtro "Sin empresa"
- `new-capture-dialog` — el Dialog de nueva captura
- `capture-row-actions` — el trigger del DropdownMenu de cada fila
- `assign-company-sheet` — el Sheet de asignación
- `assign-company-button` — el botón "Asignar empresa" del detalle

El resto de elementos son localizables por role/label/text (los de las secciones reutilizadas conservan los suyos).

### Patrón de interacción

- **Dialog para nueva captura** (3 campos, interacción &lt; 10 seg — regla 4.1); **Sheet para la asignación** (hasta 8 campos con creación inline y conviene ver la captura detrás — regla 4.1). La creación inline dentro del Sheet evita un segundo nivel de modal (regla 11.1, máx. 2 niveles) y el anti-patrón dropdown→dialog.
- **List, no Table**, para el listado: 1-2 datos primarios por fila (título + estado) con metadata muted, mismo patrón ya fijado para entrevistas en CompanyDetailPage (SPEC-013); sin sorting por columnas. Client-side, sin paginación: volumen esperado en decenas, coherente con el resto de listados de la app. Decisión no cubierta explícitamente por el design system para &gt;100 filas futuras: se acepta client-side por consistencia con SPEC-010/011/013.
- **Filtro como chips** ("Todas"/"Sin empresa"): 2 valores excluyentes visibles (regla 7.2: filtros más usados visibles; Badge/limpiar cuando activo).
- **Validación** inline on submit ("Campo requerido"), submit siempre habilitado, errores de servidor por Toast destructive (regla 5.1/6).
- **Toast** tras crear/asignar/eliminar; **AlertDialog** antes de eliminar con consecuencia explícita (regla 6.1/6.3).
- **Asignación atómica percibida**: si al asignar hay que crear empresa/contacto y algo falla, no queda estado intermedio visible; el Sheet permanece abierto con el error.

### Comportamiento responsive

- **Mobile (&lt; md):** cabecera del listado en dos filas (título arriba, "Nueva captura" debajo a ancho completo); filas de la lista con la metadata muted en línea propia bajo el título; el Sheet ocupa el ancho completo; el detalle hereda el responsive ya definido para las secciones reutilizadas (SPEC-015/016/017).
- **Tablet (md-lg):** interpolado entre mobile y desktop.
- **Desktop (lg+):** layouts completos de los wireframes.

## Notas técnicas

- **Schema (`db.json`, sin Supabase):** `Interview.companyId` pasa a `string | null` y se añade `Interview.discoveryId: string` (obligatorio). Migración al cargar el store: backfill de `discoveryId` desde la empresa de cada entrevista existente. Invariante nuevo de integridad: si `companyId` no es null, la empresa debe pertenecer a `discoveryId`; si `contactId` no es null, exige `companyId` no null y el contacto debe pertenecer a esa empresa. Cascada: eliminar un discovery elimina también sus capturas sin empresa; el borrado de empresa mantiene la cascada actual sobre sus entrevistas.
- **Bridge:** `createInterview` acepta `discoveryId` con `companyId` opcional; hace falta un listado global de entrevistas (p. ej. `listAllInterviews()`), y una operación de asignación que resuelva crear-empresa/crear-contacto/actualizar-entrevista sin estados a medias (el JSON store ya serializa mutaciones síncronas; una mutación compuesta única lo garantiza).
- **LLM (`llmService`):** `generateScript` hoy asume empresa presente (`getCompany(interview.companyId)` + histórico por empresa). Debe degradar con `companyId` null: prompt sin secciones Empresa/Contacto/Histórico e incluyendo el nombre del discovery. Sin cambios en modelo ni structured outputs.
- **Búsqueda (SPEC-018):** los hits de entrevistas resuelven hoy la ruta vía empresa; con `companyId` null la ruta destino es `/captures/:id` y el contexto mostrado "Sin empresa".
- **Rutas:** `/captures` (listado) y `/captures/:id` (detalle) nuevas; `/capture` y el index redirigen a `/captures`; `SpikeAudioCapturePage` deja de estar enrutada (el código del spike no se elimina en esta spec).
- Dependencias: SPEC-006 (store), SPEC-013/014/015/016/017 (secciones reutilizadas), SPEC-018 (búsqueda), SPEC-019 (consentimiento, sin cambios).

## Decisiones asumidas

- **Alcance del listado** → el listado de `/captures` es **global** (todas las entrevistas, con o sin empresa), con filtro "Sin empresa". Criterio: la captura no debe "perderse" del sitio donde se creó al completar sus datos, y da una vista única de toda la actividad.
- **Discovery obligatorio al crear la captura** → pedido en el Dialog de creación. Criterio: el usuario lo indicó ("seleccionar qué Discovery voy a hacer") y el guión y la cascada de datos necesitan un ancla mínima.
- **Guión sin empresa** → se genera solo con plantilla + nombre del discovery, sin contexto histórico. Criterio: el histórico por empresa es el contrato de SPEC-014; ampliarlo a discovery es otro requisito.
- **Ruta canónica del detalle** → toda captura (con o sin empresa) es navegable por `/captures/:id`; las rutas actuales de entrevista bajo empresa siguen funcionando. Criterio: links estables y back button coherente con el origen de la navegación.
- **Harness de spike** → `/capture` deja de existir como pantalla (redirect) y la página del spike queda sin ruta. Criterio: era explícitamente provisional (SPEC-009/CLAUDE.md).
- **Asignación no reversible desde la UI** → no se especifica "desasignar" empresa. Criterio: no lo pide el flujo; se puede iterar.

