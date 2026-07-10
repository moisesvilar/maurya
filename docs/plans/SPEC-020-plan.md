# SPEC-020 — Plan de implementación

> Generado por subagente Plan (2026-07-10). Contrato: specs/SPEC-020-capturas-capture-first.md. Verificado: las tres secciones reutilizadas reciben `{interview, onInterviewUpdated}` y NO asumen empresa en renderer (cero cambios en ellas); el supuesto "empresa presente" vive en main en `llmService.doGenerate` **y también en `noteService.doGenerate:284`** (hallazgo: la spec solo cita llmService, pero el AC "NoteSection con comportamiento íntegro" obliga a degradar ambos); `assistantService` solo depende de `interviewId` (AC del asistente sin cambios); `ui/sheet.tsx` ya existe.

## 1. Dominio + migración del store + cascada (base de todo)

- **types/domain.ts**: `Interview.companyId: string | null`; añadir `Interview.discoveryId: string` (obligatorio, comentado como SPEC-020). `CreateInterviewInput` pasa a `{ discoveryId: string; companyId?: string | null; title; contactId?; templateId? }`. `UpdateInterviewPatch` NO gana `companyId` (la asignación va solo por la operación compuesta — evita invariantes a medias por `updateInterview`).
- **types/captures.ts (nuevo, DOM-free** como types/search.ts — lo importan main y preload type-only**)**:
  - `CaptureListItem { interview: Interview; discoveryName: string; companyName: string | null; contactName: string | null; templateName: string | null }` — contexto resuelto en main (patrón search.ts) para que el listado global no haga N llamadas.
  - `AssignCompanyInput { companyId?: string; newCompany?: { name; website?: string|null; linkedinUrl?: string|null }; contactId?: string | null; newContact?: { name; position?: string|null; linkedinUrl?: string|null } }` (exactamente uno de companyId/newCompany; contactId/newContact/nada).
  - `AssignCompanyResult { interview: Interview; company: Company; contact: Contact | null }` — la UI refresca cabecera/fila sin recargar.
- **src/main/db/store.ts**: `SCHEMA_VERSION = 2`. En `initStore`, tras parsear un archivo válido con `schemaVersion === 1`: migración síncrona — Map companiesById; para cada interview, `discoveryId = companiesById.get(companyId).discoveryId`; si la empresa no resuelve (dato inconsistente, hoy inalcanzable en UI) se elimina la entrevista y su nota (decisión documentada, coherente con la cascada); `schemaVersion = 2`; `persist()` del resultado. Un db.json nuevo nace ya en v2. `isDbData` no cambia (chequeo estructural).
- **src/main/db/repository.ts**:
  - `createInterview`: `assertReference(discoveries, input.discoveryId)`; si `companyId` presente y no null → `assertReference(companies)` + validar `company.discoveryId === input.discoveryId` (referenceError si no); `contactId` no-null exige `companyId` no-null y `contact.companyId === companyId`; persistir `discoveryId` y `companyId: input.companyId ?? null`.
  - `updateInterview`: reforzar invariante — `patch.contactId` no-null exige `interview.companyId` no-null y contacto de esa empresa (hoy solo valida existencia).
  - `deleteDiscovery`: antes de `deleteCompaniesCascade`, borrar TODAS las entrevistas con `interview.discoveryId === id` vía `deleteInterviewsCascade` (cubre las sin empresa; las de empresa caen igual por cualquiera de las dos vías). `deleteCompany` no cambia (mantiene su cascada).
  - **`listAllInterviews(): CaptureListItem[]` (nuevo)**: un solo `read`, Maps de discoveries/companies/contacts/templates, orden `updatedAt` desc; referencias opcionales no resueltas → null (defensivo, no romper).
  - **`assignInterviewCompany(interviewId, input): AssignCompanyResult` (nuevo)**: UN SOLO `mutate()` (atómico por diseño del store: si algo lanza, cero escrituras — cumple "sin estado a medias"): validar título/nombres (`assertName` para newCompany/newContact), resolver-o-crear empresa (nueva → en `interview.discoveryId`), validar empresa existente pertenece al discovery de la captura, resolver-o-crear contacto (en esa empresa), asignar `companyId`/`contactId` + `touched(updatedAt)`.

## 2. Canales IPC + preload + contrato

- **src/main/db/ipc.ts**: `handleDb('db:interview:list-all', repository.listAllInterviews)` y `handleDb('db:interview:assign-company', repository.assignInterviewCompany)` — heredan envelope DbResult, nunca rechazan.
- **types/domain.ts (DbApi)**: `listAllInterviews: () => Promise<DbResult<CaptureListItem[]>>` y `assignInterviewCompany: (interviewId: string, input: AssignCompanyInput) => Promise<DbResult<AssignCompanyResult>>` (import type-only de ./captures).
- **src/preload/index.ts**: dos métodos nuevos en `db` delegando en sus canales. `index.d.ts` sin cambios (tipa vía DbApi). El typecheck garantiza el contrato completo.

