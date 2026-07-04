# Plan de implementación — SPEC-018: búsqueda global (⌘K)

> Generado por subagente Plan y aprobado por el orquestador (2026-07-04). Contrato: specs/SPEC-018-busqueda-global.md. Hallazgo clave: las rutas reales de App.tsx son ANIDADAS (`/discoveries/:discoveryId/companies/:companyId[/interviews/:interviewId]`) — las planas de la nota técnica de la spec no existen; se navega a las anidadas (desviación razonada, misma intención). Única dependencia nueva: `cmdk`.

## 1. Main
- **src/main/db/search.ts (nuevo)**: `normalizeSearchText` = NFD + strip diacríticos + lowercase; `searchGlobal(query)` → query en blanco = grupos vacíos; un solo read del store; Maps para contexto O(1); match por subcadena normalizada en ambos lados sobre nombre/título; `GROUP_LIMIT = 8` por grupo (slice, orden de inserción); hits con contexto resuelto; lookups undefined → omitir hit (defensivo).
- Canal en src/main/db/ipc.ts: `handleDb('db:search', searchGlobal)` — hereda envelope DbResult.

## 2. Tipos + bridge
- **types/search.ts (nuevo, DOM-free)**: SearchDiscoveryHit {id,name}; SearchCompanyHit {id,discoveryId,name,discoveryName}; SearchContactHit {id,name,companyId,companyDiscoveryId,companyName}; SearchInterviewHit {id,title,companyId,discoveryId,companyName,status}; SearchResults.
- types/domain.ts: `DbApi.search(query) => Promise<DbResult<SearchResults>>` (import type-only de ./search).
- preload/index.ts: `db.search` → invoke('db:search', query). index.d.ts sin cambios (tipa vía DbApi).

## 3. UI
1. `npm install cmdk`; **ui/command.tsx a mano** (estilo shadcn estándar completo, calibrado con dialog.tsx; CommandDialog compone Dialog/DialogContent con header sr-only). No tocar ui/** existentes.
2. **hooks/useGlobalSearch.ts**: {query, state idle|ready|error, results}; debounce 150-200ms con cleanup; blanco → idle sin llamar; guarda anti-stale; !ok → error.
3. **components/search/GlobalSearchDialog.tsx**: CommandDialog ~640px, `<Command shouldFilter={false}>`, CommandInput placeholder "Buscar…" (autofocus cmdk). Idle → div muted LITERAL "Escribe para buscar discoveries, empresas, contactos o entrevistas." (NO CommandEmpty en idle — con shouldFilter=false se mostraría siempre); error → "No se pudo buscar"; grupos solo con hits en orden "Discoveries" (FolderSearch) / "Empresas" (Building2) / "Contactos" (User) / "Entrevistas" (MessagesSquare); item = nombre + contexto muted derecha; entrevistas + Badge secondary STATUS_LABELS. CommandEmpty "Sin resultados" solo con query y sin error. onSelect → navigate rutas ANIDADAS (contacto → empresa del contacto) + cerrar. Flechas+Enter los da cmdk.
4. **TopBar.tsx**: justify-between + Button outline sm derecha: Search + "Buscar" + `<kbd aria-hidden>⌘K</kbd>` (accessible name limpio "Buscar"). Estado open aquí; keydown global (metaKey||ctrlKey)+'k' → preventDefault+abrir; cleanup. Cerrar resetea query → reabrir vacío.

## 4. AC→cambio
18 ACs mapeados (apertura/cierre 4, resultados 7, navegación 5, estados 3) — tabla del plan.

## 5. Breakage presupuestado EXACTO
- Runtime (269 tests/44 archivos): **0 fallos** (tests de layout asertan roles por nombre, no cuentan botones; diálogo cerrado no renderiza; nadie llama search).
- `tsc -p tsconfig.test.json`: **exactamente 1 error nuevo** en tests/helpers/mockApi.ts (createMockDbApi sin `search`). QA lo repone.

## 6. Orden, validación, riesgos
Orden: cmdk → types → main search+ipc → preload → ui/command → hook → dialog → TopBar. Validación: typecheck limpio, vitest 269 PASS, lint, smoke `env -u ELECTRON_RUN_AS_NODE npm run dev` (⌘K, acentos, navegación). Riesgos: rutas spec vs reales (resuelto); CommandEmpty en idle (mitigado); stale responses (guarda); cmdk sin CLI (manual); kbd en accessible name (aria-hidden).
