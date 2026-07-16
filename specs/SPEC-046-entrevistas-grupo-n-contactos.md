# SPEC-046 — Entrevistas dentro de grupo con empresa global y N contactos

> Origen: ítem 4 de H11 en `docs/checklist.md` (RF-GUION-006, RF-GUION-002, RF-GUION-003), draft
> `docs/drafts/company-contact-entities-20260716.md`. Depende de SPEC-043 (modelo v3), SPEC-044
> (empresas globales) y SPEC-045 (grupos). Completa el flujo nuevo: las entrevistas se crean
> dentro de un grupo, con una empresa global y N contactos de esa empresa, y el guión/nota se
> personalizan con TODOS los participantes.

## Descripción

Los grupos de entrevistas ganan su página de detalle: desde la fila del grupo se navega a un
listado de sus entrevistas y se crean entrevistas nuevas eligiendo una empresa (global) y varios
contactos de esa empresa como participantes. El template de preguntas de la entrevista es el del
grupo. El guión y la nota generados con IA pasan a personalizarse con el nombre y el contexto de
la empresa y de todos los contactos, y con los objetivos del discovery y del grupo. La selección
múltiple de contactos llega también a los flujos existentes (Dialog de entrevista de empresa,
edición de captura y Sheet de asignación de capturas).

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
proyecto no hay Supabase; NO hay bump de schema (`db.json` sigue en v3), pero SÍ cambian contratos
IPC existentes (`AssignCompanyInput.contactIds`) y los prompts de guión/nota en main — detallado
en "Notas técnicas".
- El detalle de la entrevista, la grabación y el asistente en vivo **no se tocan**: la entrevista
creada en grupo se abre con las pantallas existentes.

## Criterios de aceptación

### Navegación al grupo

- GIVEN el detalle de un discovery con grupos WHEN se pulsa el nombre de un grupo THEN navega a `/discoveries/:discoveryId/groups/:groupId` (el nombre pasa a ser Link; el resto de la fila y su menú ⋯ no cambian).
- GIVEN la página de un grupo WHEN se renderiza THEN muestra el back button «Volver» (al detalle del discovery), h1 con el nombre del grupo, el objetivo del grupo bajo el título (o «Sin objetivo» muted), la línea muted «{template de preguntas | Sin template de preguntas} · {template de notas | Sin template de notas}» y el botón «Editar» que abre el Dialog de grupo existente precargado.
- GIVEN un groupId inexistente WHEN se abre la página THEN se muestra el error state con enlace «Volver al discovery».

### Listado de entrevistas del grupo

- GIVEN un grupo con entrevistas WHEN se renderiza su página THEN se listan sus entrevistas ordenadas por `createdAt` ascendente, cada fila con: título (Link a su detalle), Badge de estado y línea muted «{empresa | Sin empresa} · {contactos unidos por ", " | Sin contacto}».
- GIVEN cero entrevistas en el grupo WHEN se renderiza THEN se muestra un empty state con icono, texto «Aún no hay entrevistas en este grupo» y botón «Crear primera entrevista».
- GIVEN un fallo del bridge al listar WHEN se renderiza THEN se muestra el mensaje de error muted del envelope.
- GIVEN el listado cargando WHEN aún no hay respuesta THEN se muestran Skeletons de fila.
- GIVEN una entrevista del grupo cuya empresa fue borrada (`companyId` null) WHEN se pulsa su título THEN navega a `/captures/:id` (detalle universal de captura); con empresa, navega a la ruta anidada existente de detalle de entrevista.

### Nueva entrevista en el grupo