## 3. Degradación LLM sin empresa (main)

- **src/main/llmService.ts**: en `doGenerate` — `company = interview.companyId !== null ? getCompany(...) : null`; `discovery = getDiscovery(interview.discoveryId)`; `history = interview.companyId !== null ? collectHistoricalContext(...) : []`. `buildUserPrompt(interview, discovery, company | null, contact, template, history)`: con empresa, prompt idéntico al actual + sección `## Discovery` con el nombre; sin empresa, SOLO `## Discovery` + template + tarea (omite Empresa/Contacto/Histórico). `buildSystemPrompt` matiza la frase "adaptar a la empresa y al contacto concretos" cuando no hay empresa ("al contexto del discovery"). Sin cambios en MODEL/`OUTPUT_SCHEMA`/params (nunca temperature/top_p/top_k/budget_tokens). El bloqueo `no-template` ya ocurre ANTES de todo (AC sin llamada al LLM, gratis). Regenerar tras asignar empresa vuelve solo al camino completo (el branch depende de `companyId` en cada llamada).
- **src/main/noteService.ts** (hallazgo, fuera de Notas técnicas pero exigido por AC de NoteSection íntegra): mismo patrón — `company: Company | null` en `buildUserPrompt`, sección Empresa omitida (o "Sin empresa asignada") cuando null. Cambio mínimo y quirúrgico.

## 4. Búsqueda (SPEC-018)

- **types/search.ts**: `SearchInterviewHit.companyId: string | null` y `companyName: string | null`; `discoveryId` pasa a resolverse desde `interview.discoveryId`.
- **src/main/db/search.ts**: el loop de interviews deja de omitir hits sin empresa: `company = interview.companyId !== null ? companiesById.get(...) : undefined`; hit con `companyId/companyName` null cuando no hay empresa; mantener la omisión defensiva solo si `companyId` no-null no resuelve.
- **components/search/GlobalSearchDialog.tsx**: en el grupo Entrevistas, `onSelect` → `hit.companyId === null ? navigate('/captures/' + hit.id) : ruta anidada actual`; el contexto muted muestra `hit.companyName ?? 'Sin empresa'`. Hits con empresa conservan ruta y contexto actuales (AC).

## 5. Rutas y sidebar

- **src/renderer/src/App.tsx**: `index` → `<Navigate to="/captures" replace />`; `path="capture"` → `<Navigate to="/captures" replace />` (redirect legado); rutas nuevas `captures` (CapturesPage) y `captures/:id` (CaptureDetailPage); ELIMINAR el import y la ruta de `SpikeAudioCapturePage` (el archivo del spike NO se borra). Actualizar el comentario de cabecera.
- **components/layout/Sidebar.tsx**: en `NAV_ITEMS`, `{ to: '/captures', label: 'Capturas', icon: Mic }` — misma posición (3º), mismo icono. NavLink por prefijo marca activo también `/captures/:id` gratis.

## 6. Hook + página de listado

- **hooks/useCaptures.ts (nuevo, patrón useInterviews)**: estado `loading | error | ready { items: CaptureListItem[] }` vía `listAllInterviews`; `reload()` expuesto (botón "Reintentar"); `removeCapture(id)` (deleteInterview + toast + filtrado local); `updateCapture(id, patch)` (updateInterview con title/templateId/contactId); tras editar/asignar → `reload()` (decisión: más simple y barato con volumen en decenas); `applyAssignment(result)` para el Sheet.
- **pages/CapturesPage.tsx (nuevo, Layout 1 estándar, wireframe Pantalla 1)**: h1 "Capturas" + Button "Nueva captura" (Plus); chips "Todas"/"Sin empresa" (Button secondary activo / ghost inactivo, `data-testid="captures-filter-unassigned"`) + Button outline "Limpiar filtros" solo con filtro activo; lista `ul divide-y rounded-md border` (`data-testid="captures-list"`), orden ya viene por `updatedAt` desc de main; por fila: Link título → `/captures/:id`, Badge secondary `STATUS_LABELS[status]`, Badge outline "Sin empresa" si `companyId` null, span muted `{discoveryName} · {contactName? } · {templateName?}` (partes null omitidas, patrón `interviewRefsLabel` de CompanyDetailPage); DropdownMenu (`data-testid="capture-row-actions"`, aria-label "Acciones"): "Asignar empresa y contacto" (solo sin empresa), "Editar", separador, "Eliminar" destructive — apertura de Dialogs/Sheet a nivel de página con `setTimeout(0)` (mitigador Radix dropdown→dialog ya establecido en CompanyDetailPage). Estados: 3 Skeletons h-12; error con mensaje + "Reintentar" (reload); empty global (Mic 24px + "Aún no hay capturas" + "Crear primera captura"); empty por filtro ("No hay capturas sin empresa" + "Limpiar filtros"). Filtro client-side sobre `companyId === null`.

