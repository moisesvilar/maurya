# SPEC-025 — Prompts de IA personalizables desde Ajustes

> Traza a: RF-CFG-001 (PRD §3.8). Origen: decisión humana 2026-07-10
> (docs/drafts/prompt-externalizar-prompts-claude.md).

## Descripción

El usuario puede consultar y personalizar, desde una nueva pestaña «Prompts personalizados» en
Ajustes, el texto de persona y enfoque de los tres prompts de IA de la app: el que prepara el guión
y los objetivos de la entrevista, el que sintetiza la nota de resumen y el del asistente en vivo. La edición
se hace en un editor Markdown visual (WYSIWYG): el usuario ve el texto formateado, lo edita
directamente y aplica formato desde una botonera. Solo es editable el bloque de persona/enfoque;
las reglas estructurales que sostienen las respuestas JSON (campos, límites de caracteres, partes
dinámicas) quedan bloqueadas y visibles en solo lectura.
Cada prompt puede restablecerse a su texto por defecto en cualquier momento.

## Alcance de implementación

- Esta spec define **únicamente el código de producción** que debe entregarse: UI (componentes,
  páginas, estados), datos (queries, mutations, schema si aplica) y lógica de negocio asociada.
- **Los tests automatizados están fuera del alcance del implementador.** No se deben escribir tests
  unitarios (Vitest / Testing Library) ni tests end-to-end (Playwright) como parte de esta entrega.
  Los tests los genera la skill `/somo-qa-dev` y los ejecuta `/somo-qa-tester` contra el código ya
  commiteado, en un paso posterior del pipeline de QA de SOMO. Cualquier test que el implementador
  entregue será descartado o reemplazado.
- Esta spec **sí** requiere cambios de esquema de datos local (nueva entidad en `db.json`), nuevos
  canales IPC `db:*` y una dependencia nueva en `package.json` (librería de editor Markdown
  WYSIWYG); se detallan en «Notas técnicas». No hay cambios en `secrets.json` ni en el empaquetado.
- **Regla del modelo intacta**: nunca `temperature`/`top_p`/`top_k`/`budget_tokens`. El prompt
  caching del asistente (SPEC-023: `cache_control` ephemeral, `systemBlocks` byte-estables por
  sesión) **no se toca** — el override solo se lee al arrancar la sesión.

## Criterios de aceptación

Los tres prompts se identifican en toda la spec como: **«Guión y objetivos»** (generación de guión),
**«Nota de resumen»** (síntesis de la nota) y **«Asistente en vivo»** (copiloto durante la llamada).

### Listado y consulta

- GIVEN Ajustes abierto WHEN el usuario entra en la pestaña «Prompts personalizados» THEN ve una lista con exactamente tres prompts — «Guión y objetivos», «Nota de resumen» y «Asistente en vivo» — cada uno con su nombre, una descripción corta y un Badge de estado.
- GIVEN un prompt sin texto personalizado guardado WHEN se muestra la lista THEN su Badge dice «Default».
- GIVEN un prompt con texto personalizado guardado WHEN se muestra la lista THEN su Badge dice «Personalizado».
- GIVEN la carga de los prompts en curso WHEN se abre la pestaña THEN se muestran skeletons en lugar de la lista.
- GIVEN la carga de los prompts falla WHEN se abre la pestaña THEN aparece un error state con el mensaje del fallo y un botón «Reintentar» que relanza la carga.

### Edición

- GIVEN la lista visible WHEN el usuario pulsa «Editar prompt» en una fila THEN se abre un Sheet con un editor Markdown visual (WYSIWYG) que muestra formateado el texto vigente de ese prompt (el personalizado si existe; el default si no), con una botonera de formato encima y, debajo, el bloque de reglas fijas de ese prompt en solo lectura.
- GIVEN el editor abierto WHEN el usuario selecciona texto y pulsa una acción de la botonera (negrita, cursiva, título, lista de viñetas, lista numerada) THEN el formato se aplica y se refleja inmediatamente en el texto visible del editor.
- GIVEN el Sheet abierto con el texto modificado WHEN pulsa «Guardar» THEN el texto personalizado se persiste como Markdown, el Sheet se cierra, aparece un Toast «Prompt guardado» y el Badge de la fila pasa a «Personalizado».
- GIVEN un texto personalizado guardado con formato (negritas, listas, títulos) WHEN el usuario vuelve a abrir el editor THEN el texto se muestra renderizado con exactamente el formato guardado (round-trip fiel Markdown → vista → Markdown).
- GIVEN el editor vacío o con solo espacios en blanco WHEN pulsa «Guardar» THEN aparece el error inline «El prompt no puede quedar vacío» debajo del editor y no se persiste nada.
- GIVEN el guardado falla (error de persistencia) WHEN pulsa «Guardar» THEN aparece un Toast destructivo con el error y el Sheet permanece abierto conservando el texto escrito.
- GIVEN el Sheet abierto con cambios sin guardar WHEN el usuario intenta cerrarlo (Cancelar, X, Escape o click fuera) THEN aparece un AlertDialog «Descartar cambios» y solo se cierra sin persistir si confirma «Descartar».
- GIVEN el Sheet abierto sin cambios WHEN el usuario lo cierra THEN se cierra directamente, sin confirmación.

