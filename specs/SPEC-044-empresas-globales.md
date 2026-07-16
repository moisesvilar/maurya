# SPEC-044 — Sección «Empresas» global en el sidebar con contactos por empresa

> Origen: ítem 2 de H11 en `docs/checklist.md` (RF-DISC-006, RF-DISC-007), draft
> `docs/drafts/company-contact-entities-20260716.md`. Depende de SPEC-043 (modelo v3: empresas
> globales ya persistidas y expuestas por `listCompanies()` global). Traslada la gestión de
> empresas/contactos desde el árbol del discovery a una sección global propia.

## Descripción

Con el modelo v3 las empresas ya no pertenecen a un discovery, pero su gestión sigue enterrada
dentro del detalle de cada discovery. Esta spec crea la sección «Empresas» en el sidebar: un
listado global con CRUD completo (nombre, website, LinkedIn, contexto) y, dentro de cada empresa,
la sección «Contactos» con su CRUD (nombre, posición, LinkedIn, contexto). El enriquecimiento de
contexto con IA (web + LinkedIn vía MCP, H8) se conserva tal cual. El detalle de empresa deja de
vivir bajo `/discoveries/...` y las rutas antiguas redirigen a la nueva.

## Alcance de implementación

- Esta spec define **únicamente el código de producción** que debe entregarse: UI (componentes,
páginas, estados), datos (queries, mutations, schema si aplica) y lógica de negocio asociada.
- **Los tests automatizados están fuera del alcance del implementador.** No se deben escribir tests
unitarios (Vitest / Testing Library) ni tests end-to-end (Playwright) como parte de esta entrega.
Los tests los genera la skill `/somo-qa-dev` y los ejecuta `/somo-qa-tester` contra el código ya
commiteado, en un paso posterior del pipeline de QA de SOMO. Cualquier test que el implementador
entregue será descartado o reemplazado.
- Si la spec requiere algún ajuste de schema, migración Supabase o cambio de RLS, se indica
explícitamente en "Notas técnicas". Si no se indica, no hay cambios de infraestructura. En este
proyecto no hay Supabase y esta spec NO cambia el schema (`db.json` sigue en v3 de SPEC-043).
- La lógica interna de las secciones trasladadas (formularios de empresa/contacto, generación de
contexto con IA, listado de entrevistas) **no se reimplementa**: se mueve/reutiliza tal cual desde
`CompanyDetailPage`/`DiscoveryDetailPage`; solo se toca lo que el cambio de ruta y el selector de
discovery exigen.

## Criterios de aceptación

### Sidebar y navegación

- GIVEN el sidebar de navegación WHEN se renderiza THEN muestra un ítem nuevo «Empresas» (icono `Building2`) entre «Discoveries» y el resto de ítems, que navega a `/companies`.
- GIVEN la ruta `/companies` WHEN está activa THEN el top bar muestra el título «Empresas» y el ítem del sidebar queda marcado activo.
- GIVEN la ruta legada `/discoveries/:discoveryId/companies/:companyId` WHEN se navega a ella THEN redirige a `/companies/:companyId` (replace, sin entrada extra en el historial).

### Listado global de empresas

- GIVEN empresas existentes WHEN se abre `/companies` THEN se listan TODAS las del sistema en una List, cada fila con: nombre (Link al detalle `/companies/:id`), iconos-enlace externos de website y LinkedIn solo si existen, y el menú de acciones (⋯) con «Editar» y «Eliminar».
- GIVEN el listado WHEN se pulsa «Nueva empresa» THEN se abre el Dialog de empresa existente (nombre requerido, website, LinkedIn, contexto) y al crear se muestra Toast «Empresa creada» y la empresa aparece en el listado.
- GIVEN el Dialog de empresa con nombre vacío WHEN se pulsa «Crear» THEN se muestra el error inline «Campo requerido» y no se crea nada.
- GIVEN una empresa WHEN se elige «Editar» en su menú THEN se abre el mismo Dialog precargado y al guardar se muestra Toast y los cambios se reflejan en el listado.
- GIVEN una empresa WHEN se elige «Eliminar» THEN se abre un AlertDialog «Eliminar empresa» cuya descripción avisa de que se eliminarán permanentemente la empresa y sus contactos y de que sus entrevistas se conservarán sin empresa asignada, y al confirmar la empresa desaparece del listado con Toast.
- GIVEN cero empresas WHEN se abre `/companies` THEN se muestra un empty state con icono `Building2`, texto «Aún no hay empresas» y botón «Añadir primera empresa».
- GIVEN un fallo del bridge al listar WHEN se abre `/companies` THEN se muestra el error state con el mensaje del envelope.
- GIVEN el listado cargando WHEN aún no hay respuesta THEN se muestran Skeletons de fila.

