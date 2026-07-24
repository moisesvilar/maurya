# SPEC-051 — Unificar la gestión de plantillas en Ajustes

## Descripción

Hoy las plantillas se gestionan por dos caminos distintos: la sección «Plantillas» del sidebar (hub con dos cards) para las de entrevista, y Ajustes > «Plantillas de notas» para las de notas. Esta spec unifica ambos en Ajustes: desaparece la sección «Plantillas» (y su hub), y Ajustes gana una pestaña «Plantillas de entrevistas» donde el usuario gestiona sus cuestionarios base con la misma experiencia que ya tiene para las plantillas de notas. Las rutas antiguas redirigen a su nuevo destino para no romper la memoria muscular ni el historial. Deroga la ubicación del hub de SPEC-009 y la del listado de SPEC-012; la funcionalidad de las plantillas (crear, editar, duplicar, eliminar) se conserva íntegra.

## Alcance de implementación

- Esta spec define **únicamente el código de producción** que debe entregarse: UI (componentes, páginas, estados), datos (queries, mutations, schema si aplica) y lógica de negocio asociada.
- **Los tests automatizados están fuera del alcance del implementador.** No se deben escribir tests unitarios (Vitest / Testing Library) ni tests end-to-end (Playwright) como parte de esta entrega. Los tests los genera la skill `/somo-qa-dev` y los ejecuta `/somo-qa-tester` contra el código ya commiteado, en un paso posterior del pipeline de QA de SOMO. Cualquier test que el implementador entregue será descartado o reemplazado.
- Si la spec requiere algún ajuste de schema, migración Supabase o cambio de RLS, se indica explícitamente en "Notas técnicas". Si no se indica, no hay cambios de infraestructura.
- **Fuera de alcance**: la pestaña «Plantillas de notas» y el editor de plantillas de notas no se tocan; el editor de plantillas de entrevista solo cambia su ruta y su destino de salida (su formulario, validación y guard de descarte permanecen intactos); los selectores de plantilla en los diálogos de capturas/entrevistas/grupos no se tocan; no se añade «Duplicar» a plantillas de notas.

## Criterios de aceptación

### Pestañas de Ajustes

- GIVEN la página de Ajustes WHEN se carga THEN la lista de pestañas muestra, en este orden, «Claves de IA», «Plantillas de notas», «Plantillas de entrevistas» y «Prompts personalizados».
- GIVEN la URL `/settings?tab=interview-templates` WHEN se carga la página THEN la pestaña «Plantillas de entrevistas» está activa y muestra el listado de plantillas de entrevista.
- GIVEN la pestaña «Plantillas de entrevistas» activa WHEN se selecciona otra pestaña THEN el parámetro `?tab=` de la URL refleja la pestaña nueva.

### Listado de plantillas de entrevista

- GIVEN plantillas de entrevista existentes WHEN se abre la pestaña THEN se muestra una List con, por plantilla, su nombre, el Badge de fase si la tiene y el resumen «N bloques · M preguntas» con singular/plural correctos.
- GIVEN una plantilla sin fase asignada WHEN se pinta su fila THEN no se muestra ningún Badge de fase.
- GIVEN la carga de plantillas en curso WHEN se abre la pestaña THEN se muestran placeholders Skeleton en lugar del listado.
- GIVEN un fallo al cargar las plantillas WHEN se abre la pestaña THEN se muestra el error state con el mensaje y un botón «Reintentar» que relanza la carga.
- GIVEN cero plantillas de entrevista WHEN se abre la pestaña THEN se muestra el empty state «Aún no hay plantillas de entrevista» con el CTA «Crear primera plantilla».

### Creación y edición