### Restablecer al default

- GIVEN un prompt con Badge «Personalizado» WHEN el usuario pulsa «Restablecer prompt» en su fila THEN aparece un AlertDialog «Restablecer prompt» que explicita que el texto personalizado se eliminará permanentemente y se volverá al texto por defecto.
- GIVEN el AlertDialog de restablecer abierto WHEN confirma «Restablecer» THEN el texto personalizado se elimina, el Badge vuelve a «Default» y aparece un Toast «Prompt restablecido».
- GIVEN un prompt con Badge «Default» WHEN se muestra su fila THEN el botón «Restablecer prompt» está deshabilitado y muestra un Tooltip «Este prompt ya usa el texto por defecto».

### Resolución en runtime

- GIVEN un texto personalizado guardado para «Guión y objetivos» WHEN se genera un guión THEN el system prompt enviado al LLM usa ese texto como bloque de persona/enfoque y conserva intactas las partes bloqueadas (fase del template, tarea según haya o no empresa, reglas de `scriptMarkdown`/`objectives` y «Responde únicamente con el JSON pedido»).
- GIVEN un texto personalizado guardado para «Nota de resumen» WHEN se genera la nota THEN el system prompt usa ese texto como bloque de persona/enfoque y conserva intactas las partes bloqueadas (contexto del note-template, reglas de `sections` y del JSON).
- GIVEN un texto personalizado guardado para «Asistente en vivo» WHEN se arranca una sesión del asistente THEN los `systemBlocks` se construyen con ese texto como bloque de persona/enfoque y las reglas y límites de caracteres bloqueados intactos.
- GIVEN cualquiera de los tres prompts sin texto personalizado WHEN se usa la generación correspondiente THEN el system prompt se construye con el texto por defecto del módulo de defaults.
- GIVEN una sesión del asistente activa WHEN el usuario guarda o restablece el prompt del asistente THEN la sesión en curso mantiene byte-estables los `systemBlocks` construidos al arrancar y el cambio aplica solo a partir de la siguiente sesión.
- GIVEN un prompt restablecido al default WHEN se vuelve a usar la generación correspondiente THEN el system prompt vuelve a construirse con el texto por defecto.

> Empty state del listado: no aplica — el catálogo es fijo (siempre existen los tres prompts, con o
> sin personalización). El caso «sin datos» queda cubierto por el estado «Default» de cada fila y la
> validación de texto vacío.

## UX Design

### Wireframe textual

**Pantalla: Ajustes (existente) — Layout 4 (Settings, tabs horizontales).** Se añade un tercer
TabsTrigger «Prompts personalizados» (value `custom-prompts`) tras «Claves de IA» y «Plantillas de
notas», sincronizado con el query param `tab` como los existentes.

**Contenido del tab «Prompts personalizados»:**

- Cabecera: texto muted «Ajusta la persona y el enfoque con los que la IA prepara, asiste y resume
  tus entrevistas» (sin botón de creación: el catálogo es fijo).
- Lista (patrón List — 3 ítems fijos, 1-2 datos por ítem, mismo tratamiento visual que «Plantillas
  de notas»: `ul` con borde redondeado y filas divididas). Cada fila, de arriba abajo:
  1. **Guión y objetivos** — descripción muted «Prepara el guión personalizado y los objetivos de
     cada entrevista».
  2. **Nota de resumen** — descripción muted «Sintetiza la nota de resumen al cerrar la entrevista».
  3. **Asistente en vivo** — descripción muted «Sugiere la siguiente jugada durante la llamada».
  A la derecha de cada fila: Badge de estado («Default» variant `secondary` · «Personalizado»
  variant `default`) y dos acciones inline: Button (variant `ghost`, size `icon`, icono Pencil,
  aria-label «Editar prompt») y Button (variant `ghost`, size `icon`, icono RotateCcw, aria-label
  «Restablecer prompt»; disabled + Tooltip cuando el estado es «Default»).