### Detalle de empresa (global)

- GIVEN una empresa existente WHEN se abre `/companies/:companyId` THEN se muestra el back button «Volver» (a `/companies`), la cabecera con nombre + iconos externos + «Editar», y las mismas secciones que el detalle actual en el mismo orden: Contexto (con su generación IA), Contactos y Entrevistas.
- GIVEN un id de empresa inexistente WHEN se abre `/companies/:companyId` THEN se muestra el error state con enlace «Volver a Empresas».
- GIVEN la sección Contexto WHEN la empresa no tiene contexto THEN se conserva el comportamiento actual (mensaje de vacío y generación con IA si hay clave/fuentes), sin regresiones.

### Contactos de la empresa

- GIVEN el detalle de una empresa con contactos WHEN se renderiza la sección Contactos THEN cada fila conserva el comportamiento actual: nombre, posición, enlace LinkedIn condicional, generación de contexto desde LinkedIn (si MCP configurado) y menú con «Editar»/«Eliminar».
- GIVEN la sección Contactos WHEN se pulsa «Nuevo contacto» THEN se abre el Dialog de contacto actual (nombre requerido, posición, LinkedIn, contexto) y al crear aparece en la lista con Toast.
- GIVEN un contacto WHEN se elige «Eliminar» THEN el AlertDialog avisa de que las entrevistas que lo referencian lo perderán como participante, y al confirmar desaparece con Toast.

### Entrevistas de la empresa (transicional hasta H11.4)

- GIVEN el detalle de una empresa con entrevistas WHEN se renderiza la sección Entrevistas THEN se listan las entrevistas de la empresa con su comportamiento actual (link al detalle, badge de estado, refs de contactos/template).
- GIVEN la sección Entrevistas WHEN se pulsa «Nueva entrevista» THEN el Dialog de entrevista muestra, además de sus campos actuales, un Select «Discovery» (requerido) con los discoveries del sistema.
- GIVEN el Dialog de nueva entrevista sin discovery seleccionado WHEN se pulsa «Crear» THEN se muestra el error inline «Campo requerido» bajo Discovery y no se crea nada.
- GIVEN el Dialog válido con discovery elegido WHEN se pulsa «Crear» THEN la entrevista se crea en ese discovery con la empresa de la página y el contacto/template elegidos, y se navega a su detalle.
- GIVEN una entrevista listada WHEN se pulsa su título THEN navega a su detalle por la ruta anidada existente construida con el `discoveryId` de la propia entrevista.

### Discovery sin sección Empresas

- GIVEN el detalle de un discovery WHEN se renderiza THEN ya NO muestra la sección «Empresas» (la gestión vive en `/companies`); el resto del detalle queda intacto hasta H11.3.

## UX Design

### Wireframe textual

**Pantalla 1 — `/companies` (Layout 1 — Estándar):**

- Top bar: título «Empresas».
- Cabecera de contenido: h1 «Empresas» a la izquierda; Button (variant default, icono Plus) «Nueva empresa» a la derecha.
- List (ul con divide-y, borde redondeado — mismo patrón visual que la lista de empresas actual de `DiscoveryDetailPage`): por fila → nombre como Link (hover underline), ExternalIconLink de website (icono Globe) y LinkedIn (icono LinkedinIcon) condicionales, y a la derecha DropdownMenu (trigger Button ghost icon `MoreHorizontal`, aria-label «Acciones») con «Editar» (icono Pencil) · separator · «Eliminar» (variant destructive, icono Trash2).
- Empty state centrado: icono `Building2` 24px muted, «Aún no hay empresas», Button default «Añadir primera empresa».
- Error state centrado: mensaje muted del envelope.
- Loading: 3 Skeletons de fila (h-12).

**Pantalla 2 — `/companies/:companyId` (Layout 2 — Detalle):**

- Back button ghost «Volver» (ArrowLeft) → `/companies`.
- Cabecera y secciones EXACTAMENTE las de la actual `CompanyDetailPage` (nombre h1 + iconos externos + Button «Editar»; secciones Contexto → Contactos → Entrevistas en scroll), con dos únicos cambios: el back button apunta a `/companies` y el Dialog de «Nueva entrevista» incorpora el Select «Discovery» (ver abajo).
- Dialog «Nueva entrevista» (existente, `InterviewFormDialog`): campo nuevo Select «Discovery» (requerido, opciones = discoveries del sistema por nombre, placeholder «Selecciona un discovery») colocado PRIMERO, encima de Título; si no hay discoveries, el Select indica «No hay discoveries» y el Dialog muestra el aviso con link «Crear discovery» (patrón del Dialog de captura de SPEC-020).

