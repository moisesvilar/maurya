# Plan de implementación — SPEC-010: gestión de discoveries

> Generado por subagente Plan y aprobado por el orquestador (2026-07-04). Contrato: specs/SPEC-010-gestion-discoveries.md. Todo sobre api.db.*Discovery (SPEC-006). Nota: DbApi SÍ tiene getDiscovery (la spec decía que no); se sigue listDiscoveries+find como manda la spec — cambio local si se prefiere.

## 0. Deps
`npx shadcn@latest add dialog dropdown-menu` + fix de imports al paquete unificado `radix-ui` (mismo incidente que tabs en SPEC-008).

## 1. useDiscoveries
Patrón useNoteTemplates: estado loading|error|ready; sortByUpdatedAtDesc (localeCompare de ISO, client-side); load/reload; createDiscovery(name)→insert+sort+toast "Discovery creado"/toast.error+false; renameDiscovery→replace con el objeto devuelto (updatedAt nuevo)+sort+"Discovery renombrado"; removeDiscovery→filter+"Discovery eliminado".

## 2. UI
- `DiscoveryNameDialog` reutilizable (crear/renombrar): form real (Enter=submit nativo), validación trim "Campo requerido" sin bridge, onOpenAutoFocus con preventDefault+focus()+select() (cubre autofocus, precarga seleccionada y el robo de foco del dropdown), reset al abrir, false del onSubmit mantiene abierto.
- `DiscoveriesPage` (reescribe placeholder): fila superior (muted + "Nuevo discovery"); List ul divide-y con Link nombre + "Creado el {es-ES d MMM yyyy}" + DropdownMenu ⋯ aria "Acciones" (Renombrar / sep / Eliminar destructive); empty (FolderSearch, "Aún no hay discoveries", "Crear primer discovery", SIN secundario); skeletons; error+Reintentar. Dialogs a nivel de página FUERA del dropdown (pendingRename/pendingDelete desde onSelect). AlertDialog "Eliminar discovery" con cascada literal.
- `DiscoveryDetailPage`: useParams; listDiscoveries+find en .then; Volver ghost ArrowLeft → /discoveries; h1 nombre; h3 Empresas + empty (Building2, "Aún no hay empresas", "El alta de empresas llegará en la siguiente fase"); error/id inválido → "Discovery no encontrado" + Link "Volver a Discoveries"; skeletons.

## 3. Rutas
`discoveries/:id` nueva; sidebar/topbar sin cambios (prefijo ya funciona).

## 4. AC→cambio
18 ACs mapeados (tabla del plan).

## 5. Breakage presupuestado (QA)
EXACTAMENTE 1 test rojo: tests/unit/layout/sections.test.tsx AC-08 SPEC-009 (líneas 83-92): getByText síncrono vs loading inicial, texto secundario derogado, y ahora ≥2 botones en main. Layout.test.tsx sobrevive (findByText asíncrono); posibles warnings de act() sin fallo. Remapear AC-08 como derogado parcialmente por SPEC-010.

## 6. Orden, validación, riesgos
Orden: shadcn+fix imports → hook → NameDialog → DiscoveriesPage (suite: solo AC-08 rojo) → DetailPage+ruta → literales → validación completa + humo (orden tras renombrar, Enter, Escape, cascada, detalle, id inválido, persistencia).
Riesgos: imports radix; foco/selección vía onOpenAutoFocus; dropdown→dialog (dialogs fuera del menú; si body queda pointer-events:none, diferir apertura con setTimeout(0)); Enter=form real; re-sort con el objeto devuelto; trim al bridge; effect del detalle con dep [id]; no tocar shell ni literales ajenos.
