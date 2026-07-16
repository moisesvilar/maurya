# Plan de implementación — SPEC-045 Discoveries con objetivos y grupos de entrevistas

> Plan autorado por el subagente planner y validado por el orquestador.
> Fuente de verdad: `specs/SPEC-045-discovery-objetivos-grupos.md`. Solo renderer; cero cambios en
> `src/main/`, `src/preload/` y `types/domain.ts` (contrato SPEC-043 completo). Cero tests.

Archivos: 2 nuevos (`hooks/useInterviewGroups.ts`, `components/discoveries/InterviewGroupFormDialog.tsx`),
4 modificados (`hooks/useDiscoveries.ts`, `components/discoveries/DiscoveryNameDialog.tsx`,
`pages/DiscoveriesPage.tsx`, `pages/DiscoveryDetailPage.tsx`).

Call sites verificados: `DiscoveryNameDialog` solo en `DiscoveriesPage`; `useDiscoveries` también en
`CapturesPage` y `CompanyDetailPage` pero SOLO destructuran `state` — cambiar firmas de mutaciones no los rompe.

## 1. `hooks/useDiscoveries.ts` — propagar `objectives`

- Nuevo tipo exportado `DiscoveryFormValues { name: string; objectives: string | null }` (valores ya normalizados '' → null).
- `createDiscovery: (values: DiscoveryFormValues) => Promise<boolean>` (antes `(name)`); envía `{ name, objectives }`; Toast 'Discovery creado'.
- `renameDiscovery` se RENOMBRA a `updateDiscovery: (id, values: DiscoveryFormValues) => Promise<boolean>`; envía ambos campos; Toast pasa a 'Cambios guardados'.
- `reload`/`removeDiscovery` intactos. JSDoc actualizado (SPEC-010 + SPEC-045).

## 2. `components/discoveries/DiscoveryNameDialog.tsx` — Textarea «Objetivos»

- Props: + `initialObjectives?: string` ('' default); `onSubmit: (values: DiscoveryFormValues) => Promise<boolean>`.
- Form interno: estado `objectives`; submit → `{ name: trimmed, objectives: objectives.trim() === '' ? null : objectives }` (texto tal cual salvo vacío → null). Validación de nombre intacta.
- JSX bajo el Input Nombre: label «Objetivos» + `<Textarea id="discovery-objectives" data-testid="discovery-objectives-textarea" rows={4} placeholder="¿Qué quieres aprender con este discovery?">`. Opcional, sin aria-invalid.
- Key de remonte ampliada: `${String(open)}-${initialName}-${initialObjectives}`. Foco inicial en Nombre intacto (focus+select).

## 3. `pages/DiscoveriesPage.tsx` — call sites + AlertDialog v3

- Hook: `{ state, reload, createDiscovery, updateDiscovery, removeDiscovery }`.
- `pendingRename`/`openRename` → `pendingEdit`/`openEdit`; item de menú «Renombrar» → «Editar» (icono Pencil).
- Dialog creación: `onSubmit={createDiscovery}`. Dialog edición: `title="Editar discovery"`, `initialName`, `initialObjectives={pendingEdit?.objectives ?? ''}`, `onSubmit` → `updateDiscovery(id, values)`.
- AlertDialogDescription v3 (deroga SPEC-010): `Se eliminarán permanentemente «{nombre}», sus grupos y sus entrevistas con sus notas. Las empresas y los contactos se conservarán.`

## 4. `hooks/useInterviewGroups.ts` — hook nuevo (clon de useCompanies)

- `InterviewGroupsState` loading/error/ready; `InterviewGroupFormValues { name, objective: string|null, interviewTemplateId: string|null, noteTemplateId: string|null }`.
- `useInterviewGroups(discoveryId)`: efecto con dep `[discoveryId]`, setState en callback de la promesa; ready con orden `createdAt` asc.
- `createGroup` → `createInterviewGroup({ discoveryId, ...values })`, Toast 'Grupo creado'; `updateGroup` → map por id sin re-ordenar, Toast 'Cambios guardados'; `removeGroup` → filter, Toast 'Grupo eliminado'. Fallos → toast.error + false.

## 5. `components/discoveries/InterviewGroupFormDialog.tsx` — Dialog nuevo (4 campos)