### Componentes shadcn utilizados

Componentes: Button, Dialog, AlertDialog, DropdownMenu, Input, Select, Toast (sonner), Skeleton, Badge (sección Entrevistas existente). Sin componentes adicionales no instalados.

### data-testid

- `companies-list` — la List del listado global.
- `company-row-actions` — el trigger del DropdownMenu de cada fila.
- `interview-discovery-select` — el Select «Discovery» del Dialog de entrevista.

El resto de elementos son localizables por role/label/text (mismos labels que las pantallas de origen).

### Patrón de interacción

- List (no Table): cada empresa expone 1-2 datos + iconos; sin sorting/filtering (regla 4.2). Volumen esperado: decenas → sin paginación (client-side ≤100, regla 7.1).
- Formularios en Dialog (4 campos: regla 4.1); mismos Dialogs reutilizados (`CompanyFormDialog`, `ContactFormDialog`).
- AlertDialog antes de eliminar con consecuencia explícita (regla 6.3); la descripción del borrado de empresa CAMBIA respecto a SPEC-011 para reflejar la cascada v3 (contactos sí, entrevistas se conservan sin empresa) — derogación del texto anterior.
- Toast tras cada mutación exitosa (regla 6.1).
- Redirección legada con `Navigate replace` (patrón `/capture` → `/captures` de SPEC-020).

### Comportamiento responsive

- **Mobile (< md):** sidebar como drawer (existente); List a ancho completo; Dialogs a ancho completo con scroll interno. Sin cambios estructurales.
- **Tablet (md-lg):** interpolado entre mobile y desktop.
- **Desktop (lg+):** layout completo de los wireframes.

## Notas técnicas

- Rutas nuevas: `companies` (listado) y `companies/:companyId` (detalle) bajo el `Layout`
  existente; redirect `discoveries/:discoveryId/companies/:companyId` → `/companies/:companyId`.
  La ruta anidada de detalle de ENTREVISTA (`.../interviews/:interviewId`) NO se toca (la
  reorganiza H11.4/H11.6); los links a entrevistas desde el detalle global se construyen con el
  `discoveryId` de cada entrevista.
- `CompanyDetailPage` pasa a leer solo `companyId` de la URL; el `discoveryId` que hoy exige
  `useInterviews(discoveryId, companyId)` desaparece de la URL → el hook debe aceptar la creación
  con el discovery elegido en el Dialog (p. ej. `discoveryId` pasa a viajar en los values del
  formulario, no en el constructor del hook). El listado de entrevistas de la empresa sigue siendo
  `listInterviews(companyId)`.
- `InterviewFormDialog` gana el Select «Discovery» SOLO en modo creación; en edición el discovery
  no se muestra ni se cambia (fuera de alcance).
- La búsqueda global NO se toca en esta spec (H11.6): sus hits de empresa siguen navegando a la
  ruta anidada legada, que ahora redirige — comportamiento final equivalente.
- `TopBar`: añadir el mapping `{ prefix: '/companies', title: 'Empresas' }`.
- Derogaciones: SPEC-011 (sección Empresas dentro del discovery y texto del AlertDialog con
  «y todas sus entrevistas»), parcialmente SPEC-013 (el Dialog de entrevista ya no hereda el
  discovery de la URL). Sus tests se adaptan como evolución presupuestada.

## Decisiones asumidas

- [¿Dónde encaja «Empresas» en el orden del sidebar?] → asumido justo después de «Discoveries»
  (alternativa: al final). Criterio: proximidad semántica con el flujo de discovery; el sidebar
  mantiene ≤6 ítems.
- [¿El detalle global conserva la sección Entrevistas con creación?] → asumido SÍ, añadiendo el
  Select de Discovery al Dialog (alternativa: listado solo-lectura hasta H11.4). Criterio: ningún
  flujo de usuario desaparece durante la transición (regla del hito); el coste es un campo.
- [¿Se elimina ya la sección Empresas del detalle de discovery?] → asumido SÍ en esta spec
  (alternativa: dejarla hasta H11.3). Criterio: mantenerla mostraría TODAS las empresas del sistema
  bajo cualquier discovery (transicional de SPEC-043), que es más confuso que su ausencia; H11.3
  rellena el detalle con objetivos y grupos.
- [Texto del AlertDialog de borrado de contacto] → asumido añadir la consecuencia sobre entrevistas
  («lo perderán como participante») (alternativa: texto actual). Criterio: regla 6.3, consecuencia
  explícita alineada con la cascada v3.