- GIVEN la página del grupo WHEN se pulsa «Nueva entrevista» THEN se abre un Dialog con: Título (Input, requerido), Empresa (Select, requerido, TODAS las empresas del sistema por nombre) y Participantes (lista de Checkbox con los contactos de la empresa elegida, opcional) — sin selector de template (se hereda del grupo).
- GIVEN el Dialog sin empresa elegida WHEN se renderiza la sección Participantes THEN muestra el texto muted «Elige una empresa para ver sus contactos».
- GIVEN una empresa elegida sin contactos WHEN se renderiza Participantes THEN muestra el texto muted «Esta empresa no tiene contactos».
- GIVEN varios contactos marcados WHEN se cambia la empresa del Select THEN la selección de participantes se vacía.
- GIVEN el Dialog con título vacío o sin empresa WHEN se pulsa «Crear» THEN se muestra el error inline «Campo requerido» bajo el campo correspondiente y no se crea nada.
- GIVEN cero empresas en el sistema WHEN se abre el Dialog THEN el Select indica «No hay empresas» y se muestra un aviso con link «Crear empresa» que navega a `/companies`.
- GIVEN el Dialog válido con 2 participantes marcados WHEN se pulsa «Crear» THEN la entrevista se crea con el `discoveryId` del grupo, `interviewGroupId` del grupo, la empresa y los `contactIds` marcados, y `templateId` = template de preguntas del grupo (o null si el grupo no tiene), se muestra Toast «Entrevista creada» y se navega a su detalle.

### Guión y nota personalizados con todos los participantes

- GIVEN una entrevista con empresa con contexto y 2 contactos con contexto WHEN se genera el guión THEN el mensaje de usuario del LLM incluye el contexto de la empresa en la sección Empresa y una sección de contactos con un bloque por participante (nombre, cargo y LinkedIn si existen, y su contexto).
- GIVEN una entrevista perteneciente a un grupo con objetivo y a un discovery con objetivos WHEN se genera el guión THEN el mensaje de usuario incluye los objetivos del discovery y el objetivo del grupo como secciones propias.
- GIVEN una entrevista sin grupo o de un discovery sin objetivos WHEN se genera el guión THEN esas secciones se omiten y el resto del prompt no cambia (byte-estable con el actual en ese caso, salvo las secciones de contactos/contexto).
- GIVEN una entrevista sin empresa o sin contactos WHEN se genera el guión THEN se conserva la degradación actual (secciones omitidas o «Sin contacto asignado todavía»), sin errores.
- GIVEN la generación de la nota de resumen WHEN la entrevista tiene N contactos THEN el prompt de la nota recibe el mismo tratamiento (bloque por participante con contexto; degradación intacta).

### Selección múltiple de contactos en los flujos existentes

- GIVEN el Dialog de entrevista del detalle de empresa (SPEC-044) WHEN se renderiza THEN el Select de contacto único se sustituye por la lista de Checkbox «Participantes» con los contactos de la empresa de la página, y crear/editar persiste los `contactIds` marcados.
- GIVEN el Dialog de edición de una captura con empresa asignada WHEN se renderiza THEN el contacto único se sustituye por la misma lista de Checkbox con los contactos de su empresa, precargada con los participantes actuales.
- GIVEN el Sheet de asignación de empresa de una captura WHEN se elige una empresa existente THEN se pueden marcar N contactos de esa empresa como participantes (Checkbox), además de poder crear un contacto nuevo inline que queda como participante junto a los marcados.
- GIVEN el Sheet con empresa nueva inline WHEN se asigna THEN el único participante posible es el contacto nuevo inline (la empresa recién creada no tiene contactos previos), comportamiento actual conservado.
- GIVEN la asignación confirmada con 2 contactos marcados WHEN se guarda THEN la entrevista queda con esos `contactIds` en una única mutación atómica y la cabecera de la captura muestra los nombres unidos por ", ".

## UX Design

### Wireframe textual

**Pantalla 1 — `/discoveries/:discoveryId/groups/:groupId` (Layout 2 — Detalle):**