- Estados de carga/error: skeletons de 3 filas (h-12) durante la carga; error state centrado con
  icono AlertTriangle, mensaje y Button «Reintentar» (variant `outline`) — mismo patrón que el tab
  de plantillas.

**Sheet de edición (lado derecho):**

- Título: «Editar prompt — {nombre del prompt}». Subtítulo muted: la descripción corta de la fila.
- Campo único: Label «Persona y enfoque» + editor Markdown visual (WYSIWYG), compuesto por:
  - **Botonera de formato** fija encima del área de edición, con acciones icon-only (Lucide,
    aria-label cada una): Negrita (Bold), Cursiva (Italic), Título (Heading2), Lista de viñetas
    (List), Lista numerada (ListOrdered). Estado activo visible cuando el cursor está sobre texto
    ya formateado.
  - **Área de edición** (~10 líneas visibles, scroll interno) donde el texto se muestra renderizado
    (negritas, cursivas, títulos, listas) y se edita directamente sobre la vista formateada.
  Debajo del editor, zona reservada para el error inline.
- Bloque «Reglas fijas (no editables)»: contenedor con borde, fondo muted, que muestra en solo
  lectura el texto de las partes bloqueadas del prompt (tarea, reglas del JSON, límites de
  caracteres) tal y como se enviarán. Sin controles de edición.
- Sticky bottom bar: «Cancelar» (variant `outline`, izquierda) y «Guardar» (variant `default`,
  derecha, con spinner inline y disabled mientras persiste).

**AlertDialogs:**

- «Descartar cambios» — descripción: «Los cambios no guardados en el prompt se perderán.» Botones:
  Cancelar (outline) + «Descartar» (destructive).
- «Restablecer prompt» — descripción: «Se eliminará permanentemente tu texto personalizado y el
  prompt volverá al texto por defecto.» Botones: Cancelar (outline) + «Restablecer» (destructive).

### Componentes shadcn utilizados

Componentes: Tabs, Button, Badge, Sheet, Skeleton, Tooltip, AlertDialog, Toast (sonner).
Componente adicional necesario: **editor Markdown WYSIWYG con botonera** — no existe en shadcn ni
en el scaffold (las notas usan Textarea plano); requiere una librería nueva, cuya elección es del
implementador (ver Notas técnicas). La botonera se integra visualmente con el design system
(botones ghost icon-only, tokens de color por defecto).

### data-testid

- `custom-prompts-list` — el contenedor de la lista de prompts.
- `custom-prompt-row-script` / `custom-prompt-row-note` / `custom-prompt-row-assistant` — cada fila
  del catálogo (los botones internos se localizan por aria-label).
- `custom-prompt-sheet` — el Sheet de edición.
- `custom-prompt-editor` — el área editable del editor Markdown.
- `custom-prompt-editor-toolbar` — la botonera de formato (sus botones se localizan por aria-label).
- `custom-prompt-locked-rules` — el bloque de reglas fijas en solo lectura.

El resto de elementos (badges, botones, textarea, diálogos) son localizables por
role/label/text.

### Patrón de interacción

- **List, no Table:** 3 ítems fijos con 1-2 datos por ítem, sin sorting ni filtering (§4.2 del
  design system). Sin paginación: catálogo fijo de 3 elementos.
- **Sheet, no Dialog ni página nueva:** un solo campo pero de texto largo, con tiempo de
  interacción de 10-30 s y utilidad de conservar el contexto de la lista detrás (§4.1). No hay
  sub-navegación que justifique página nueva.
- **AlertDialog antes de restablecer y de descartar:** ambas acciones destruyen texto escrito por
  el usuario de forma irrecuperable (§6.3). Título con el nombre de la acción y verbo en el botón.
- **Botón deshabilitado siempre con Tooltip explicativo** («Restablecer» en estado Default, §5.4).
- **Toast tras cada mutación exitosa** (guardar, restablecer), bottom-right, texto descriptivo
  (§6.1). Error de persistencia → Toast destructivo, no error inline (§5.1: error de servidor).