## 7. Dialog "Nueva captura"

- **components/captures/NewCaptureDialog.tsx (nuevo, calco de InterviewFormDialog: form real, remonte por key, foco al Título)**: Input "Título" (placeholder `Captura {dd/mm/aaaa}` con `toLocaleDateString('es-ES')`, requerido) · Select "Discovery" (requerido, placeholder "Selecciona un discovery", sin sentinel none) · Select "Plantilla" (sentinel NONE → "Sin template"; etiquetas `templateLabel` nombre + fase — extraer/importar el helper de InterviewFormDialog). Validación inline on submit "Campo requerido" bajo Título Y bajo Discovery (ambos independientes). Cero discoveries: Select disabled + texto muted "No hay discoveries. `<Link to="/discoveries">`Crear discovery`</Link>`". Footer Cancelar/Crear con spinner inline (disabled + Loader2). `data-testid="new-capture-dialog"` en el content. Submit → `db.createInterview({ discoveryId, title, templateId, companyId: null })` (contactId omitido) → toast "Captura creada" + `navigate('/captures/' + id)`. Los datos (useDiscoveries + useInterviewTemplates) se cargan en CapturesPage y bajan por props.

## 8. Página de detalle de captura

- **pages/CaptureDetailPage.tsx (nuevo, calco estructural de InterviewDetailPage)**: `useParams<{ id }>`; carga encadenada — `getInterview(id)` y con el resultado `getDiscovery(interview.discoveryId)` + condicionales `getCompany(companyId)` / `getContact(contactId)` (fallos de las condicionales degradan a "Sin empresa"/"Sin contacto", no a error state); `useInterviewTemplates` para el nombre del template. Back button ghost "Volver" → `/captures`. Cabecera: h1 + Badge estado; a la derecha, si `companyId` null, Button outline Building2 "Asignar empresa" (`data-testid="assign-company-button"`) que abre el Sheet. Fila muted `{discovery} · {empresa | Sin empresa} · {contacto | Sin contacto} · {template | Sin template}`. Secciones EN ESTE ORDEN, montadas tal cual: `<RecordingSection>` → `<NoteSection>` → `<ScriptSection>`, todas con el mismo `handleInterviewUpdated` (refresca `interview` del estado ready — el Badge pasa a Preparada/Grabada/Resumida sin recargar). Error state (id inexistente o fallo bridge): mensaje + link "Volver a Capturas" → `/captures`. Tras asignar desde el Sheet: `onAssigned(result)` actualiza interview + company/contact del estado y oculta el botón (cabecera refleja sin recargar).

## 9. Sheet de asignación con creación inline

- **components/captures/AssignCompanySheet.tsx (nuevo, `data-testid="assign-company-sheet"`, side right, full-width en mobile)**: props `{ open, onOpenChange, interview, discoveryName, onAssigned: (r: AssignCompanyResult) => void }`. Título "Asignar empresa y contacto" + descripción con «{discoveryName}». Al abrir: `listCompanies(interview.discoveryId)`. Select "Empresa": empresas del discovery + item destacado `+ Nueva empresa` (sentinel `NEW`); si NEW → Inputs inline Nombre (requerido)/Website/LinkedIn. Select "Contacto": disabled con Tooltip "Selecciona primero una empresa" hasta elegir empresa; con empresa EXISTENTE elegida → `listContacts(companyId)` lazy + opciones "Sin contacto" (default, sentinel NONE) + contactos + `+ Nuevo contacto` (NEW); con empresa NUEVA → solo "Sin contacto" y `+ Nuevo contacto`; si NEW → Inputs inline Nombre (requerido)/Posición/LinkedIn. Cambiar de empresa resetea el contacto a NONE. Validación inline on submit ("Campo requerido" bajo cada nombre vacío) SIN pasar por el bridge. Sticky bottom bar: Cancelar outline / "Asignar" default con spinner. Submit → `db.assignInterviewCompany(interview.id, input)` (mutación compuesta atómica de fase 1): `ok` → toast "Empresa asignada", `onAssigned(result)`, cerrar; `!ok` → toast destructive con el mensaje, Sheet ABIERTO, estado del form intacto (AC "sin estado a medias" lo garantiza main). El formulario se remonta por key al abrir (patrón Dialog).
- Integración en CapturesPage (acción ⋯ de fila sin empresa, `onAssigned` → `reload()`) y en CaptureDetailPage (botón de cabecera).

