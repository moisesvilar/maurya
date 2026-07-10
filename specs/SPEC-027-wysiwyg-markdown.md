# SPEC-027 — Editor markdown WYSIWYG para guión y nota de entrevista

> Traza a: RF-GUION-005 (editar guión y objetivos), RF-NOTE-004 (consulta y edición del resumen).
> Origen: petición humana directa 2026-07-10 (mejora post-MVP sobre SPEC-014 y SPEC-017; dada de
> alta en `docs/checklist.md` § H8 por indicación del humano).

## Descripción

El guión y la nota de cada entrevista se generan como Markdown, pero hoy se editan en un `Textarea`
plano (sintaxis en crudo) y se leen con renderizados parciales (el guión como texto pre-wrap sin
formato; la nota con un parser que solo interpreta encabezados `## `). Además, ambas secciones se
apilan verticalmente en el detalle, obligando a mucho scroll cuando conviven. Esta spec sustituye
los `Textarea` por un editor markdown WYSIWYG (el usuario ve y edita con formato real, sin escribir
sintaxis), hace que la vista de lectura renderice el Markdown completo, y reorganiza el detalle:
cuando existen nota y guión, cada una vive en su propia pestaña ("Notas" y "Guión", con la nota
primero y activa por defecto, por ser la más consultada). La persistencia no cambia: el contenido
sigue almacenándose como Markdown en texto plano.

## Alcance de implementación

- Esta spec define **únicamente el código de producción** que debe entregarse: UI (componentes,
  páginas, estados), datos (queries, mutations, schema si aplica) y lógica de negocio asociada.
- **Los tests automatizados están fuera del alcance del implementador.** No se deben escribir tests
  unitarios (Vitest / Testing Library) ni tests end-to-end (Playwright) como parte de esta entrega.
  Los tests los genera la skill `/somo-qa-dev` y los ejecuta `/somo-qa-tester` contra el código ya
  commiteado, en un paso posterior del pipeline de QA de SOMO. Cualquier test que el implementador
  entregue será descartado o reemplazado.
- Si la spec requiere algún ajuste de schema, migración Supabase o cambio de RLS, se indica
  explícitamente en "Notas técnicas". Si no se indica, no hay cambios de infraestructura.
- No hay cambios de schema, IPC ni persistencia: `Interview.scriptMarkdown` y
  `Note.contentMarkdown` siguen siendo strings Markdown. La única infraestructura nueva es la
  dependencia npm del editor (ver Notas técnicas).

## Criterios de aceptación

### Disposición de las secciones Nota y Guión

- GIVEN una entrevista sin guión, sin nota y sin transcripción WHEN se abre el detalle THEN solo se muestra la sección Guión (empty state y generación); la sección Nota no aparece.
- GIVEN una entrevista sin guión y sin nota pero con transcripción WHEN se abre el detalle THEN se muestran la sección Guión y los controles de generación de la nota (para no bloquear la generación de nota en el flujo capture-first).
- GIVEN una entrevista con guión y sin nota WHEN se abre el detalle THEN se muestran la sección Guión completa y los controles de generación de la nota, apilados y sin pestañas.
- GIVEN una entrevista con guión y con nota WHEN se abre el detalle THEN ambas secciones se presentan en pestañas con labels "Notas" y "Guión", en ese orden.
- GIVEN las pestañas visibles WHEN se abre el detalle THEN la pestaña "Notas" está activa por defecto.
- GIVEN la pestaña "Notas" activa WHEN el usuario pulsa la pestaña "Guión" THEN se muestra la sección Guión completa (lectura, edición, regeneración y objetivos).
- GIVEN una entrevista con guión y sin nota WHEN la generación de la nota termina con éxito THEN la vista pasa a pestañas con "Notas" activa mostrando la nota recién generada.
- GIVEN una entrevista con nota pero sin guión WHEN se abre el detalle THEN se muestran la sección Nota completa y debajo la sección Guión (empty state y generación), apiladas y sin pestañas.
- GIVEN el editor WYSIWYG en modo edición con cambios sin guardar WHEN el usuario cambia de pestaña y vuelve THEN el modo edición y el borrador se conservan (cambiar de pestaña no descarta cambios).

### Guión — visualización