- Back button ghost «Volver» (ArrowLeft) → `/discoveries/:discoveryId`.
- Cabecera: h1 con el nombre del grupo; a la derecha Button (variant outline, icono Pencil) «Editar» (abre `InterviewGroupFormDialog` precargado).
- Bajo el h1: objetivo del grupo en `text-sm whitespace-pre-wrap` (o «Sin objetivo» muted) y línea muted con los dos templates («… · …»).
- Sección «Entrevistas» (h3) con Button (default, icono Plus) «Nueva entrevista» a la derecha del heading:
  - List (ul divide-y, borde): por fila → título como Link, Badge de estado (mapping existente de estados de entrevista), línea muted «{empresa | Sin empresa} · {contactos , | Sin contacto}».
  - Empty state: icono `Mic` 24px muted, «Aún no hay entrevistas en este grupo», Button «Crear primera entrevista».
  - Error: mensaje muted centrado. Loading: 3 Skeletons h-12.
- Dialog «Nueva entrevista» (3 campos, regla 4.1): Título (Input requerido, foco inicial) → Empresa (Select requerido, placeholder «Selecciona una empresa»; sin empresas → «No hay empresas» + aviso con link «Crear empresa») → Participantes (label + lista vertical de filas Checkbox+nombre (posición muted si existe), estado según AC). Footer: Cancelar (outline) + «Crear» (default, spinner mientras envía).

**Pantalla 2 — cambios en Dialogs existentes:**

- `InterviewFormDialog` (detalle de empresa): el campo «Contacto» (Select) se sustituye por «Participantes» (misma lista de Checkbox, contactos de la empresa de la página; en edición precargada con los actuales). El Select de Discovery de SPEC-044 y el de Template no cambian.
- `EditCaptureDialog`: ídem con los contactos de la empresa asignada.
- `AssignCompanySheet`: donde hoy hay el Select de contacto único, lista de Checkbox «Participantes» (contactos de la empresa elegida) + la opción existente de crear contacto nuevo inline (que se convierte en participante al asignar). Con empresa nueva inline solo está la opción de contacto nuevo (comportamiento actual).

### Componentes shadcn utilizados

Componentes: Button, Dialog, Sheet (existente), AlertDialog (existente), Checkbox, Select, Input, Badge, Skeleton, Toast (sonner), DropdownMenu (existente). Todos instalados (`checkbox.tsx` presente en `components/ui/`).

### data-testid

- `group-interviews-list` — la List de entrevistas del grupo.
- `group-interview-form-dialog` — el content del Dialog de nueva entrevista del grupo.
- `interview-company-select` — el Select de Empresa de ese Dialog.
- `interview-participants` — el contenedor de la lista de Checkbox de participantes (reutilizado en los tres flujos existentes adaptados).

### Patrón de interacción

- Dialog para la nueva entrevista del grupo (3 campos, regla 4.1). Checkbox para multiselección
  visible (los contactos por empresa son pocos; un Combobox multi no está en el design system —
  decisión no cubierta por el design system: multiselección de 1-10 ítems; se resuelve con lista
  de Checkbox por ser todas las opciones visibles y con descripción, análogo a RadioGroup).
- Cambiar empresa vacía la selección (evita participantes de otra empresa — invariante v3).
- Toast tras crear; navegación al detalle tras crear (patrón SPEC-044-iter-1).
- Sin selector de template en el grupo: el template es un atributo del grupo (RF-DISC-009); la
  fila del grupo ya lo muestra.

### Comportamiento responsive

- **Mobile (< md):** botón «Nueva entrevista» a ancho completo bajo el heading; refs de la fila apiladas bajo el título; Dialog a ancho completo con scroll interno (la lista de participantes scrollea dentro).
- **Tablet (md-lg):** interpolado entre mobile y desktop.
- **Desktop (lg+):** layout completo del wireframe.

## Notas técnicas

- **Ruta nueva** `discoveries/:discoveryId/groups/:groupId` → página nueva del grupo. La fila de
  grupo de `DiscoveryDetailPage` convierte su nombre en Link (deroga la decisión «no navegan» de
  SPEC-045).