## 10. Edición/eliminación desde el listado + retrocompatibilidad del flujo empresa

- **components/captures/EditCaptureDialog.tsx (nuevo)**: Dialog "Editar captura" con Título (requerido) + Plantilla; incluye Select Contacto SOLO si `interview.companyId !== null` (carga lazy `listContacts(companyId)` al abrir; sentinel NONE). No se reutiliza InterviewFormDialog (campos y placeholder distintos; Contacto condicional) — InterviewFormDialog queda intacto para CompanyDetailPage. Submit → `updateInterview(id, { title, templateId, contactId? })` vía `useCaptures.updateCapture`.
- Eliminar: AlertDialog "Eliminar captura" / "Se eliminarán permanentemente «{título}» y sus notas." → `removeCapture` + toast (copys exactos del AC).
- **hooks/useInterviews.ts**: nueva firma `useInterviews(discoveryId: string, companyId: string)` — `createInterview` envía `{ discoveryId, companyId, ...values }` (CreateInterviewInput nuevo). Resto intacto.
- **pages/CompanyDetailPage.tsx**: única línea — `useInterviews(discoveryId ?? '', companyId ?? '')`. Sus filas siguen navegando a la ruta anidada (decisión de spec: ambas rutas conviven); el AC "captura asignada aparece en Entrevistas de la empresa" sale gratis (`listInterviews` filtra por `companyId`).
- **pages/InterviewDetailPage.tsx**: cero cambios (obtiene company por param de ruta, no por `interview.companyId`; el schema nuevo no lo rompe).

## AC → cambio

29 ACs cubiertos: navegación/listado 8 (fases 5-6), nueva captura 5 (fase 7), detalle 4 (fase 8 + reutilización verificada), guión sin empresa 3 (fase 3), asignación 8 (fases 1, 9), edición/eliminación 3 (fases 1, 10), integraciones 2 (fases 4, 6).

## Breakage presupuestado (QA lo repone; el implementador NO escribe tests)

- `tsc -p tsconfig.test.json`: fixtures de `Interview` sin `discoveryId` en ~10 archivos (RecordingSection, ScriptSection, NoteSection, InterviewDetailPage, CompanyDetailPage.interviews, repository, search, llmService, noteService, GlobalSearch); `tests/helpers/mockApi.ts` sin `listAllInterviews`/`assignInterviewCompany`; llamadas a `useInterviews`/`createInterview` con la firma vieja.
- Runtime: tests de `search.test.ts` que asertan la omisión de entrevistas con empresa irresoluble; tests de repository sobre `createInterview` sin `discoveryId`; tests que rendericen App/Sidebar asertando "Captura"//capture. Documentar en el commit para `/somo-qa-dev`.

## Orden, validación y riesgos

**Orden**: fase 1 (tipos+store+repository) → 2 (ipc+preload) → 3 (llm/note) → 4 (search) → 5 (rutas/sidebar) → 6-7 (listado+dialog) → 8 (detalle) → 9 (sheet) → 10 (edición + useInterviews/CompanyDetailPage). `npm run typecheck` + `npm run lint` por bloque; smoke manual `env -u ELECTRON_RUN_AS_NODE npm run dev` al final (migración de un db.json v1 real, crear captura, grabar, generar guión sin empresa, asignar con empresa+contacto nuevos, regenerar, buscar con ⌘K, cascada de discovery).

**Riesgos**:
1. **Migración**: entrevista v1 con empresa inexistente se elimina (decisión documentada — hoy ya es inalcanzable en la UI); la migración corre ANTES del primer `mutate` y persiste atómica; un fallo cae en el camino `.corrupt-<ts>` existente (nunca crashea).
2. **noteService fuera de Notas técnicas**: tocarlo es obligatorio por el AC de NoteSection íntegra; cambio quirúrgico señalado para el revisor.
3. **Radix dropdown→dialog/sheet**: usar SIEMPRE el mitigador `setTimeout(0)` ya establecido.
4. **Atomicidad de la asignación**: garantizada por diseño (`mutate` único); NO implementar con 2-3 llamadas encadenadas desde el renderer.
5. **`updateInterview` endurecido** (contacto exige empresa de la entrevista): revisar que `recording:stop` (patch de wavPath/status) y los flujos de guión/nota no envían `contactId` — verificado, no lo envían; solo el form de edición, que ya restringe las opciones.
6. **Enlaces duales al detalle**: `/captures/:id` y la ruta anidada muestran la MISMA entrevista con back buttons distintos — es la decisión de la spec (links estables), no unificar.
7. **Índice/redirects con HashRouter**: `Navigate replace` para no ensuciar el historial; la 404 sigue capturando el resto.
