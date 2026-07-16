# Plan de implementación — SPEC-044 Sección «Empresas» global en el sidebar

> Plan autorado por el subagente planner y validado por el orquestador.
> Fuente de verdad: `specs/SPEC-044-empresas-globales.md`. Solo renderer; **cero cambios** en
> `src/main/`, `src/preload/` y schema (`db.json` sigue en v3). No se escribe ni modifica ningún test.
> Verificado: `npm run typecheck` no incluye `tests/` — el cambio de firma de `useInterviews` no
> rompe el typecheck aunque los tests queden desfasados (los adapta QA).

## 1. `src/renderer/src/hooks/useInterviews.ts` — el `discoveryId` sale del constructor y entra en los values

1. **Firma del hook**: `export function useInterviews(companyId: string): UseInterviewsResult` (se elimina el parámetro `discoveryId`). El único call site es `CompanyDetailPage` (verificado por grep).
2. **`InterviewFormValues`**: añadir el campo `discoveryId: string` (primero, antes de `title`), con doc: en creación es el discovery elegido en el Select del Dialog (SPEC-044); en edición viaja el `discoveryId` de la propia entrevista pero `updateInterview` NO lo envía en el patch.
3. **`createInterview`**: en `window.api.db.createInterview({...})` sustituir el `discoveryId` del closure por `values.discoveryId`. Deps del `useCallback`: `[companyId]`.
4. **`updateInterview` y `removeInterview`**: sin cambios funcionales — el patch sigue llevando SOLO `title`, `contactIds`, `templateId`.
5. Actualizar doc comments (SPEC-044: la sección Entrevistas vive en `/companies/:companyId`; el `discoveryId` viaja en los values). El listado sigue siendo `listInterviews(companyId)`.

## 2. `src/renderer/src/components/interviews/InterviewFormDialog.tsx` — Select «Discovery» solo en modo creación

1. **Imports nuevos**: `Link` de `react-router-dom`; tipo `Discovery` de `@/types/domain`.
2. **Props** (`InterviewFormDialogProps` y `InterviewFormProps`): prop requerida `discoveries: Discovery[]` (solo se usa en creación). Propagar Dialog → Form.
3. **Estado del form**: `const isCreation = interview === null`; `const [discoveryId, setDiscoveryId] = useState(interview?.discoveryId ?? '')` — sentinel `''` = sin elegir (patrón `NewCaptureDialog` SPEC-020, NO el sentinel `NONE`); `const [showDiscoveryError, setShowDiscoveryError] = useState(false)`; `const noDiscoveries = discoveries.length === 0`.
4. **`handleSubmit`** — doble validación inline sin bridge: `titleMissing` + `discoveryMissing = isCreation && discoveryId === ''`; setea ambos errores y retorna si alguno; `onSubmit` envía `{ discoveryId, title: trimmedTitle, contactId, templateId }` (mapeos `NONE`→null intactos). En edición `discoveryId` es el `interview.discoveryId` inicial (el campo no se renderiza).
5. **JSX** — bloque nuevo PRIMERO dentro del `<form>`, antes de Título, envuelto en `{isCreation && (...)}` — calco del bloque Discovery de `NewCaptureDialog.tsx` (líneas 122-161): label `htmlFor="interview-discovery"` «Discovery»; `Select` con `value={discoveryId}`, `onValueChange` = set + clear error, `disabled={noDiscoveries}`; `SelectTrigger` con `id="interview-discovery"`, `data-testid="interview-discovery-select"`, `className="w-full"`, `aria-label="Discovery"`, `aria-invalid={showDiscoveryError || undefined}`; `SelectValue placeholder={noDiscoveries ? 'No hay discoveries' : 'Selecciona un discovery'}`; `SelectContent` con un `SelectItem` por discovery (sin item sentinel); bajo el Select, si `noDiscoveries`: p muted con Link «Crear discovery» → `/discoveries` (patrón SPEC-020); si `showDiscoveryError`: `<p className="text-sm text-destructive">Campo requerido</p>`.
6. **No cambiar**: foco de apertura en Título, `key` de remonte, resto de campos, sentinel `NONE` de Contacto/Template. Doc comment actualizado.

## 3. `src/renderer/src/pages/CompaniesPage.tsx` — página NUEVA (listado global)

Estructura calcada de `CapturesPage` (cabecera) + sección Empresas de `DiscoveryDetailPage` (filas, estados, Dialogs) — traslado, no reimplementación:

