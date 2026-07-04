# SPEC-013 — Crear entrevista y asignar template

> Requisito origen: RF-GUION-001 (Must) · Hito H3 ítem 1 · Checklist: "Crear entrevista dentro de empresa/contacto y asignar template"
> Relacionados: SPEC-006 (entidad Interview: title, companyId, contactId?, templateId?, status, scriptMarkdown?, objectives, wavPath/transcriptPath), SPEC-011 (detalle de empresa donde vive la sección), SPEC-012 (templates asignables), CU-04 del PRD; los ítems 2-4 de H3 (guión LLM + objetivos) rellenarán el detalle
> Naturaleza: feature de producto con UI.

## Descripción

Permite crear entrevistas dentro de una empresa: cada entrevista tiene un título, opcionalmente un contacto de esa empresa y un template de entrevista asignado, y nace en estado borrador. Se listan en el detalle de la empresa y cada una tiene su página de detalle, donde en las siguientes specs aparecerán el guión personalizado y los objetivos generados por IA.

## Alcance de implementación

- Esta spec define **únicamente el código de producción** que debe entregarse: UI (componentes, páginas, estados), datos (queries, mutations, schema si aplica) y lógica de negocio asociada.
- **Los tests automatizados están fuera del alcance del implementador.** No se deben escribir tests unitarios (Vitest / Testing Library) ni tests end-to-end (Playwright) como parte de esta entrega. Los tests los genera la skill `/somo-qa-dev` y los ejecuta `/somo-qa-tester` contra el código ya pusheado, en un paso posterior del pipeline de QA de SOMO. Cualquier test que el implementador entregue será descartado o reemplazado.
- Si la spec requiere algún ajuste de schema, migración Supabase o cambio de RLS, se indica explícitamente en "Notas técnicas". Si no se indica, no hay cambios de infraestructura. **Sin Supabase**; persistencia = api.db de SPEC-006 sin cambios.
- **Matiz:** la generación del guión/objetivos es H3 ítems 2-4 (el detalle muestra su hueco con empty state); grabación/transcripción de la entrevista es H4; sin estados más allá de `draft` en esta spec.

## Criterios de aceptación

### Listado en el detalle de empresa

- GIVEN una empresa con entrevistas WHEN se muestra su detalle THEN aparece la sección Entrevistas donde cada fila presenta el título (clicable), el Badge de estado ("Borrador"), el nombre del contacto y del template si los tiene (`muted`), y el menú de acciones (aria-label "Acciones") con "Editar" y, tras separador, "Eliminar".
- GIVEN una empresa sin entrevistas WHEN se muestra THEN empty state "Aún no hay entrevistas" con el botón "Crear primera entrevista".
- GIVEN la sección cargando WHEN tarda THEN Skeletons.

### Creación

- GIVEN la sección Entrevistas WHEN el usuario pulsa "Nueva entrevista" (o el CTA) THEN se abre un Dialog "Nueva entrevista" con: Título (Input, foco), Contacto (Select opcional con los contactos de la empresa y la opción "Sin contacto") y Template (Select opcional con los templates de entrevista y la opción "Sin template").
- GIVEN el Dialog con título válido WHEN el usuario pulsa "Crear" (o Enter) THEN se crea en estado borrador con las referencias elegidas, aparece el Toast "Entrevista creada" y figura en la lista.
- GIVEN el Dialog con el título vacío o solo espacios WHEN el usuario pulsa "Crear" THEN error inline "Campo requerido" y no se crea.
- GIVEN una empresa sin contactos WHEN se abre el Dialog THEN el Select de contacto muestra solo "Sin contacto"; GIVEN sin templates THEN el de template solo "Sin template" (la creación sigue siendo posible).

### Edición

- GIVEN el menú de una entrevista WHEN el usuario elige "Editar" THEN el Dialog "Editar entrevista" se abre precargado (título, contacto, template); Guardar → Toast "Cambios guardados" y la fila refleja los cambios.
- GIVEN el Dialog de edición con título vacío WHEN el usuario guarda THEN error inline "Campo requerido" y no se modifica.

### Eliminación

- GIVEN el menú de una entrevista WHEN el usuario elige "Eliminar" THEN AlertDialog "Eliminar entrevista" ("Se eliminarán permanentemente «título» y sus notas."); confirmar la elimina con el Toast "Entrevista eliminada".