- GIVEN una entrevista con guión generado WHEN se abre el detalle de la entrevista THEN el guión se muestra renderizado como texto enriquecido (encabezados, negritas, cursivas y listas con formato visual, sin sintaxis Markdown en crudo).
- GIVEN una entrevista sin guión WHEN se abre el detalle THEN se mantiene el empty state actual ("Aún no hay guión" con icono y CTA de generación).

### Guión — edición

- GIVEN un guión en modo lectura WHEN el usuario pulsa "Editar" THEN el guión se abre en el editor WYSIWYG con el contenido renderizado con formato y editable.
- GIVEN el editor WYSIWYG del guión abierto WHEN el usuario selecciona un texto y aplica un formato desde la toolbar (p. ej. negrita) THEN el formato se aplica visualmente al texto seleccionado dentro del editor.
- GIVEN cambios realizados en el editor del guión WHEN el usuario pulsa "Guardar" THEN el contenido se persiste como Markdown en la entrevista y aparece el Toast "Cambios guardados".
- GIVEN un guión con encabezados, listas y negritas WHEN el usuario entra en edición y guarda sin modificar nada THEN el Markdown persistido conserva la misma estructura semántica (mismos encabezados, mismos ítems de lista, mismos énfasis).
- GIVEN cambios sin guardar en el editor del guión WHEN el usuario pulsa "Cancelar" THEN aparece el AlertDialog "Descartar cambios" y solo se descarta al confirmar.
- GIVEN el editor del guión sin cambios WHEN el usuario pulsa "Cancelar" THEN se vuelve a modo lectura directamente, sin AlertDialog.
- GIVEN un fallo de persistencia al guardar el guión WHEN el usuario pulsa "Guardar" THEN aparece un Toast de error y el editor permanece en modo edición con los cambios intactos.
- GIVEN el modo edición del guión WHEN el usuario edita los objetivos THEN los objetivos se siguen editando como lista de campos de texto plano (`Input`), sin cambios respecto al comportamiento actual.

### Nota — visualización

- GIVEN una entrevista con nota generada WHEN se abre el detalle THEN la nota se muestra renderizada como texto enriquecido completo (encabezados de cualquier nivel, negritas, cursivas y listas), sustituyendo el render actual que solo interpreta `## `.
- GIVEN una entrevista con nota pendiente de generar y controles de generación visibles (según la disposición) WHEN se abre el detalle THEN se mantienen los estados previos a la generación actuales (mensajes, Alert de clave, Select de note-template y CTA "Generar nota"), sin cambios.

### Nota — edición

- GIVEN una nota en modo lectura WHEN el usuario pulsa "Editar" THEN la nota se abre en el editor WYSIWYG con el contenido renderizado con formato y editable.
- GIVEN cambios realizados en el editor de la nota WHEN el usuario pulsa "Guardar" THEN el contenido se persiste como Markdown en la nota y aparece el Toast "Nota guardada".
- GIVEN una nota con encabezados, listas y negritas WHEN el usuario entra en edición y guarda sin modificar nada THEN el Markdown persistido conserva la misma estructura semántica.
- GIVEN cambios sin guardar en el editor de la nota WHEN el usuario pulsa "Descartar" THEN aparece el AlertDialog "Descartar cambios" y solo se descarta al confirmar.
- GIVEN el editor de la nota sin cambios WHEN el usuario pulsa "Descartar" THEN se vuelve a modo lectura directamente, sin AlertDialog.
- GIVEN el editor de la nota vaciado por completo WHEN el usuario pulsa "Guardar" THEN se persiste la nota con contenido vacío sin error.
- GIVEN un fallo de persistencia al guardar la nota WHEN el usuario pulsa "Guardar" THEN aparece un Toast de error y el editor permanece en modo edición con los cambios intactos.

### Persistencia, regeneración y export

- GIVEN una nota editada y guardada con el editor WYSIWYG WHEN el usuario exporta "Exportar nota (.md)" THEN el fichero exportado contiene el mismo Markdown persistido (texto plano válido, sin HTML).
- GIVEN un guión editado y guardado WHEN el usuario regenera el guión y confirma el AlertDialog THEN el nuevo guión generado sustituye al editado y se muestra renderizado en modo lectura.

## UX Design

### Wireframe textual

