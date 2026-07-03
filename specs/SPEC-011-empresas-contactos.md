# SPEC-011 — Empresas y contactos del discovery

> Requisitos origen: RF-DISC-003 (Must) + RF-DISC-004 (Must) + RF-DISC-005 (Should) · Hito H2 ítems 3-5 · Checklist: "Alta de empresa (nombre, website, LinkedIn)" + "Alta de contacto (nombre, posición, perfil LinkedIn)" + "Editar / eliminar empresas y contactos"
> Relacionados: SPEC-006 (api.db.{create,list,update,delete}{Company,Contact} con cascada), SPEC-010 (detalle del discovery con empty state de empresas — se deroga aquí), CU-02 del PRD; RF-GUION-002 (H3 consumirá estos datos para personalizar el guión)
> Naturaleza: feature de producto con UI.

## Descripción

Puebla el discovery con sus empresas y contactos: dentro del detalle de un discovery el usuario da de alta empresas (nombre, website, página de LinkedIn), y dentro de cada empresa sus contactos (nombre, posición, perfil de LinkedIn). Ambos se pueden editar y eliminar. Estos datos alimentarán la personalización del guión por IA en H3.

## Alcance de implementación

- Esta spec define **únicamente el código de producción** que debe entregarse: UI (componentes, páginas, estados), datos (queries, mutations, schema si aplica) y lógica de negocio asociada.
- **Los tests automatizados están fuera del alcance del implementador.** No se deben escribir tests unitarios (Vitest / Testing Library) ni tests end-to-end (Playwright) como parte de esta entrega. Los tests los genera la skill `/somo-qa-dev` y los ejecuta `/somo-qa-tester` contra el código ya pusheado, en un paso posterior del pipeline de QA de SOMO. Cualquier test que el implementador entregue será descartado o reemplazado.
- Si la spec requiere algún ajuste de schema, migración Supabase o cambio de RLS, se indica explícitamente en "Notas técnicas". Si no se indica, no hay cambios de infraestructura. **Sin Supabase**; persistencia = api.db de SPEC-006 sin cambios.
- **Matiz:** las entrevistas de la empresa son H3 (aquí ni se listan); sin validación de formato de URL más allá de lo indicado; sin import de LinkedIn (exclusión #4 del PRD).

## Criterios de aceptación

### Empresas en el detalle del discovery

- GIVEN el detalle de un discovery con empresas WHEN se muestra la sección Empresas THEN cada fila presenta el nombre (clicable), los iconos-enlace de website y LinkedIn (solo si existen, aria-labels "Abrir website" / "Abrir LinkedIn") y un menú de acciones (aria-label "Acciones").
- GIVEN el detalle sin empresas WHEN se muestra THEN el empty state es "Aún no hay empresas" con el botón "Añadir primera empresa" (deroga el secundario provisional de SPEC-010).
- GIVEN la sección Empresas WHEN el usuario pulsa "Nueva empresa" (o el CTA del empty state) THEN se abre un Dialog "Nueva empresa" con los campos Nombre (foco), Website y LinkedIn (ambos opcionales, con placeholders de URL).
- GIVEN el Dialog con nombre válido WHEN el usuario pulsa "Crear" (o Enter) THEN se crea, el Dialog se cierra, aparece el Toast "Empresa creada" y la fila aparece en la lista.
- GIVEN el Dialog con nombre vacío o solo espacios WHEN el usuario pulsa "Crear" THEN error inline "Campo requerido" y no se crea.
- GIVEN el menú de acciones de una empresa WHEN el usuario elige "Editar" THEN se abre el Dialog "Editar empresa" precargado; al Guardar aparece el Toast "Cambios guardados" y la fila refleja los cambios.
- GIVEN el menú de acciones WHEN el usuario elige "Eliminar" THEN AlertDialog "Eliminar empresa" con la descripción "Se eliminarán permanentemente «nombre» y todos sus contactos y entrevistas."; confirmar la elimina con el Toast "Empresa eliminada".
- GIVEN una fila de empresa WHEN el usuario pulsa el nombre THEN navega al detalle de la empresa.

### Detalle de empresa y contactos

- GIVEN el detalle de una empresa WHEN se muestra THEN presenta back button "Volver" (regresa al detalle del discovery), el nombre como título, sus enlaces de website/LinkedIn si existen, y la sección Contactos.
- GIVEN una empresa con contactos WHEN se muestra la sección Contactos THEN cada fila presenta el nombre, la posición (`muted`, si existe), el icono-enlace de LinkedIn (si existe) y su menú de acciones.
- GIVEN una empresa sin contactos WHEN se muestra THEN el empty state es "Aún no hay contactos" con el botón "Añadir primer contacto".
- GIVEN la sección Contactos WHEN el usuario pulsa "Nuevo contacto" (o el CTA) THEN se abre un Dialog "Nuevo contacto" con los campos Nombre (foco), Posición y LinkedIn (opcionales).
- GIVEN el Dialog de contacto con nombre válido WHEN el usuario pulsa "Crear" THEN se crea con el Toast "Contacto creado" y aparece en la lista.
- GIVEN el Dialog de contacto con nombre vacío WHEN el usuario pulsa "Crear" THEN error inline "Campo requerido" y no se crea.
- GIVEN el menú de un contacto WHEN el usuario elige "Editar" THEN Dialog precargado; Guardar → Toast "Cambios guardados".
- GIVEN el menú de un contacto WHEN el usuario elige "Eliminar" THEN AlertDialog "Eliminar contacto" ("Se eliminará permanentemente «nombre».") y confirmar lo elimina con el Toast "Contacto eliminado".
- GIVEN el detalle de una empresa inexistente WHEN carga THEN estado de error con enlace "Volver a Discoveries".

### Enlaces externos

- GIVEN un icono-enlace de website o LinkedIn WHEN el usuario lo pulsa THEN la URL se abre en el navegador por defecto del sistema (nunca en una ventana de la app).

### Estados y errores

- GIVEN las secciones de empresas o contactos cargando WHEN tardan THEN se muestran Skeletons.
- GIVEN cualquier mutación que devuelva error del bridge WHEN falla THEN Toast de error con el mensaje y la UI no cambia.

## UX Design

### Wireframe textual

**Detalle del discovery** (`/discoveries/:id`, extiende SPEC-010):

1. Cabecera existente (Volver + h1 nombre).
2. Sección **Empresas** (heading `h3`) con Button (default, icono Plus) "Nueva empresa" a la derecha del heading.
3. **List** de empresas: fila con nombre-Link (font-medium, → detalle de empresa) + iconos-enlace Globe (aria-label "Abrir website") y Linkedin (aria-label "Abrir LinkedIn") solo si el campo existe + DropdownMenu ⋯ (aria-label "Acciones"): "Editar" (Pencil) / separador / "Eliminar" (Trash2, destructive).
4. Empty state: icono Building2, "Aún no hay empresas", Button "Añadir primera empresa".

**Dialog "Nueva empresa" / "Editar empresa"** (3 campos → Dialog, regla 4.1): Nombre (Input, foco al abrir; en edición, precargado), Website (Input, placeholder "https://empresa.com"), LinkedIn (Input, placeholder "https://linkedin.com/company/..."). Error inline solo en Nombre. Footer Cancelar / Crear|Guardar. Enter envía.

**Detalle de empresa** (`/discoveries/:discoveryId/companies/:companyId`) — Layout 2 detalle (top bar sigue en "Discoveries"):

1. Back button ghost ArrowLeft "Volver" (→ detalle del discovery).
2. `h1` nombre de la empresa; debajo, fila `muted` con los enlaces Globe/Linkedin (con texto visible del dominio) si existen.
3. Sección **Contactos** (heading `h3`) con Button "Nuevo contacto" a la derecha.
4. **List** de contactos: nombre (font-medium) + posición `muted` + icono-enlace Linkedin (aria-label "Abrir LinkedIn") + DropdownMenu ⋯ "Editar"/"Eliminar".
5. Empty state: icono Users, "Aún no hay contactos", Button "Añadir primer contacto".

**Dialog "Nuevo contacto" / "Editar contacto"**: Nombre (Input, foco), Posición (Input, placeholder "CEO, Head of Product…"), LinkedIn (Input, placeholder "https://linkedin.com/in/..."). Misma estructura.

**AlertDialogs**: "Eliminar empresa" (cascada literal) y "Eliminar contacto".

### Componentes shadcn utilizados

Ya instalados todos los necesarios: `Button`, `Input`, `Dialog`, `DropdownMenu`, `AlertDialog`, `Toast/sonner`, `Skeleton`, `Tooltip`. Sin instalaciones nuevas.

### Patrón de interacción

- **Dialog para crear/editar** (3 campos, regla 4.1); foco al Nombre; Enter = submit; en edición, campos precargados (sin selección automática — a diferencia del renombrado de SPEC-010, aquí hay varios campos).
- **List con nombre-Link a detalle + DropdownMenu de acciones** (mismas reglas que SPEC-010).
- **Solo Nombre es requerido**; Website/Posición/LinkedIn opcionales y se guardan como null si vacíos (contrato SPEC-006).
- **Enlaces externos → navegador del sistema** (nunca ventana Electron): decisión no cubierta por el design system, estándar de apps de escritorio.
- **AlertDialog con cascada explícita para empresa** (tiene hijos); contacto sin cascada (mensaje simple).
- **Toast literal por mutación**; errores → Toast destructive.

### Comportamiento responsive

- **Desktop (lg+):** layout completo. **Tablet/Mobile:** no aplican (excepción documentada en SPEC-001).

## Notas técnicas

- **Bridge:** `api.db.{createCompany,listCompanies,updateCompany,deleteCompany,createContact,listContacts,updateContact,deleteContact}` (SPEC-006). El detalle de empresa resuelve empresa por `listCompanies(discoveryId)` + find (o `getCompany` si existe en el contrato — a criterio del plan).
- **Enlaces externos:** verificar que el main del template ya hace `setWindowOpenHandler` → `shell.openExternal` (patrón electron-vite); si no, añadirlo en main (único cambio de main permitido). Los `<a>` usan `target="_blank" rel="noreferrer"`.
- **Ruta nueva:** `/discoveries/:discoveryId/companies/:companyId`. El sidebar sigue marcando Discoveries (prefijo). Top bar "Discoveries".
- **Normalización:** strings opcionales vacíos/espacios → null antes del bridge.
- **Regresión presupuestada en tests:** el empty state de empresas de SPEC-010 AC-15 pierde el secundario "El alta de empresas llegará en la siguiente fase" y gana CTA → QA remapea.
- **Divergencia de stack:** igual que specs previas.