- GIVEN la pestaña «Plantillas de entrevistas» WHEN se pulsa «Nueva plantilla» THEN se navega a `/settings/interview-templates/new`.
- GIVEN el empty state WHEN se pulsa «Crear primera plantilla» THEN se navega a `/settings/interview-templates/new`.
- GIVEN una fila del listado WHEN se pulsa «Editar plantilla» THEN se navega a `/settings/interview-templates/{id}` y el editor carga esa plantilla.
- GIVEN el editor de plantilla de entrevista WHEN se sale de él (Volver, Cancelar o guardado con salida) THEN se regresa a `/settings?tab=interview-templates` con la pestaña activa.

### Duplicar

- GIVEN una fila del listado WHEN se pulsa «Duplicar plantilla» THEN se crea el duplicado inmediatamente sin diálogo, aparece en el listado y se muestra un Toast de confirmación.

### Eliminación

- GIVEN una fila del listado WHEN se pulsa «Eliminar plantilla» THEN se abre un AlertDialog titulado «Eliminar plantilla» con la descripción «Se eliminará permanentemente la plantilla «{nombre}».» y los botones «Cancelar» y «Eliminar».
- GIVEN el AlertDialog de eliminación WHEN se pulsa «Eliminar» THEN la plantilla se borra y desaparece del listado sin recargar la página.
- GIVEN el AlertDialog de eliminación WHEN se pulsa «Cancelar» o Escape THEN el diálogo se cierra, no se borra nada y la plantilla permanece en el listado.

### Navegación global

- GIVEN el sidebar WHEN se pinta THEN muestra exactamente los items «Discoveries», «Empresas», «Capturas» y «Ajustes», sin «Plantillas».
- GIVEN cualquier ruta bajo `/settings/interview-templates` WHEN se está en ella THEN el top bar titula «Ajustes» y el item «Ajustes» del sidebar aparece activo.

### Rutas legadas

- GIVEN la ruta `/templates` WHEN se carga THEN redirige (replace) a `/settings?tab=interview-templates`.
- GIVEN la ruta `/templates/interview` WHEN se carga THEN redirige (replace) a `/settings?tab=interview-templates`.
- GIVEN la ruta `/templates/interview/new` WHEN se carga THEN redirige (replace) a `/settings/interview-templates/new`.
- GIVEN la ruta `/templates/interview/{id}` WHEN se carga THEN redirige (replace) a `/settings/interview-templates/{id}` conservando el id.

## UX Design

### Wireframe textual

**Pantalla: Ajustes — pestaña «Plantillas de entrevistas»** (`/settings?tab=interview-templates`, **Layout 4 — Página de settings**, ya existente: contenido centrado `max-w-[640px]` con Tabs horizontales).

- TabsList: «Claves de IA» · «Plantillas de notas» · «Plantillas de entrevistas» · «Prompts personalizados».
- Contenido de la pestaña (mismo esqueleto que «Plantillas de notas»):
  - Fila de cabecera: a la izquierda, texto muted «Cuestionarios base para tus entrevistas: bloques ordenados de preguntas con notas de guía»; a la derecha, Button (variant default, icono `Plus`) «Nueva plantilla».
  - List (`ul` con `divide-y`, borde redondeado) donde cada fila (`li`) tiene:
    - Izquierda, en columna: nombre (font-medium) con Badge (variant outline) de la fase a su derecha si la plantilla la tiene; debajo, texto muted «N bloques · M preguntas».
    - Derecha, tres Button ghost icon-only: `Pencil` (`aria-label="Editar plantilla"`), `Copy` (`aria-label="Duplicar plantilla"`) y `Trash2` en color destructive (`aria-label="Eliminar plantilla"`).
  - Loading: tres Skeleton de fila (h-12). Empty state: icono `ClipboardList` + «Aún no hay plantillas de entrevista» + Button «Crear primera plantilla». Error state: icono `AlertTriangle` + mensaje + Button outline «Reintentar».
- **AlertDialog de eliminación** (a nivel de pestaña): título «Eliminar plantilla», descripción «Se eliminará permanentemente la plantilla «{nombre}».», footer con `AlertDialogCancel` «Cancelar» + `AlertDialogAction` destructive «Eliminar».