Ambas secciones viven en **Layout 2 — Página de detalle** (detalle de entrevista, `/.../interviews/:id`,
y detalle de captura `/captures/:id`, que reutiliza los mismos componentes). El wireframe interno de
cada sección (cabeceras con acciones, Alerts de prerrequisitos, Select de note-template, empty states
y AlertDialogs) **no cambia** respecto a SPEC-014/SPEC-017; cambian la disposición de las secciones en
la página y el cuerpo de contenido:

**Disposición de las secciones (dentro del área de contenido del detalle, tras la sección de grabación)**
- **Sin guión ni nota, sin transcripción:** solo la sección Guión (empty state + generación).
- **Sin guión ni nota, con transcripción:** sección Guión + controles de generación de la nota, apilados.
- **Con guión, sin nota:** sección Guión completa + controles de generación de la nota, apilados (como hasta ahora).
- **Con nota, sin guión:** sección Nota completa + sección Guión (empty state + generación), apiladas, la Nota primero.
- **Con guión y nota:** componente Tabs ocupando el ancho de la sección — TabsList arriba con dos
  TabsTrigger, labels literales **"Notas"** y **"Guión"**, en ese orden; "Notas" activa por defecto.
  Cada TabsContent contiene la sección completa correspondiente (con todas sus acciones de cabecera).
  El contenido de ambas pestañas se mantiene montado (o su estado preservado) para no perder
  borradores de edición al alternar.

**Sección Guión — modo lectura**
- Contenedor actual (caja con borde redondeado, padding 16px) que ahora renderiza el Markdown del
  guión como texto enriquecido: `#`/`##`/`###` como encabezados jerárquicos, `**negrita**`, `*cursiva*`,
  listas con viñetas y numeradas, citas. Tipografía base `text-sm`, la del design system (Geist).
- Debajo, el bloque "Objetivos" actual (lista con icono Target) sin cambios.

**Sección Guión — modo edición**
- En lugar del `Textarea`: editor WYSIWYG en una caja con borde redondeado, compuesto por:
  - **Toolbar de formato** arriba, dentro de la caja, separada por borde inferior: botones icon-only
    (Lucide, 16px, variant ghost, con `aria-label` y Tooltip): Encabezado 2 (`Heading2`), Encabezado 3
    (`Heading3`), Negrita (`Bold`), Cursiva (`Italic`), Lista con viñetas (`List`), Lista numerada
    (`ListOrdered`), Cita (`Quote`). El botón del formato activo en la posición del cursor se muestra
    en estado presionado (fondo `accent`).
  - **Área de edición** debajo, contenido renderizado editable, altura mínima equivalente a las ~14
    filas del Textarea actual, con scroll vertical propio si el contenido crece.
- Debajo, el bloque de edición de "Objetivos" actual (Inputs + eliminar + "Añadir objetivo") sin cambios.
- Sticky bottom bar actual: "Cancelar" (outline) izquierda, "Guardar" (default) derecha. Sin cambios.

**Sección Nota — modo lectura**
- Cabecera actual sin cambios (Editar, Exportar, Ver transcripción, Regenerar nota).
- El contenedor de contenido pasa a renderizar el Markdown completo de la nota como texto enriquecido
  (mismas reglas de render que el guión). Desaparece el parser ad-hoc de `## `.

**Sección Nota — modo edición**
- Mismo editor WYSIWYG que el guión (misma toolbar, mismo comportamiento), sustituyendo al `Textarea`
  de 16 filas. Sticky bottom bar actual ("Guardar" / "Descartar") sin cambios.

### Componentes shadcn utilizados

```
Componentes: Tabs (TabsList, TabsTrigger, TabsContent), Button, Tooltip, AlertDialog, Skeleton, Select, DropdownMenu, Input, Alert
Componente eliminado de estas secciones: Textarea (deja de usarse en ScriptSection y NoteSection; sigue existiendo para otros usos)
Componente adicional necesario: editor markdown WYSIWYG — no existe en shadcn; requiere una librería externa (ver Notas técnicas). Su chrome (toolbar, bordes, focus ring) se estiliza con los tokens del design system.
```

### data-testid