- Calco estructural de `InterviewFormDialog` (Dialog + form interno con key `${String(open)}-${group?.id ?? 'new'}`, sentinel `NONE='none'`).
- Props: open/onOpenChange/title/submitLabel/`interviewTemplates`/`noteTemplates`/`group?`/`onSubmit(values)`.
- Estados: name/objective/interviewTemplateId/noteTemplateId (precarga desde group, null→NONE), showRequiredError, submitting.
- Submit: nombre requerido inline; values normalizados (objective ''→null, NONE→null); cierra solo con true.
- JSX: (1) Nombre Input ref+aria-invalid+error; (2) Objetivo Textarea rows=3; (3) Select template de preguntas — trigger `id="group-interview-template"`, `data-testid="group-interview-template-select"`, item NONE «Sin template» + `templateLabel(t)` REUTILIZADO de `@/components/interviews/templateLabel`; (4) Select template de notas — `data-testid="group-note-template-select"`, item NONE + nombre a secas. Footer Cancelar (outline) + submit disabled={submitting}.
- DialogContent con `data-testid="group-form-dialog"` y `onOpenAutoFocus` → preventDefault + focus Nombre (sin select()).

## 6. `pages/DiscoveryDetailPage.tsx` — rework del detalle

1. Sustituir el useEffect+listDiscoveries local por `useDiscoveries()`: `discovery` derivado por find; loading → Skeletons; error o not-found → error state con link «Volver a Discoveries». Eliminar tipo local y useEffect.
2. Hooks: `useInterviewGroups(id ?? '')`, `useInterviewTemplates()`, `useNoteTemplates()` (arrays derivados de ready).
3. Estado de Dialogs: `editDiscoveryOpen`, `createGroupOpen`, `pendingEditGroup`, `pendingDeleteGroup` + open* con setTimeout(0) + handleConfirmDeleteGroup.
4. Cabecera: h1 + Button outline Pencil «Editar» (abre DiscoveryNameDialog de edición).
5. Sección «Objetivos»: `<p data-testid="discovery-objectives">` con `whitespace-pre-wrap` si hay texto; «Aún no hay objetivos» muted si null/vacío (testid en ambos estados).
6. Sección «Grupos de entrevistas»: heading responsive con Button «Nuevo grupo» (w-full md:w-auto); loading 3 Skeletons; error muted centrado; empty con `Layers` size-8 + «Aún no hay grupos de entrevistas» + «Crear primer grupo»; List `data-testid="interview-groups-list"` con filas: columna principal min-w-0 (nombre + objetivo truncate muted debajo), refs `{interviewTemplateName(group)} · {noteTemplateName(group)}` muted shrink-0 (helpers: find por id → nombre; null u huérfano → 'Sin template de preguntas'/'Sin template de notas'), DropdownMenu con `data-testid="group-row-actions"` (Editar · sep · Eliminar destructive). Filas SIN Link (no navegan).
7. Dialogs al pie: DiscoveryNameDialog edición (initialName/initialObjectives, onSubmit updateDiscovery), InterviewGroupFormDialog creación y edición, AlertDialog «Eliminar grupo» con `Se eliminará «{nombre}». Sus entrevistas se conservarán sin grupo.`
8. Imports: Layers, MoreHorizontal, Pencil, Plus, Trash2; AlertDialog*; DropdownMenu*; ambos Dialogs; los 4 hooks; InterviewGroup. Retirar useEffect/imports muertos (noUnusedLocals). JSDoc actualizado.

## Invariantes a preservar

1. Envelope IPC discriminando `result.ok`; listar → error state; mutaciones → toast.error del hook.
2. Cero cambios main/preload/types/tests/docs.
3. Dialogs a nivel de página FUERA del DropdownMenu, apertura diferida setTimeout(0).
4. Form interno remontado por key + onOpenAutoFocus (discovery: focus+select; grupo: focus sin select).
5. Validación inline sin bridge solo en Nombre; submit deshabilita botón; cierra solo con true.
6. Normalización ''/espacios → null (objetivos) y NONE → null (Selects).
7. Filas de grupo NO navegan; SET NULL resiliente («Sin template …» sin crash).
8. `react-hooks/set-state-in-effect`: setState en callback de promesa.
9. `CapturesPage`/`CompanyDetailPage` solo consumen `state` de useDiscoveries — no tocar state/reload/removeDiscovery.
10. data-testid exactos: `discovery-objectives-textarea`, `discovery-objectives`, `interview-groups-list`, `group-row-actions`, `group-form-dialog`, `group-interview-template-select`, `group-note-template-select`.
11. Toasts: 'Discovery creado', 'Cambios guardados', 'Discovery eliminado', 'Grupo creado', 'Grupo eliminado'.
12. Typecheck + lint verdes; TS estricto con tipos de retorno explícitos.

## Orden de implementación

1. `hooks/useDiscoveries.ts` → 2. `DiscoveryNameDialog.tsx` → 3. `DiscoveriesPage.tsx` (checkpoint typecheck) → 4. `hooks/useInterviewGroups.ts` → 5. `InterviewGroupFormDialog.tsx` → 6. `DiscoveryDetailPage.tsx` → 7. `npm run typecheck && npm run lint`.
