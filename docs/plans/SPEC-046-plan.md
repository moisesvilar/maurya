# Plan de implementación — SPEC-046 Entrevistas dentro de grupo con empresa global y N contactos

> Plan autorado por el subagente planner y validado por el orquestador.
> Fuente de verdad: `specs/SPEC-046-entrevistas-grupo-n-contactos.md`. Sin bump de schema; SÍ toca
> main (repository/llmService/noteService) y el contrato `types/captures.ts`. Cero tests.

**Decisión de datos:** el listado de entrevistas del grupo se resuelve con `listAllInterviews()`
filtrado por `interviewGroupId` en el renderer, SIN canal nuevo — `CaptureListItem` ya trae
`companyName`/`contactNames` resueltos en main; volumen trivial; patrón useCaptures. Cero cambios
en `ipc.ts`/`preload`/`DbApi`.

## Fase A — Tipos compartidos y main

### 1. `src/renderer/src/types/captures.ts`
- `AssignCompanyInput`: `contactId?: string|null` → `contactIds?: string[]`; `newContact?` se mantiene (uno) y DEJA de ser excluyente (se suma a los marcados). XOR companyId/newCompany intacto. Doc actualizado.
- `AssignCompanyResult`: `contact: Contact|null` → `contacts: Contact[]` (orden persistido).
- Sin tocar `CaptureListItem` ni los inputs inline.

### 2. `src/main/db/repository.ts` — `assignInterviewCompany` con N contactos
- Conservar XOR y assertName; ELIMINAR la validación «contacto existente o nuevo, no ambos».
- Dentro del ÚNICO mutate: resolver/crear empresa (igual) → crear newContact si viene → `finalContactIds = [...(input.contactIds ?? []), ...(newContact ? [newContact.id] : [])]` → `assertInterviewContacts(draft, company.id, finalContactIds)` (cubre duplicados/pertenencia; con empresa nueva + contactIds no vacío lanza reference de forma natural) → asignar `companyId`/`contactIds` + touched → resultado `contacts` resuelto por find + filter tipado (sin non-null assertion).
- No tocar createInterview/updateInterview/listAllInterviews/assertInterviewContacts.

### 3. `src/main/llmService.ts` — guión
- `buildUserPrompt(interview, discovery, group: InterviewGroup|null, company, contacts: Contact[], template, history)`:
  1. Tras `## Discovery`, condicional `## Objetivos del discovery\n${discovery.objectives}` (si no null/blanco).
  2. Condicional `## Objetivo del grupo\n${group.objective}` (si grupo y objetivo no blanco).
  3. `## Empresa`: + línea `Contexto: ${company.context}` tras LinkedIn si existe y no blanco.
  4. `## Contacto` → `## Contactos` (dentro del branch company!==null): vacío → `Sin contacto asignado todavía.` (texto exacto actual); si no, bloque por contacto en orden de contactIds, unidos por '\n\n': `Nombre:` siempre, `Cargo:`/`LinkedIn:`/`Contexto:` condicionales.
  5. Template/histórico/`## Tarea` sin cambios.
- Call site `doGenerate`: `contacts = interview.contactIds.map(repository.getContact)`; grupo con try/catch → null (referencia rota = sección omitida). Import type InterviewGroup.
- `buildSystemPrompt` NO SE TOCA (ni un byte — prefijo cacheado SPEC-023/031).

### 4. `src/main/noteService.ts` — nota
- `buildUserPrompt(interview, company, contacts: Contact[], template, lines)`: `## Empresa` + `Contexto:` condicional; `## Contactos` con bloque por contacto (Nombre/Cargo/LinkedIn/Contexto); vacío → `Sin contacto asignado.` (texto actual). SIN objetivos de discovery/grupo (decisión de la spec). Resto intacto.
- Call site: mismo `contacts`. `buildSystemPrompt` NO SE TOCA.

**Checkpoint A:** typecheck node limpio (web fallará hasta Fase B — esperado).

## Fase B — Renderer: multiselección en flujos existentes

### 5. `components/interviews/ParticipantsChecklist.tsx` (NUEVO)
- Props: `contacts: Contact[]`, `selectedIds: string[]`, `onChange`, `emptyMessage: string`.
- `<div data-testid="interview-participants" className="flex max-h-48 flex-col gap-2 overflow-y-auto">`; vacío → p muted con emptyMessage; fila = label con `Checkbox` + nombre + posición muted. Toggle: marcar = append (orden de marcado), desmarcar = filter. El label «Participantes» lo pone cada caller.

### 6. `hooks/useInterviews.ts`
- `InterviewFormValues.contactId` → `contactIds: string[]`; create/update envían `contactIds: values.contactIds`.

### 7. `components/interviews/InterviewFormDialog.tsx`
- Estado `contactIds: string[]` (`interview?.contactIds ?? []`); el bloque Select «Contacto» → label «Participantes» + ParticipantsChecklist (`emptyMessage="Esta empresa no tiene contactos"`). Selects de Discovery/Template intactos. `CompanyDetailPage` no requiere cambios.

### 8. `hooks/useCaptures.ts`
- `EditCaptureValues.contactId?` → `contactIds?: string[]` (undefined = no tocar); `updateCapture` propaga.

### 9. `components/captures/EditCaptureDialog.tsx`
- Estado `contactIds` precargado con `interview.contactIds`; bloque hasCompany pasa a ParticipantsChecklist; submit `...(hasCompany ? { contactIds } : {})`.