- `note-script-tabs` — contenedor del componente Tabs cuando existen nota y guión (los triggers son localizables por `role="tab"` + nombre "Notas"/"Guión")
- `script-markdown-view` — contenedor de la vista de lectura renderizada del guión
- `script-markdown-editor` — contenedor del editor WYSIWYG del guión (toolbar + área editable)
- `note-markdown-view` — contenedor de la vista de lectura renderizada de la nota
- `note-markdown-editor` — contenedor del editor WYSIWYG de la nota (toolbar + área editable)

Los botones de la toolbar son localizables por `role="button"` + `aria-label` ("Negrita", "Cursiva",
"Encabezado 2", "Encabezado 3", "Lista con viñetas", "Lista numerada", "Cita") dentro del contenedor
del editor; el resto de elementos (Editar, Guardar, Cancelar/Descartar, AlertDialogs, Toasts)
conservan sus locators actuales.

### Patrón de interacción

- **Tabs para Nota y Guión cuando coexisten** (§4.3): son secciones excluyentes en el uso —antes de
  la llamada se consulta el guión, después la nota—, de mismo peso, con volumen medio de contenido
  cada una, y no se necesitan ambas abiertas a la vez. Es exactamente el caso de Tabs frente a
  accordion o scroll con secciones, y elimina el scroll largo que motiva esta spec. Con una sola de
  las dos presentes las pestañas sobran (una TabsList de un solo trigger es un anti-patrón): se
  mantiene el apilado actual.
- **Orden y default "Notas" antes que "Guión"**: cuando ambas existen, la entrevista ya ocurrió y la
  nota es el artefacto vivo (se consulta, edita y exporta); el guión es material de preparación ya
  consumido. Prioridad de contenido según uso (§8.3: lo más consultado primero).
