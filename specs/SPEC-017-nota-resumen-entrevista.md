# SPEC-017 — Nota de la entrevista: resumen con IA según note-template, edición y exportación

> Requisitos origen: RF-NOTE-001 (Must) + RF-NOTE-004 (Should) + RF-NOTE-005 (Could) · Hito H6 (RF-NOTE-002/003 ya cubiertos por SPEC-002/015 y SPEC-014) · Cierra el flujo end-to-end (CU-06)
> Relacionados: SPEC-008 (note-templates: entidad y editor), SPEC-014 (llmService, patrón de generación+edición del guión), SPEC-015 (entrevista Grabada con transcriptPath), SPEC-016 (transcript.json con registro del asistente)
> Naturaleza: feature de producto con UI.

## Descripción

Cuando una entrevista está grabada, el usuario genera con un clic la nota de resumen: la IA sintetiza la transcripción siguiendo el note-template elegido (contexto + secciones) y produce una nota en español, sección a sección, con citas y evidencias concretas. La nota se puede leer, editar y regenerar; la transcripción completa se puede consultar desde la misma página; y tanto la nota como la transcripción se pueden exportar a Markdown para compartir fuera de la app. Ataca el trabajo manual de síntesis (KPI #5) y mantiene el control humano sobre el output del LLM (Riesgo #6).

## Alcance de implementación

- Esta spec define **únicamente el código de producción** que debe entregarse: UI (componentes, páginas, estados), datos (queries, mutations, schema si aplica) y lógica de negocio asociada.
- **Los tests automatizados están fuera del alcance del implementador.** No se deben escribir tests unitarios (Vitest / Testing Library) ni tests end-to-end (Playwright) como parte de esta entrega. Los tests los genera la skill `/somo-qa-dev` y los ejecuta `/somo-qa-tester` contra el código ya pusheado, en un paso posterior del pipeline de QA de SOMO. Cualquier test que el implementador entregue será descartado o reemplazado.
- Si la spec requiere algún ajuste de schema, migración Supabase o cambio de RLS, se indica explícitamente en "Notas técnicas". Si no se indica, no hay cambios de infraestructura. **Sin Supabase.**
- **Matices:** la entidad `Note` y su CRUD (`api.db.createNote/getNoteByInterview/updateNote/deleteNote`) ya existen (SPEC-006) — no se crea capa de datos nueva; la persistencia de la transcripción (RF-NOTE-002) y su reutilización como contexto (RF-NOTE-003) están fuera de alcance por ya estar implementadas; la calidad del resumen con la API real queda pendiente de la clave de Anthropic del humano.

## Criterios de aceptación

### Sección Nota — visibilidad y estados base

- GIVEN una entrevista con transcripción asociada (`transcriptPath`) y sin nota WHEN se abre su página de detalle THEN aparece la sección "Nota" con el selector de note-template y el botón "Generar nota".
- GIVEN una entrevista sin grabación ni nota WHEN se abre su detalle THEN la sección "Nota" muestra el estado vacío "Graba la entrevista para poder generar la nota" sin selector ni botón de generación.
- GIVEN que no existe ningún note-template WHEN se muestra la sección Nota de una entrevista grabada THEN se muestra "Crea un note-template para generar la nota" con un Link a la gestión de note-templates y el botón "Generar nota" deshabilitado con Tooltip explicativo.
- GIVEN que no hay clave de Anthropic configurada WHEN se muestra la sección Nota de una entrevista grabada THEN se muestra el aviso con Link a Ajustes y el botón "Generar nota" deshabilitado con Tooltip explicativo.

### Generación de la nota

- GIVEN una entrevista grabada, un note-template seleccionado y clave configurada WHEN el usuario pulsa "Generar nota" THEN se genera con el LLM una nota en español que contiene un heading por cada sección del note-template, en su orden, con el contenido sintetizado de la transcripción.
- GIVEN la generación en curso WHEN se espera la respuesta THEN el botón muestra spinner con texto "Generando nota…" y queda deshabilitado.
- GIVEN la generación termina con éxito WHEN se persiste la nota THEN la entrevista pasa a estado "Resumida" (Badge), se muestra Toast "Nota generada" y la nota aparece en la sección.
- GIVEN una entrevista que ya tiene nota WHEN el usuario pulsa "Regenerar nota" THEN se muestra un AlertDialog "Regenerar nota" advirtiendo que la nota actual (incluidas sus ediciones) se sustituirá, con botones Cancelar y "Regenerar".
- GIVEN el AlertDialog de regeneración WHEN el usuario confirma THEN se genera una nueva nota que sustituye a la anterior y se muestra Toast "Nota generada".
- GIVEN un error del LLM (clave inválida, conexión, límite de uso) WHEN falla la generación THEN se muestra un Alert destructive con el mensaje según el tipo de error y la entrevista y su nota previa quedan intactas.

### Consulta y edición de la nota (RF-NOTE-004)

- GIVEN una entrevista con nota WHEN se abre su detalle THEN la sección Nota muestra el contenido de la nota en modo lectura con los botones "Editar" y "Exportar" y el botón "Regenerar nota".
- GIVEN la nota en modo lectura WHEN el usuario pulsa "Editar" THEN el contenido pasa a un editor de texto (Textarea) con botones "Guardar" y "Descartar".
- GIVEN el editor con cambios WHEN el usuario pulsa "Guardar" THEN la nota se persiste, se vuelve a modo lectura y se muestra Toast "Nota guardada".
- GIVEN el editor con cambios sin guardar WHEN el usuario pulsa "Descartar" THEN se muestra AlertDialog "Descartar cambios" con Cancelar y "Descartar"; al confirmar se restaura el contenido persistido.
- GIVEN el editor sin cambios WHEN el usuario pulsa "Descartar" THEN se vuelve a modo lectura directamente, sin AlertDialog.
- GIVEN la nota en edición WHEN el usuario guarda THEN el estado de la entrevista no cambia (sigue "Resumida").

### Consulta de la transcripción (RF-NOTE-004)

- GIVEN una entrevista con transcripción WHEN el usuario pulsa "Ver transcripción" THEN se abre un Sheet lateral con las líneas finales de la conversación, cada una con su hablante ("Tú" / "Interlocutor N") y texto, en solo lectura.
- GIVEN el archivo de transcripción ilegible o ausente en disco WHEN el usuario abre la transcripción THEN el Sheet muestra el estado de error "No se pudo leer la transcripción" sin romper la página.

### Exportación (RF-NOTE-005)

- GIVEN una entrevista con nota WHEN el usuario pulsa "Exportar" y elige "Exportar nota (.md)" THEN se abre el diálogo de guardado del sistema con un nombre por defecto derivado del título y, al confirmar, se escribe el archivo Markdown y se muestra Toast "Nota exportada".
- GIVEN una entrevista con transcripción WHEN el usuario elige "Exportar transcripción (.md)" THEN se exporta la conversación como Markdown (una línea por intervención con su hablante) y se muestra Toast "Transcripción exportada".
- GIVEN el diálogo de guardado abierto WHEN el usuario cancela THEN no se escribe nada ni se muestra Toast.
- GIVEN un fallo de escritura del archivo WHEN se exporta THEN se muestra Toast destructive "No se pudo exportar".

### Estado de la entrevista

- GIVEN una entrevista en estado "Resumida" WHEN se muestra en el detalle o en el listado de entrevistas THEN su Badge de estado muestra "Resumida".

## UX Design

### Wireframe textual

**Página de detalle de entrevista** (Layout 2 — Detalle, ya existente): se añade la **sección "Nota"** entre la sección de Grabación y la sección de Guión (el resultado de la llamada es más consultado que el guión una vez grabada).

1. **Sección Nota** (Card con heading `h3` "Nota"):
   - **Estado sin grabación:** texto muted "Graba la entrevista para poder generar la nota."
   - **Estado grabada sin nota:** fila con Select de note-template (opciones = note-templates por nombre; preseleccionado el primero) + Button default "Generar nota" (icono Sparkles) + Button outline "Ver transcripción" (icono FileText). Si no hay note-templates: texto muted "Crea un note-template para generar la nota" con Link a la página de note-templates, botón deshabilitado + Tooltip "Necesitas un note-template". Sin clave: aviso con Link a Ajustes (patrón NoKeyAlert de specs previas), botón deshabilitado + Tooltip.
   - **Generando:** Button disabled con Loader2 girando y texto "Generando nota…".
   - **Estado con nota (lectura):** toolbar superior derecha: Button outline "Editar" (icono Pencil) + DropdownMenu "Exportar" (icono Download; ítems "Exportar nota (.md)", "Exportar transcripción (.md)") + Button outline "Ver transcripción" + Button ghost "Regenerar nota" (icono RefreshCw). Debajo, el contenido markdown de la nota como texto preformateado legible (headings de sección visibles).
   - **Estado con nota (edición):** Textarea a altura generosa con el markdown + barra inferior: Button default "Guardar" + Button outline "Descartar".
   - **Error de generación:** Alert destructive bajo la toolbar con el mensaje mapeado del error (mismo mapeo de textos que la generación de guión de SPEC-014).
2. **Sheet "Transcripción"** (lado derecho, ancho medio): título "Transcripción", lista scrollable de líneas — cada línea con Badge sutil del hablante ("Tú" / "Interlocutor 1"…) + texto. Error de lectura: mensaje centrado "No se pudo leer la transcripción". Solo lectura, sin acciones.
3. **Badge de estado** de la entrevista (cabecera del detalle y listado en la empresa): gana la variante "Resumida".

### Componentes shadcn utilizados

`Card`, `Select`, `Button`, `Textarea`, `Sheet`, `AlertDialog`, `DropdownMenu`, `Badge`, `Tooltip`, `Alert`, `Toast (sonner)`, `Skeleton` (carga inicial de la nota). Todos ya instalados.

### Patrón de interacción

- **Sección en scroll dentro del detalle** (regla 8.3): la nota es contenido del item, no una página nueva; identidad arriba, guión (menos consultado tras grabar) debajo.
- **Sheet para la transcripción** (regla 4.1): consulta larga en solo lectura donde el usuario quiere conservar el contexto de la nota detrás; no es un formulario.
- **Select para el note-template** (regla 4.4): lista corta (3-10) de opciones con solo label.
- **AlertDialog antes de regenerar y de descartar cambios** (regla 6.3): ambas destruyen contenido (la nota editada / la edición en curso); botones con verbo ("Regenerar", "Descartar").
- **Toast tras cada mutación exitosa** (regla 6.1): "Nota generada", "Nota guardada", "Nota exportada", "Transcripción exportada".
- **Errores de LLM como Alert destructive inline** (regla 5.4, coherente con SPEC-014): persistentes y legibles con calma, no Toast.
- **Botones deshabilitados siempre con Tooltip** (regla 5.4).
- Decisión no cubierta por el design system: **exportación con diálogo nativo de guardado del sistema** (app Electron). Se resuelve con el save dialog del SO porque es la convención de escritorio esperada; el feedback sigue el patrón Toast del design system.

### Comportamiento responsive

- **Desktop (lg+):** como el wireframe. **Tablet/Mobile:** no aplican (app de escritorio macOS; excepción documentada desde SPEC-001).

## Notas técnicas

- **Generación en main** (patrón llmService de SPEC-014): canal `llm:generate-note(interviewId, noteTemplateId)`. Main lee el transcript.json (`lines` con canal/hablante), carga note-template + entrevista + empresa/contacto, y llama a Claude (`claude-opus-4-8`, `thinking: { type: 'adaptive' }`, structured outputs con `output_config.format json_schema`): schema `{ sections: Array<{ title: string, contentMarkdown: string }> }` con una entrada por sección del template, `additionalProperties: false`. La nota final se ensambla en main como markdown (`## <title>` + contenido, en el orden del template) y se persiste vía repositorio (`createNote` o `updateNote`) junto con `status: 'summarized'` **solo tras parseo válido**. Errores tipados con los mismos `kind` que SPEC-014; envelope `{ok, data|error}`.
- **Prompt** (esbozo): system = sintetizador de entrevistas de discovery en español; el `context` del note-template manda sobre el enfoque; exigir evidencia concreta y citas textuales (KPI #4), distinguir hechos de inferencias; user = datos de empresa/contacto, secciones numeradas con sus descripciones, conversación etiquetada por hablante (truncada si excede un límite de caracteres constante y documentado).
- **Transcripción para consulta/exportación**: reutilizar `recording:get-transcript-stats` no basta — se necesita un canal que devuelva las líneas (`recording:get-transcript-lines(path)` o equivalente) con manejo de archivo ilegible → error tipado.
- **Exportación en main**: canal `notes:export` con `dialog.showSaveDialog` (filtro `.md`, nombre por defecto derivado del título de la entrevista, slugificado); cancelación del diálogo → resultado neutro sin efecto.
- **Estado**: `summarized` ya existe en `InterviewStatus`; añadir la etiqueta contractual `summarized = "Resumida"` a los statusLabels (draft=Borrador, prepared=Preparada, recorded=Grabada).
- **Regresión presupuestada en tests**: mockApi del bridge gana los métodos nuevos (`llm.generateNote`, export, lectura de líneas) — QA adapta; los statusLabels tienen test contractual que se amplía.
- **Divergencia de stack:** igual que specs previas (Electron local, sin Lovable ni Supabase). La calidad real del resumen = verificación humana con su clave (Riesgo #6).
