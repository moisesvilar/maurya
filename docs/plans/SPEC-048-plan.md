# Plan de implementación — SPEC-048 Búsqueda global y navegación adaptadas al modelo v3

> Plan autorado por el subagente planner y validado por el orquestador.
> Fuente de verdad: `specs/SPEC-048-busqueda-navegacion-v3.md`. 4 archivos; sin canales IPC nuevos,
> sin cambios de rutas (App.tsx solo lectura: `/companies/:companyId` y
> `/discoveries/:discoveryId/groups/:groupId` ya existen). Cero tests.

## 1. `src/renderer/src/types/search.ts`

- `SearchCompanyHit`: eliminar `discoveryId` → `{ id, name }`; JSDoc sin «ancla transicional» (destino `/companies/:id`, SPEC-048).
- `SearchContactHit`: eliminar `companyDiscoveryId` → `{ id, name, companyId, companyName }`.
- Nuevo `SearchGroupHit { id, discoveryId, name, discoveryName }` (entre DiscoveryHit y CompanyHit); JSDoc: ruta del grupo + contexto resuelto en main.
- `SearchResults`: `groups: SearchGroupHit[]` ENTRE `discoveries` y `companies`.
- Módulo type-only sin DOM (lo importan main y preload).

## 2. `src/main/db/search.ts`

- Imports: + `SearchGroupHit`; `Company` se conserva (companiesById sigue en uso).
- ELIMINAR el ancla transicional completa (anchorDiscoveryByCompany + fallbackDiscoveryId + anchorFor + comentario SPEC-043).
- Bloque companies: toda empresa que hace match entra — `companies.push({ id, name })` (deroga la omisión; AC «sistema sin discoveries»).
- Bloque contacts: sin anchorFor; omisión defensiva solo si la empresa no resuelve; push `{ id, name, companyId, companyName }`.
- Nuevo bloque groups (entre discoveries y companies): `discoveryNameById = new Map(store.discoveries.map(d => [d.id, d.name]))`; bucle sobre `store.interviewGroups` con `matches(group.name)` (helper `normalizeSearchText` existente, NO tocarlo), `break` al `GROUP_LIMIT` (8), `continue` si `discoveryNameById.get(group.discoveryId) === undefined`; push `{ id, discoveryId, name, discoveryName }`.
- `emptyResults()`: + `groups: []`. Return `{ discoveries, groups, companies, contacts, interviews }`.
- Bloque interviews: SIN cambios (SPEC-020 conservado). JSDoc de searchGlobal actualizado.

## 3. `src/renderer/src/components/search/GlobalSearchDialog.tsx`

- Import `Layers` de lucide.
- Empresas: `onSelect` → `closeAndNavigate(`/companies/${hit.id}`)`. Contactos: → `closeAndNavigate(`/companies/${hit.companyId}`)` (contexto `companyName` intacto).
- Grupo nuevo «Grupos» ENTRE Discoveries y Empresas, patrón exacto de la fila de contacto:
  CommandGroup heading «Grupos», CommandItem key/value `group-${hit.id}`, icono `<Layers />` (sizing heredado), nombre truncate, contexto muted `hit.discoveryName` con `ml-auto`, onSelect → `/discoveries/${hit.discoveryId}/groups/${hit.id}`. Grupo oculto si vacío.
- Entrevistas: SIN cambios. Sin data-testid nuevos. JSDoc actualizado (orden Discoveries → Grupos → Empresas → Contactos → Entrevistas; SPEC-048).

## 4. `src/renderer/src/pages/InterviewDetailPage.tsx`

- Back button: con `state.status === 'ready'` y `interviewGroupId !== null` → `/discoveries/${state.interview.discoveryId}/groups/${state.interview.interviewGroupId}`; en cualquier otro caso → `/companies/${companyId}` (directo, sin redirect legado). Mantener variant ghost + ArrowLeft.
- `useParams`: eliminar `discoveryId` del destructuring y del genérico (quedaría sin uso — lint). `companyId`/`interviewId` se conservan.
- Error state «Volver a Discoveries» SIN cambios. AC «grupo borrado tras cargar»: sin lógica extra (error state de SPEC-046 lo cubre). JSDoc actualizado.

## Archivos que NO se tocan

`ipc.ts`, `preload/index.ts`, `types/domain.ts`, `hooks/useGlobalSearch.ts`, `App.tsx`, `store.ts`, `tests/**`.

## Invariantes a preservar

- Contrato IPC estable (mismo canal `db:search`, solo cambia el shape). Cero canales nuevos.
- Normalización única `normalizeSearchText` (NFD) para todos los grupos; límite 8 con break en orden de inserción.
- La búsqueda nunca rompe: referencia irresoluble ⇒ hit omitido (contacto/entrevista/grupo); las EMPRESAS ya no se omiten nunca.
- Un único `read()` por búsqueda; Maps O(1); query vacía ⇒ grupos vacíos.
- Entrevistas SPEC-020 intactas (sin empresa → /captures/:id); redirects legados de SPEC-044 conservados.
- Patrón palette SPEC-018 (shouldFilter false, grupos vacíos ocultos, closeAndNavigate).
- Error states intactos. Typecheck + lint verdes (el typecheck detecta call sites olvidados).

## Orden de implementación

1. `types/search.ts` → 2. `src/main/db/search.ts` → 3. `GlobalSearchDialog.tsx` → 4. `InterviewDetailPage.tsx` → 5. `npm run typecheck && npm run lint`.