- **Se conserva el patrón lectura/edición con guardado explícito** de SPEC-014/SPEC-017 (botón
  "Editar" → editor → "Guardar"/"Cancelar"), en lugar de edición siempre activa con autosave. Razón:
  RF-GUION-005 y RF-NOTE-004 existen como salvaguarda de control humano sobre el output del LLM
  (Riesgo #6); el guardado explícito con Toast mantiene el feedback por acción mutadora (§6.1) y el
  dirty-check con AlertDialog antes de descartar (§6.3) ya especificados y testeados.
- **Decisión no cubierta por el design system:** el design system no contempla editores de texto
  enriquecido. Se resuelve con un editor WYSIWYG con toolbar mínima de 7 acciones, porque los
  contenidos generados por el LLM (guión y nota) solo usan encabezados, énfasis, listas y citas;
  una toolbar completa (tablas, imágenes, código) añadiría superficie sin caso de uso. El chrome
  del editor sigue las reglas existentes: iconos Lucide 16px (§10), icon-only con `aria-label`
  (§11.3), focus ring de Tailwind intacto (§11.4), tokens de color semánticos (§1).
- Toolbar con botones icon-only + Tooltip: acciones obvias y universales de formato (§10, "icon-only
  solo en acciones obvias").
- Estados de guardado sin cambios: spinner inline en el botón "Guardar" mientras persiste (§5.4),
  Toast de éxito 3-5 s bottom-right (§6.1), Toast de error si la mutación falla (§5.4).

### Comportamiento responsive

- **Mobile (< md):** la toolbar del editor hace wrap a una segunda línea si no caben los 7 botones
  (nunca scroll horizontal, §9.2). El área de edición ocupa el ancho completo de la sección. La
  TabsList ocupa el ancho disponible con los dos triggers ("Notas", "Guión") siempre visibles.
  Resto sin cambios respecto al comportamiento actual de las secciones.
- **Tablet (md–lg):** interpolado entre mobile y desktop.
- **Desktop (lg+):** layout completo del wireframe; toolbar en una sola línea.

## Notas técnicas

- **Persistencia intacta:** el editor debe serializar a/desde Markdown en texto plano.
  `db.updateInterview({ scriptMarkdown })` y `db.updateNote({ contentMarkdown })` siguen recibiendo
  strings Markdown; el export `.md` (SPEC-017) y la inyección de contexto histórico en el guión
  (SPEC-014, que lee estas cadenas desde main) no se tocan y dependen de que lo persistido siga
  siendo Markdown puro.
- **Dependencia nueva (renderer):** se necesita una librería de editor WYSIWYG con soporte Markdown
  bidireccional (parse al montar, serialize al guardar). Requisitos duros: compatible con React 19,
  funcionamiento 100% offline (app Electron local, sin CDN), estilizable con Tailwind/tokens shadcn.
  Candidatas razonables: MDXEditor, TipTap + extensión markdown, Milkdown. La elección concreta es
  del plan de implementación, no de esta spec.
- **Normalización permitida:** al serializar, el editor puede normalizar la sintaxis (p. ej. `*` →
  `-` en listas, espaciado de encabezados) siempre que la estructura semántica se preserve (ver ACs
  de round-trip). Contenido Markdown que el editor no represente (p. ej. HTML embebido) no debe
  perderse silenciosamente al guardar sin cambios.
- **Alcance de componentes:** el editor y el render de lectura viven en `ScriptSection` y
  `NoteSection` (`src/renderer/src/components/interviews/`); es razonable extraer el editor y el
  renderizador a componentes compartidos. La disposición condicional (apilado vs Tabs) vive en las
  páginas que componen ambas secciones — detalle de entrevista y detalle de captura (SPEC-020) —,
  aplicando las mismas reglas en las dos. Para decidir la disposición, la página necesita saber si
  existe nota (`db.getNoteByInterview`), consulta que hoy hace `NoteSection` internamente.
- **Estado de las pestañas:** la pestaña activa no se persiste entre visitas (siempre "Notas" al
  entrar); el contenido de la pestaña inactiva conserva su estado (borradores de edición incluidos)
  mientras no se navegue fuera del detalle.

## Decisiones asumidas

- Alcance limitado al **guión y la nota de la entrevista** (los "markdown que se generan en cada
  entrevista", literal del pedido) → los `Textarea` de los editores de templates
  (note-templates, templates de entrevista) y las guías de bloques quedan fuera (alternativa:
  extenderles el mismo editor; puede pedirse como spec/iteración aparte). Criterio: texto literal
  de la petición.
- Se conserva el patrón lectura/edición con "Guardar" explícito → asumido frente a la alternativa
  de edición siempre activa con autosave. Regla: control humano (RF-GUION-005/RF-NOTE-004, Riesgo
  #6) + feedback por acción mutadora (design system §6.1).
- Toolbar mínima de 7 acciones (H2, H3, negrita, cursiva, lista viñetas, lista numerada, cita) →
  asumido frente a una toolbar completa. Criterio: cobertura de la sintaxis que producen los prompts
  de guión y nota; menos superficie de QA.
- Los **objetivos** del guión siguen editándose como Inputs de texto plano → asumido (alternativa:
  integrarlos en el editor). Criterio: son strings planos en el modelo de datos, no Markdown.
- La vista de **lectura** también pasa a render enriquecido completo (no solo la edición) → asumido:
  "visualizar y editar" en el pedido; además elimina el parser parcial de `## ` de la nota.
- Los botones "Editar" y las barras Guardar/Cancelar–Descartar existentes en ambas secciones se
  mantienen tal cual (confirmado por el humano 2026-07-10: la nota ya es editable) → asumido para
  minimizar el delta de comportamiento testeado.
- **Excepción a la regla "sin guión solo se ve el guión"**: si la entrevista tiene transcripción (o
  ya tiene nota), la parte de Nota se muestra aunque no haya guión → asumido (alternativa: literal
  del pedido, ocultarla siempre sin guión). Criterio: en el flujo capture-first (SPEC-020) existen
  entrevistas con transcripción/nota y sin guión; ocultar la Nota bloquearía RF-NOTE-001/004.
- **Con nota pero sin guión**: apilado con la Nota primero, sin pestañas → asumido (alternativa:
  Tabs con la pestaña Guión en empty state). Criterio: una pestaña cuyo contenido es solo un empty
  state da a ambas secciones un peso que no tienen (§4.3, "mismo peso").
- Labels de pestañas **"Notas"** y **"Guión"**, literales del pedido → asumido, aunque el heading
  interno de la sección siga siendo "Nota" en singular (alternativa: unificar a "Nota").
- La pestaña activa por defecto es "Notas" en cada visita, sin persistencia → asumido (alternativa:
  recordar la última pestaña). Criterio: el pedido fija la prioridad de la nota; persistirla añade
  estado sin caso de uso claro.