- **Datos**: no hay canales nuevos; el listado de entrevistas del grupo puede resolverse con
  `listAllInterviews()` filtrado por `interviewGroupId` en el renderer (volumen trivial, patrón
  listados actuales) o un canal nuevo `db:interview:list-by-group` — decisión del plan; si se crea
  canal, patrón `handleDb` + bridge tipado.
- **Creación**: `createInterview({ discoveryId: group.discoveryId, interviewGroupId: group.id,
  companyId, contactIds, templateId: group.interviewTemplateId, title })`. La invariante
  grupo∈discovery ya la valida el repositorio (SPEC-043).
- **`AssignCompanyInput`**: `contactId`/`newContact` únicos → `contactIds?: string[]` +
  `newContact?` (se mantiene, uno); `assignInterviewCompany` en el repositorio valida los N
  contactos (pertenencia a la empresa, sin duplicados — reutilizar `assertInterviewContacts`) y
  el resultado pasa a `contacts: Contact[]`. Un solo `mutate` (atomicidad intacta).
- **Prompts (main)**: `buildUserPrompt` de `llmService` y `noteService` reciben `contacts:
  Contact[]` (todos, en orden) en lugar de `contact`. Sección Empresa gana línea
  `Contexto:` si `company.context` existe; la sección de contactos pasa a `## Contactos`
  (o «Sin contacto asignado todavía» si vacío) con un bloque por contacto: nombre, cargo,
  LinkedIn y contexto (las líneas ausentes se omiten). Secciones nuevas condicionales del guión:
  `## Objetivos del discovery` (si `discovery.objectives`) y `## Objetivo del grupo` (si la
  entrevista tiene grupo con `objective`); resolver el grupo con `getInterviewGroup` tolerando
  referencia rota (omitir sección). El system prompt NO cambia (prefijo cacheado de SPEC-023
  intacto — las secciones nuevas viven en el mensaje de usuario).
- **`assistantService`**: sin cambios (no consume contactos).
- **Derogaciones**: SPEC-013/044 (Select de contacto único en el Dialog de entrevista), SPEC-020
  (Select de contacto único del Sheet y de la edición de captura; `AssignCompanyResult.contact`),
  SPEC-045 (filas de grupo sin navegación), SPEC-014 (forma exacta de las secciones
  Empresa/Contacto del prompt del guión). Sus tests se adaptan como evolución presupuestada.

## Decisiones asumidas

- [¿La entrevista de grupo exige empresa?] → asumido SÍ (Select requerido) (alternativa: opcional
  como en capturas). Criterio: el flujo del draft es «asignando una empresa y N contactos»; la
  entrevista sin empresa ya tiene su flujo (capturas).
- [¿Los objetivos del discovery/grupo entran en el prompt del guión?] → asumido SÍ como secciones
  condicionales del mensaje de usuario (alternativa: solo empresa/contactos). Criterio: rationale
  de RF-DISC-008/009 («da contexto … al guión»); coste marginal y sin tocar el prefijo cacheado.
- [¿Multiselección con Checkbox o Combobox multi?] → asumido lista de Checkbox visible
  (alternativa: Combobox con tags). Criterio: pocas opciones, todas visibles con descripción
  (análogo RadioGroup ≤5); el design system no tiene multiselect — laguna documentada.
- [¿Link de entrevista sin empresa?] → asumido `/captures/:id` como detalle universal
  (alternativa: deshabilitar el link). Criterio: esa página ya soporta entrevistas sin empresa
  (SPEC-020) y conserva toda la experiencia.
- [¿La nota también incluye objetivos de discovery/grupo?] → asumido NO en esta spec (solo
  participantes) (alternativa: sí). Criterio: la nota se rige por el note-template (H11.5); añadir
  objetivos ahí sin spec propia mezclaría alcances.
