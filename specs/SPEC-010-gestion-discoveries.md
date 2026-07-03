# SPEC-010 — Gestión de discoveries (crear, listar, renombrar, eliminar)

> Requisitos origen: RF-DISC-001 (Must) + RF-DISC-002 (Should) · Hito H2 ítems 1-2 · Checklist: "Crear discovery por nombre (como carpeta contenedora)" + "Renombrar / listar / eliminar discoveries"
> Relacionados: SPEC-006 (api.db.{create,list,update,delete}Discovery ya existen, con cascada de borrado), SPEC-009 (página Discoveries del layout — su empty state provisional se deroga aquí), CU-01 del PRD; el detalle del discovery lo rellenará la spec de empresas (H2 ítem 3)
> Naturaleza: feature de producto con UI. Primera feature de dominio end-to-end.

## Descripción

Convierte la sección Discoveries en funcional: el usuario crea discoveries por nombre (la "carpeta" que agrupa las entrevistas de una investigación), ve su listado, los renombra y los elimina. Cada discovery navega a su página de detalle, donde por ahora se muestra el estado vacío de empresas (el alta de empresas es la siguiente spec).

## Alcance de implementación

- Esta spec define **únicamente el código de producción** que debe entregarse: UI (componentes, páginas, estados), datos (queries, mutations, schema si aplica) y lógica de negocio asociada.
- **Los tests automatizados están fuera del alcance del implementador.** No se deben escribir tests unitarios (Vitest / Testing Library) ni tests end-to-end (Playwright) como parte de esta entrega. Los tests los genera la skill `/somo-qa-dev` y los ejecuta `/somo-qa-tester` contra el código ya pusheado, en un paso posterior del pipeline de QA de SOMO. Cualquier test que el implementador entregue será descartado o reemplazado.
- Si la spec requiere algún ajuste de schema, migración Supabase o cambio de RLS, se indica explícitamente en "Notas técnicas". Si no se indica, no hay cambios de infraestructura. **Sin Supabase**; persistencia = api.db de SPEC-006 sin cambios.
- **Matiz:** el detalle del discovery solo muestra su cabecera y el empty state de empresas; el CRUD de empresas/contactos es la siguiente spec. Sin búsqueda (H7).

## Criterios de aceptación

### Listado

- GIVEN discoveries existentes WHEN se muestra la sección Discoveries THEN aparece una lista donde cada fila presenta el nombre (clicable) y su fecha de creación, con un menú de acciones (icono ⋯, aria-label "Acciones").
- GIVEN el listado WHEN los discoveries se ordenan THEN aparecen por fecha de actualización descendente (el más reciente arriba).
- GIVEN ningún discovery WHEN se muestra la sección THEN aparece el empty state con icono, "Aún no hay discoveries" y el botón "Crear primer discovery" (deroga el texto provisional de SPEC-009).
- GIVEN el listado cargando WHEN tarda THEN se muestran Skeletons.
- GIVEN el bridge devuelve error al listar WHEN se muestra la sección THEN aparece el error state con el mensaje y el botón "Reintentar".

### Creación

- GIVEN el listado WHEN el usuario pulsa "Nuevo discovery" (o el CTA del empty state) THEN se abre un Dialog "Nuevo discovery" con un único campo "Nombre" con el foco puesto.
- GIVEN el Dialog con un nombre válido WHEN el usuario pulsa "Crear" (o Enter) THEN se crea, el Dialog se cierra, aparece el Toast "Discovery creado" y el listado lo muestra arriba.
- GIVEN el Dialog con el nombre vacío o solo espacios WHEN el usuario pulsa "Crear" THEN error inline "Campo requerido" y no se crea.
- GIVEN el Dialog abierto WHEN el usuario pulsa Cancelar o Escape THEN se cierra sin crear nada.

### Renombrado

- GIVEN el menú de acciones de un discovery WHEN el usuario elige "Renombrar" THEN se abre un Dialog "Renombrar discovery" con el nombre actual precargado y seleccionado.
- GIVEN el Dialog de renombrado con un nombre válido WHEN el usuario pulsa "Guardar" THEN se actualiza, aparece el Toast "Discovery renombrado" y el listado refleja el cambio.
- GIVEN el Dialog de renombrado con el nombre vacío WHEN el usuario pulsa "Guardar" THEN error inline "Campo requerido" y no se modifica.

### Eliminación

- GIVEN el menú de acciones WHEN el usuario elige "Eliminar" THEN se abre un AlertDialog "Eliminar discovery" cuya descripción advierte la cascada: "Se eliminarán permanentemente «nombre» y todas sus empresas, contactos, entrevistas y notas." con Cancelar (outline) y Eliminar (destructive).
- GIVEN el AlertDialog WHEN el usuario confirma THEN el discovery desaparece del listado y aparece el Toast "Discovery eliminado".

### Detalle (mínimo)