- **Validación on submit** para el único campo (texto no vacío), con error inline bajo el editor;
  el botón Guardar nunca se deshabilita por validación (§5.1).
- Decisión no cubierta por el design system: **editor Markdown WYSIWYG con botonera**. El design
  system solo contempla Input/Textarea para entrada de texto. Se resuelve como excepción
  justificada por petición explícita del humano (2026-07-10): el usuario debe ver el prompt
  formateado y editarlo sobre la vista renderizada, no sobre Markdown en crudo.
- Decisión no cubierta por el design system: mostrar las reglas bloqueadas en solo lectura dentro
  del Sheet de edición. Se resuelve con un contenedor muted bajo el editor porque el usuario
  necesita ver el prompt efectivo completo para escribir una persona coherente con las reglas.

### Comportamiento responsive

- **Mobile (< md):** el Sheet ocupa el ancho completo; la lista apila nombre/descripción arriba y
  Badge + acciones debajo dentro de cada fila; los tabs de Ajustes mantienen su comportamiento
  actual. La sticky bottom bar del Sheet conserva ambos botones (solo hay 2).
- **Tablet (md-lg):** interpolado entre mobile y desktop.
- **Desktop (lg+):** layout completo del wireframe; Sheet con ancho estándar (~max-w-md/lg).

## Notas técnicas

- **Defaults:** el texto por defecto del bloque persona/enfoque de cada prompt se extrae de los
  tres servicios a un módulo TypeScript aparte (p. ej. `src/main/prompts/defaults.ts`), tipado y
  bundleado. Los servicios componen el system prompt como: bloque persona (override → default) +
  partes bloqueadas, que siguen viviendo en cada servicio con su lógica dinámica actual
  (`llmService.ts` fase/tarea, `noteService.ts` contexto del template, `assistantService.ts`
  límites de caracteres).
- **Persistencia:** nueva entidad en `db.json` (p. ej. `customPrompts`) con id ∈
  `{script, note, assistant}`, el texto del override y timestamp de actualización. Entidad global
  sin relaciones: fuera de la integridad referencial en cascada. Los prompts **no** son secretos —
  nunca en `secrets.json`.
- **Editor Markdown:** la fuente de verdad es siempre el **Markdown plano** (string): es lo que se
  persiste en `db.json` y lo que se inserta tal cual como bloque de persona en el system prompt
  (el modelo interpreta Markdown de forma nativa). El editor WYSIWYG debe hacer round-trip fiel
  string → vista → string. Requiere una dependencia nueva en `package.json` (librería de editor
  Markdown para React 19, a elección del implementador); la spec no fija cuál.
- **Cableado punta a punta clonando el patrón note-templates:** `repository.ts` → canales IPC
  `db:*` con envelope `DbResult` (`handleDb`) → bridge en `preload/index.ts` → contrato en
  `types/domain.ts` → hook `useCustomPrompts` → componente en `components/settings/`.
- **Asistente (SPEC-023):** el override se resuelve una sola vez en `startAssistant`; los
  `systemBlocks` permanecen byte-estables durante toda la sesión con su `cache_control` ephemeral.
  Guión y nota resuelven el override en cada invocación (no tienen sesión).
- Trazabilidad: RF-CFG-001 (PRD §3.8).

## Decisiones asumidas

- Guardar un texto idéntico al default cuenta como override y el Badge pasa a «Personalizado»
  (alternativa: comparar contenido y volver a «Default»). Criterio: previsibilidad y simplicidad;
  el usuario puede restablecer explícitamente.
- Sin límite de longitud en el texto editable (alternativa: máximo fijo de caracteres). Criterio:
  los defaults rondan pocos cientos de caracteres y el coste de IA ya está controlado y es visible
  (SPEC-021).
- La pestaña se añade en tercera posición, tras «Plantillas de notas» (alternativa: entre las dos
  existentes). Criterio: orden de llegada de las features, coherente con el borrador.
- El id de dominio de cada prompt es `script` / `note` / `assistant` (alternativa: nombres largos).
  Criterio: espeja el servicio propietario de cada prompt.
- Botonera mínima de 5 acciones: negrita, cursiva, título, lista de viñetas y lista numerada
  (alternativa: superficie completa con enlaces, tablas, código, citas). Criterio: los prompts son
  prosa corta de instrucciones; más formato añade ruido sin valor para el LLM.