### Detalle de entrevista (mínimo)

- GIVEN una fila WHEN el usuario pulsa el título THEN navega al detalle de la entrevista, que muestra: back button "Volver" (→ detalle de la empresa), el título como `h1`, el Badge "Borrador", y las referencias (empresa, contacto o "Sin contacto", template o "Sin template").
- GIVEN el detalle WHEN se muestra THEN incluye la sección "Guión" con el empty state "Aún no hay guión" y el secundario "La generación con IA llegará en la siguiente fase".
- GIVEN un id de entrevista inexistente WHEN carga THEN estado de error con enlace "Volver a Discoveries".

### Error de mutación

- GIVEN cualquier mutación con error del bridge WHEN falla THEN Toast de error y la UI no cambia.

## UX Design

### Wireframe textual

**Detalle de empresa** (extiende SPEC-011, debajo de Contactos):

1. Sección **Entrevistas** (heading `h3`) + Button (Plus) "Nueva entrevista" a la derecha.
2. **List**: título-Link (font-medium) + Badge secondary "Borrador" + `muted` "{contacto} · {template}" (los que existan) + DropdownMenu ⋯ "Editar" / separador / "Eliminar" (destructive).
3. Empty: icono MessagesSquare, "Aún no hay entrevistas", Button "Crear primera entrevista".

**Dialog "Nueva entrevista" / "Editar entrevista"** (3 campos → Dialog): Título (Input, placeholder "Discovery con {empresa}", foco), Contacto (Select: "Sin contacto" + contactos), Template (Select: "Sin template" + templates con su fase entre paréntesis si la tienen). Footer Cancelar / Crear|Guardar. Enter envía.

**AlertDialog "Eliminar entrevista"**: descripción literal del AC.

**Detalle de entrevista** (`/discoveries/:discoveryId/companies/:companyId/interviews/:interviewId`) — Layout 2 (top bar "Discoveries"):

1. Back button "Volver" (→ detalle de la empresa).
2. `h1` título + Badge secondary "Borrador" al lado.
3. Fila `muted` de referencias: empresa · contacto ("Sin contacto" si null) · template ("Sin template" si null).
4. Sección **Guión** (heading `h3`): empty state centrado (icono FileText, "Aún no hay guión", secundario muted "La generación con IA llegará en la siguiente fase").
5. Error (id inválido): mensaje + Link "Volver a Discoveries".

### Componentes shadcn utilizados

Ya instalados todos: `Button`, `Input`, `Select`, `Dialog`, `DropdownMenu`, `AlertDialog`, `Badge`, `Toast/sonner`, `Skeleton`, `Tooltip`. Sin instalaciones nuevas.

### Patrón de interacción

- **Dialog de 3 campos** (regla 4.1) con foco al título; Enter = submit; Selects con sentinel para "Sin contacto"/"Sin template" (Radix no admite value vacío).
- **List + DropdownMenu** (patrón consolidado SPEC-010/011/012).
- **Badge de estado con texto** ("Borrador"), no solo color (regla 11.4).
- **AlertDialog con consecuencia** (la cascada real de notas la hace SPEC-006).
- **Toast literal por mutación**; errores → Toast destructive.

### Comportamiento responsive

- **Desktop (lg+):** completo. **Tablet/Mobile:** no aplican (excepción SPEC-001).

## Notas técnicas

- **Bridge:** `api.db.{createInterview,listInterviews,getInterview,updateInterview,deleteInterview}` + `listContacts(companyId)` + `listInterviewTemplates()` (todo de SPEC-006). El create fija `status: 'draft'` en main (ya lo hace el repositorio).
- **Etiqueta de estado:** mapa `draft → "Borrador"` en un módulo compartido (los estados `prepared/recorded/summarized` llegarán en specs futuras).
- **Resolución de nombres** (contacto/template en filas y detalle): con los listados ya cargados en la página (contactos de la empresa + templates globales); sin llamadas extra por fila.
- **Rutas nuevas:** `.../interviews/:interviewId`. Top bar sigue "Discoveries" (prefijo).
- **Sin regresión presupuestada en tests**: la sección Entrevistas es nueva bajo el detalle de empresa; los tests de SPEC-011 no asertan su ausencia (verificar en plan; si alguno cuenta botones/headings globales, presupuestarlo).
- **Divergencia de stack:** igual que specs previas.