### 10. `components/captures/AssignCompanySheet.tsx`
- Estado: `selectedContactIds: string[]` + `newContactChecked: boolean` (fuera sentinels NONE/NEW del contacto).
- `handleCompanyChange`: vacía selección y newContactChecked (invariante v3; reset en handler, no en effect).
- Sección «Participantes»: sin empresa → muted «Elige una empresa para ver sus contactos» (sustituye DisabledTooltip; limpiar import huérfano); empresa existente → ParticipantsChecklist + fila Checkbox «+ Nuevo contacto» que despliega los Inputs inline existentes; empresa nueva → solo «+ Nuevo contacto» (comportamiento actual).
- Submit: `{ ...(empresa), contactIds: selectedContactIds, ...(newContactChecked ? { newContact } : {}) }`; validación de nombre condicionada a newContactChecked. Toast/cierre intactos.

### 11. `pages/CaptureDetailPage.tsx`
- `handleAssigned`: `contacts: result.contacts`. CapturesPage no cambia.

**Checkpoint B:** typecheck + lint verdes; grep `contactId` residual limpio (solo generateContactContext y variables de iteración).

## Fase C — Renderer: página del grupo

### 12. `hooks/useGroupInterviews.ts` (NUEVO)
- `useGroupInterviews(groupId)`: `listAllInterviews()` → filter por `interviewGroupId === groupId` → orden `createdAt` asc; envelope → error state.
- `GroupInterviewFormValues { title, companyId, contactIds }`.
- `createInterview(group, values): Promise<Interview|null>`: `window.api.db.createInterview({ discoveryId: group.discoveryId, interviewGroupId: group.id, companyId, contactIds, templateId: group.interviewTemplateId, title })`; Toast «Entrevista creada»; devuelve la entrevista (patrón SPEC-044-iter-1).

### 13. `components/interviews/GroupInterviewFormDialog.tsx` (NUEVO)
- Calco de InterviewFormDialog (key de remonte, Enter submit, foco en Título). DialogContent `data-testid="group-interview-form-dialog"`.
- Título (requerido, error inline) · Empresa (Select requerido sentinel `''`, `data-testid="interview-company-select"`, carga `listCompanies()` en effect; 0 empresas → disabled «No hay empresas» + aviso con Link «Crear empresa» → /companies; error inline) · Participantes (sin empresa → muted «Elige una empresa para ver sus contactos»; con empresa → ParticipantsChecklist con `listContacts(companyId)` lazy; cambiar empresa vacía contactIds en el handler). Sin selector de template. Footer Cancelar + Crear (spinner).

### 14. `pages/InterviewGroupDetailPage.tsx` (NUEVA)
- Params discoveryId/groupId; grupo vía `useInterviewGroups(discoveryId ?? '')` + find (reutiliza updateGroup con Toast). Error/not-found → error state con Link «Volver al discovery». Loading → Skeletons.
- Cabecera: back «Volver» → `/discoveries/:discoveryId`; h1 nombre; Button outline Pencil «Editar» (InterviewGroupFormDialog precargado, con templates vía useInterviewTemplates/useNoteTemplates); bajo el h1: objetivo whitespace-pre-wrap o «Sin objetivo» muted; línea muted templates con fallbacks «Sin template de …».
- Sección «Entrevistas» + Button «Nueva entrevista» (w-full md:w-auto): loading 3 Skeletons; error muted; empty (Mic size-6, «Aún no hay entrevistas en este grupo», «Crear primera entrevista»); lista `data-testid="group-interviews-list"` con filas: título Link (companyId != null → ruta anidada de entrevista; null → `/captures/:id`), Badge estado (mapping existente), muted `{companyName ?? 'Sin empresa'} · {contactNames.join(', ') || 'Sin contacto'}`.
- handleCreate: createInterview → si ok navega a la ruta anidada con values.companyId y devuelve true.

### 15. `pages/DiscoveryDetailPage.tsx`
- Nombre de la fila de grupo pasa a `<Link to={/discoveries/${id}/groups/${group.id}}>` (hover underline). Resto de la fila y menú intactos. Doc: deroga «no navegan» de SPEC-045.

### 16. `App.tsx`
- Ruta `discoveries/:discoveryId/groups/:groupId` → InterviewGroupDetailPage + import + comentario.

**Checkpoint C:** typecheck + lint verdes.

## Invariantes a preservar

1. System prompts byte-estables (llm/note); secciones nuevas SOLO en el mensaje de usuario.
2. Byte-estabilidad condicional del user prompt; textos de degradación EXACTOS actuales.
3. Un solo mutate en assignInterviewCompany; validación N contactos vía assertInterviewContacts (no duplicar).
4. Envelope IPC; sin canales nuevos.
5. Invariante v3 (contactIds ⊆ empresa, sin duplicados); cambiar empresa vacía selección (en handler).
6. getInterviewGroup tolerante (rota → sección omitida); persistir guión/nota solo tras parseo válido.
7. Patrones Radix del repo (key de remonte, onOpenAutoFocus, setTimeout(0), sentinel '' requeridos, resets en handlers).
8. Sin tests; sin bump de schema; HashRouter y rutas de detalle de entrevista intactas.

## Orden de implementación

1. Fase A (§1→§4), checkpoint node. 2. Fase B (§5→§11), checkpoint typecheck+lint+grep. 3. Fase C (§12→§16), checkpoint final.

Riesgos: reset de participantes al cambiar empresa; no-non-null-assertion en el resultado de contacts; no tocar textos de degradación de prompts.