- GIVEN una fila del listado WHEN el usuario pulsa el nombre THEN navega a `/discoveries/:id`, cuyo contenido muestra el nombre del discovery como título de página y el empty state de empresas: "Aún no hay empresas" con el secundario "El alta de empresas llegará en la siguiente fase".
- GIVEN el detalle de un discovery inexistente (id inválido) WHEN carga THEN muestra un estado de error con enlace "Volver a Discoveries".
- GIVEN el detalle WHEN se muestra THEN incluye un back button "Volver" que regresa al listado (página de detalle — regla 2.3).

### Error de mutación

- GIVEN cualquier operación de crear/renombrar/eliminar que devuelva error del bridge WHEN falla THEN aparece un Toast de error con el mensaje y el estado de la UI no cambia.

## UX Design

### Wireframe textual

**Sección Discoveries** (`/discoveries`) — Layout 1 estándar dentro del shell (top bar "Discoveries"):

1. Fila superior: descripción `muted` ("Cada discovery agrupa las entrevistas de una investigación") a la izquierda; Button (default, icono Plus) "Nuevo discovery" a la derecha.
2. **List**: fila por discovery — nombre como enlace (font-medium, hover subrayado) + `muted` fecha de creación ("Creado el 4 jul 2026"); a la derecha DropdownMenu (Button ghost icon MoreHorizontal, aria-label "Acciones") con items "Renombrar" (icono Pencil) y, tras separador, "Eliminar" (icono Trash2, destructive).
3. Empty state centrado: icono FolderSearch, "Aún no hay discoveries", Button "Crear primer discovery".
4. Error state centrado: AlertTriangle + mensaje + Button outline "Reintentar".

**Dialog "Nuevo discovery"** (1 campo → Dialog, regla 4.1): título, Input "Nombre" (placeholder "Discovery de Maurya", autofocus), error inline debajo; footer Cancelar (outline) / Crear (default). Enter envía.

**Dialog "Renombrar discovery"**: idéntico con el nombre precargado y seleccionado; botón "Guardar".

**AlertDialog "Eliminar discovery"**: descripción con la cascada literal del AC; Cancelar / Eliminar (destructive).

**Detalle** (`/discoveries/:id`) — Layout 2 detalle (top bar sigue en "Discoveries"):

1. Back button ghost ArrowLeft "Volver".
2. `h1` con el nombre del discovery.
3. Sección "Empresas" (heading `h3`): empty state centrado (icono Building2, "Aún no hay empresas", secundario muted "El alta de empresas llegará en la siguiente fase").
4. Estado de error (id inválido): mensaje + link "Volver a Discoveries".

### Componentes shadcn utilizados

Ya instalados: `Button`, `Input`, `Tooltip`, `AlertDialog`, `Toast/sonner`, `Alert`, `Skeleton`, `Card`. **A instalar con CLI:** `Dialog`, `DropdownMenu`.

### Patrón de interacción

- **Dialog para crear/renombrar** (1 campo, <10 s — regla 4.1); foco al campo al abrir; Enter = submit.
- **List, no Table** (2 datos por ítem, lectura secuencial — regla 4.2); nombre clicable navega a detalle (sin checkboxes → sin conflicto — regla 7.3).
- **DropdownMenu para 2+ acciones por fila** (regla 7.4): destructiva en rojo tras separador.
- **AlertDialog con consecuencia de cascada explícita** (regla 6.3) — la cascada real la implementó SPEC-006.
- **Orden por updatedAt desc**: los discoveries activos arriba; decisión no cubierta por el design system, documentada aquí.
- **Toast en cada mutación** con los textos literales de los ACs; errores de mutación → Toast destructive (regla 6.1: el error de servidor no va inline).
- **Back button en detalle, no breadcrumbs** (profundidad 2 — regla 2.3).

### Comportamiento responsive

- **Desktop (lg+):** layout completo. **Tablet/Mobile:** no aplican (excepción documentada en SPEC-001).

## Notas técnicas

- **Bridge:** exclusivamente `api.db.{createDiscovery,listDiscoveries,updateDiscovery,deleteDiscovery}` (SPEC-006). El detalle usa `listDiscoveries` + find por id (no hay `getDiscovery`; volumen trivial) — si el plan prefiere añadir un helper en renderer, sin tocar main.
- **Rutas:** `/discoveries` ya existe (SPEC-009); nueva `/discoveries/:id`. El item del sidebar sigue activo en el detalle (prefijo).
- **Orden:** sort client-side por `updatedAt` desc (volumen ≤ decenas — client-side, regla 7.1).
- **Fechas:** formato es-ES ("4 jul 2026") con `toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })`.
- **Regresión presupuestada en tests:** el empty state de SPEC-009 AC-08 cambia (texto secundario y CTA) → QA remapea/deroga; el resto del shell intacto.
- **Divergencia de stack:** igual que specs previas.