1. **Imports**: `React, { useState }`; `Building2, Globe, MoreHorizontal, Pencil, Plus, Trash2`; `Link`; `AlertDialog*`, `Button`, `DropdownMenu*`, `Skeleton`; `CompanyFormDialog`, `ExternalIconLink, LinkedinIcon`; `useCompanies`; tipo `Company`.
2. **Estados y handlers** — copiar de `DiscoveryDetailPage` (50-87): `useCompanies()`, `createOpen`, `pendingEdit`, `pendingDelete`, `openEdit`/`openDelete` con `setTimeout(0)`, `handleConfirmDelete`.
3. **JSX** (root `div.flex.flex-col.gap-6.p-6`):
   - Cabecera (patrón CapturesPage): h1 «Empresas» + `<Button className="w-full md:w-auto">` «Nueva empresa» (Plus).
   - Loading: 3 `<Skeleton className="h-12 w-full" />`.
   - Error: `<p className="py-12 text-center text-sm text-muted-foreground">{state.message}</p>`.
   - Empty: `Building2` size-6 muted aria-hidden, «Aún no hay empresas», Button «Añadir primera empresa».
   - Listado: `<ul data-testid="companies-list" className="flex flex-col divide-y rounded-md border">`; filas con Link a `/companies/${company.id}`, `ExternalIconLink` website (Globe, «Abrir website») y LinkedIn («Abrir LinkedIn») condicionales, DropdownMenu con `data-testid="company-row-actions"` en el trigger (ghost icon, aria-label «Acciones»), items Editar · separator · Eliminar (destructive).
   - Dialogs al pie: `CompanyFormDialog` creación («Nueva empresa»/«Crear», `onSubmit={createCompany}`), `CompanyFormDialog` edición por `pendingEdit`, y `AlertDialog` de borrado con **texto NUEVO** (derogación SPEC-011, cascada v3): título «Eliminar empresa», descripción `Se eliminarán permanentemente «{pendingDelete?.name ?? ''}» y sus contactos. Sus entrevistas se conservarán sin empresa asignada.`, footer Cancelar + Eliminar (destructive).
4. Toasts: NO en la página (los emite `useCompanies`).
5. Doc comment: listado global (SPEC-044, `/companies`, Layout 1), Dialogs fuera del DropdownMenu con `setTimeout(0)`.

## 4. `src/renderer/src/pages/CompanyDetailPage.tsx` — traslado a `/companies/:companyId`

Cambios quirúrgicos; TODO lo demás (Contexto + IA, Contactos, Entrevistas, capacidades, tooltips, dialogs) queda igual:

1. `const { companyId } = useParams<{ companyId: string }>()` (desaparece `discoveryId`).
2. `} = useInterviews(companyId ?? '')` (nueva firma).
3. Añadir `const { state: discoveriesState } = useDiscoveries()` (import de `@/hooks/useDiscoveries`) y `const discoveries = discoveriesState.status === 'ready' ? discoveriesState.discoveries : []` — una carga a nivel de página; si falla degrada a «No hay discoveries» + aviso.
4. Back button: `navigate('/companies')`.
5. Error state: Link «Volver a Empresas» → `/companies`.
6. Link de cada entrevista: `` to={`/discoveries/${interview.discoveryId}/companies/${companyId}/interviews/${interview.id}`} `` (el `discoveryId` sale de la propia entrevista).
7. Los dos `InterviewFormDialog`: prop `discoveries={discoveries}` en ambos.
8. AlertDialog de borrado de **contacto** — descripción nueva: `Se eliminará permanentemente «{pendingDelete?.name ?? ''}». Las entrevistas que lo referencian lo perderán como participante.`
9. Doc comment actualizado (ruta `/companies/:companyId`, SPEC-044).

No tocar: `useContacts(companyId ?? '')`, generación IA, `interviewRefsLabel`, AlertDialog de entrevista, formularios.

## 5. `src/renderer/src/App.tsx` — rutas nuevas + redirect legado con params

1. Import de `CompaniesPage`; añadir `useParams` al import de react-router-dom.
2. Componente auxiliar a nivel de módulo (Navigate no interpola params):

```tsx
/**
 * SPEC-044: la ruta anidada legada de empresa redirige al detalle global.
 * Navigate replace: sin entrada extra en el historial del HashRouter.
 */
function LegacyCompanyRedirect(): React.ReactElement {
  const { companyId } = useParams<{ companyId: string }>()
  return <Navigate to={`/companies/${companyId ?? ''}`} replace />
}
```