**Pantalla: Editor de plantilla de entrevista** (`/settings/interview-templates/new` y `/settings/interview-templates/{id}`, **Layout 3 — Formulario**, ya existente): sin cambios visuales; solo cambian su ruta y el destino de Volver/Cancelar/salida, que pasa a `/settings?tab=interview-templates`.

**Sidebar**: 4 items (Discoveries, Empresas, Capturas, Ajustes). La sección «Plantillas» y su hub de cards desaparecen.

### Componentes shadcn utilizados

Componentes: `Tabs`, `Button`, `Badge`, `Skeleton`, `AlertDialog`, `Toast` (sonner). Iconos Lucide: `Plus`, `Pencil`, `Copy`, `Trash2`, `ClipboardList`, `AlertTriangle`. Todos ya instalados y en uso; sin componentes nuevos.

### data-testid

Sin data-testid adicionales: las pestañas son localizables por role `tab`+name, los botones de acción por role `button`+`aria-label` («Editar plantilla» / «Duplicar plantilla» / «Eliminar plantilla»), el AlertDialog por role `alertdialog` y sus botones por name, y los estados vacío/error por su texto.

### Patrón de interacción

- **Tabs para la navegación interna de Ajustes** → secciones excluyentes de mismo peso (design system §4.3 y Layout 4); la pestaña activa se refleja en `?tab=` (contrato de deep-link ya establecido por SPEC-008, que usan enlaces externos como el de la sección de notas de una entrevista).
- **Acciones inline en la fila (3 iconos, incluida la destructiva)** → **excepción justificada al design system §7.4** (que prescribe DropdownMenu para 2+ acciones y veta destructivas inline): se prioriza la unificación literal con el patrón ya existente de «Plantillas de notas» (SPEC-008, iconos inline con destructiva), en una List corta no tabular donde los tres iconos con `aria-label` son legibles. La alternativa (menú «⋯» en ambas pestañas) exigiría tocar la pestaña de notas, fuera de alcance.
- **Confirmación antes de borrar** → AlertDialog con consecuencia explícita y verbo en el botón (design system §6.3); Escape/Cancelar nunca ejecutan el borrado. Al no haber ya DropdownMenu, la apertura del diálogo es directa (desaparece el diferimiento que exigía el menú de SPEC-012).
- **«Duplicar» inmediato con Toast** → acción reversible (se puede eliminar el duplicado), patrón hacer+feedback sin confirmación (design system §6.1/§6.3), conservando el comportamiento de SPEC-012.
- **Rutas legadas con redirect `replace`** → mismo patrón que las rutas legadas de SPEC-020/SPEC-044: no ensucian el historial del HashRouter y no dejan 404 donde antes había contenido.

### Comportamiento responsive

- **Mobile (< md):** sin cambios respecto a desktop — el contenedor de Ajustes ya es estrecho (max-w 640px) y la fila de la List mantiene su disposición; los tres iconos de acción permanecen visibles (acción primaria nunca oculta).
- **Tablet (md-lg):** interpolado entre mobile y desktop; sin diferencias específicas.
- **Desktop (lg+):** layout completo del wireframe.

## Notas técnicas

- Reorganización 100 % de renderer: **sin cambios en main/preload/IPC ni en persistencia**. Los hooks de datos existentes (plantillas de entrevista y de notas) se reutilizan tal cual.
- Existe un plan de implementación autorado por el orquestador en `docs/plans/SPEC-051-plan.md` con el detalle fichero a fichero (rutas nuevas, redirects, componente de la pestaña, sidebar/top bar).
- La eliminación de la sección «Plantillas», del hub y del listado como página invalida tests unitarios existentes que montan esas rutas; su adaptación corresponde a la fase de QA (`/somo-qa-dev`), incluida la actualización de la trazabilidad de SPEC-012 en `tests/spec-test-map.json`.