3. Rutas: sustituir el element de `discoveries/:discoveryId/companies/:companyId` por `<LegacyCompanyRedirect />`; MANTENER intacta la de `.../interviews/:interviewId`; añadir `companies` → `CompaniesPage` y `companies/:companyId` → `CompanyDetailPage`.
4. Comentario del componente actualizado.

## 6. `src/renderer/src/components/layout/Sidebar.tsx`

1. `Building2` al import de lucide (alfabético).
2. `NAV_ITEMS`: insertar `{ to: '/companies', label: 'Empresas', icon: Building2 },` entre Discoveries y Plantillas.
3. Comentarios: «5 items fijos», nota SPEC-044. El estado activo por prefijo cubre `/companies/:companyId`.

## 7. `src/renderer/src/components/layout/TopBar.tsx`

`SECTION_TITLES`: añadir `{ prefix: '/companies', title: 'Empresas' },` tras `/discoveries`. Sin solapamiento de prefijos.

## 8. `src/renderer/src/pages/DiscoveryDetailPage.tsx` — quitar la sección Empresas

1. Eliminar del JSX: la `<section>` «Empresas» completa, los dos `CompanyFormDialog` y el `AlertDialog` de empresa. El estado `ready` queda con el `<h1>` del nombre.
2. Eliminar estado/handlers muertos: `useCompanies()`, `createOpen`, `pendingEdit`, `pendingDelete`, `openEdit`, `openDelete`, `handleConfirmDelete`.
3. Eliminar imports sin uso — **obligatorio, `noUnusedLocals`**: `Building2, Globe, MoreHorizontal, Pencil, Plus, Trash2` (queda `ArrowLeft`), `AlertDialog*`, `DropdownMenu*`, `CompanyFormDialog`, `ExternalIconLink, LinkedinIcon`, `useCompanies`, tipo `Company` (queda `Discovery`).
4. Conservar: back button, loading/error, resolución por `listDiscoveries` + find. Doc comment (SPEC-044: empresas en `/companies`; el detalle queda con el nombre hasta H11.3).

## 9. Archivos que NO se tocan (verificación explícita)

- `GlobalSearchDialog.tsx` — sus hits navegan a la ruta legada, cubierta por el redirect (H11.6).
- `InterviewDetailPage.tsx` — su back button apunta a la ruta legada → redirect equivalente.
- `useCompanies.ts`, `useContacts.ts`, `useCaptures.ts`, `CompanyFormDialog.tsx`, `ContactFormDialog.tsx`, `NewCaptureDialog.tsx`, `ExternalIconLink.tsx` — se reutilizan tal cual.
- Todo `src/main/`, `src/preload/`, `types/domain.ts` y `tests/`.

## Invariantes a preservar

- **Envelope IPC**: promesas nunca rechazadas; fallo al listar → error state con `result.error.message`; fallo en mutación → toast del hook (las páginas no duplican toasts).
- **Dialogs fuera del DropdownMenu**, gobernados por `pending*`, apertura diferida con `setTimeout(0)`.
- **Patrón de formularios en Dialog**: form real, remonte por `key`, foco al primer Input, validación inline «Campo requerido» sin bridge, sentinel `NONE` para Selects opcionales y `''` para el requerido de Discovery.
- **Sin setState síncrono en efectos de montaje**.
- **`updateInterview` nunca envía `discoveryId` ni `status`**; `createInterview` nunca envía `status`; contacto único como `contactIds` de 0/1 (SPEC-043).
- **Órdenes de listado** heredados de los hooks; la edición no re-ordena.
- **`Navigate replace`** en la ruta legada; la ruta anidada de detalle de ENTREVISTA no se toca.
- **Cero cambios en main/preload/db, cero tests**; `npm run typecheck` + `npm run lint` verdes (cuidado `noUnusedLocals` en DiscoveryDetailPage).
- data-testid exactos: `companies-list`, `company-row-actions`, `interview-discovery-select`.

## Orden de implementación

1. `hooks/useInterviews.ts` — nueva firma + `InterviewFormValues.discoveryId`.
2. `components/interviews/InterviewFormDialog.tsx` — prop `discoveries` + Select solo-creación.
3. `pages/CompanyDetailPage.tsx` — params, links, `useDiscoveries`, AlertDialog contacto.
4. `pages/CompaniesPage.tsx` — página nueva.
5. `App.tsx` — rutas + `LegacyCompanyRedirect`.
6. `Sidebar.tsx` + `TopBar.tsx`.
7. `DiscoveryDetailPage.tsx` — retirada de la sección y limpieza de imports.
8. Verificación: `npm run typecheck` + `npm run lint`.
