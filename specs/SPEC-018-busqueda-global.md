# SPEC-018 — Búsqueda global entre discoveries, empresas, contactos y entrevistas

> Requisitos origen: RF-APP-005 (Should) · Hito H7 · Ataca usabilidad a volumen alto de entrevistas `[report §4.2 #6]`
> Relacionados: SPEC-009 (TopBar donde vive el disparador), SPEC-010/011/013 (entidades y rutas de destino)
> Naturaleza: feature de producto con UI.

## Descripción

Una búsqueda global accesible desde cualquier pantalla (botón en la barra superior o atajo ⌘K) que permite localizar por nombre cualquier discovery, empresa, contacto o entrevista y saltar directamente a su página. Los resultados aparecen agrupados por tipo mientras se escribe, sin distinguir mayúsculas ni acentos. Evita la navegación jerárquica manual (discovery → empresa → entrevista) cuando el volumen de datos crece.

## Alcance de implementación

- Esta spec define **únicamente el código de producción** que debe entregarse: UI (componentes, páginas, estados), datos (queries, mutations, schema si aplica) y lógica de negocio asociada.
- **Los tests automatizados están fuera del alcance del implementador.** No se deben escribir tests unitarios (Vitest / Testing Library) ni tests end-to-end (Playwright) como parte de esta entrega. Los tests los genera la skill `/somo-qa-dev` y los ejecuta `/somo-qa-tester` contra el código ya pusheado, en un paso posterior del pipeline de QA de SOMO. Cualquier test que el implementador entregue será descartado o reemplazado.
- Si la spec requiere algún ajuste de schema, migración Supabase o cambio de RLS, se indica explícitamente en "Notas técnicas". Si no se indica, no hay cambios de infraestructura. **Sin Supabase.**
- **Matices:** los templates (de entrevista y de notas) quedan fuera del alcance de la búsqueda (son pocos y tienen su hub propio); no hay histórico de búsquedas recientes en esta spec.

## Criterios de aceptación

### Apertura y cierre

- GIVEN cualquier pantalla de la app WHEN el usuario pulsa el botón "Buscar" de la barra superior THEN se abre el diálogo de búsqueda global con el foco en el campo de texto.
- GIVEN cualquier pantalla de la app WHEN el usuario pulsa ⌘K (o Ctrl+K) THEN se abre el diálogo de búsqueda global.
- GIVEN el diálogo abierto WHEN el usuario pulsa Escape THEN el diálogo se cierra sin navegar.
- GIVEN el diálogo abierto con texto escrito WHEN se cierra y se vuelve a abrir THEN el campo aparece vacío (búsqueda nueva).

### Resultados

- GIVEN datos existentes WHEN el usuario escribe parte del nombre de un discovery THEN el resultado aparece bajo el grupo "Discoveries".
- GIVEN datos existentes WHEN el usuario escribe parte del nombre de una empresa THEN el resultado aparece bajo el grupo "Empresas" mostrando el nombre del discovery al que pertenece como contexto.
- GIVEN datos existentes WHEN el usuario escribe parte del nombre de un contacto THEN el resultado aparece bajo el grupo "Contactos" mostrando el nombre de su empresa como contexto.
- GIVEN datos existentes WHEN el usuario escribe parte del título de una entrevista THEN el resultado aparece bajo el grupo "Entrevistas" mostrando el nombre de su empresa como contexto y el Badge de su estado.
- GIVEN un término que coincide con entidades de varios tipos WHEN se muestran los resultados THEN aparecen agrupados con los headings "Discoveries", "Empresas", "Contactos", "Entrevistas" en ese orden y solo los grupos con resultados.
- GIVEN nombres con mayúsculas o acentos ("Acmé") WHEN el usuario busca "acme" THEN la coincidencia se encuentra igualmente (insensible a mayúsculas y diacríticos).
- GIVEN más de 8 coincidencias de un mismo tipo WHEN se muestran los resultados THEN cada grupo muestra como máximo 8 resultados.

### Navegación

- GIVEN resultados visibles WHEN el usuario hace clic en un discovery THEN navega a su detalle y el diálogo se cierra.
- GIVEN resultados visibles WHEN el usuario hace clic en una empresa THEN navega al detalle de la empresa y el diálogo se cierra.
- GIVEN resultados visibles WHEN el usuario hace clic en un contacto THEN navega al detalle de la empresa del contacto y el diálogo se cierra.
- GIVEN resultados visibles WHEN el usuario hace clic en una entrevista THEN navega al detalle de la entrevista y el diálogo se cierra.
- GIVEN resultados visibles WHEN el usuario se desplaza con las flechas y pulsa Enter THEN navega al resultado seleccionado y el diálogo se cierra.

### Estados vacíos y de error

- GIVEN el diálogo recién abierto sin texto WHEN no se ha escrito nada THEN se muestra el mensaje "Escribe para buscar discoveries, empresas, contactos o entrevistas." y ningún resultado.
- GIVEN un término sin coincidencias WHEN se muestra el resultado THEN aparece el empty state "Sin resultados".
- GIVEN un fallo al consultar los datos WHEN se busca THEN se muestra el mensaje "No se pudo buscar" dentro del diálogo, sin romper la app.

## UX Design

### Wireframe textual

1. **Disparador en la TopBar** (SPEC-009, zona derecha de acciones globales): Button variant outline compacto con icono Search, texto "Buscar" y una pista de atajo `⌘K` (kbd muted). `aria-label` no necesario (tiene texto visible).
2. **Diálogo de búsqueda (command palette)**: CommandDialog centrado (ancho ~640px, parte superior de la pantalla):
   - Campo de entrada superior (CommandInput) con placeholder "Buscar…" y foco automático al abrir.
   - Lista de resultados (CommandList) con grupos en este orden: **Discoveries** (icono FolderSearch/Folder), **Empresas** (icono Building2), **Contactos** (icono User), **Entrevistas** (icono MessagesSquare). Cada fila (CommandItem): icono del tipo + nombre/título (texto principal) + contexto muted a la derecha (discovery de la empresa / empresa del contacto / empresa de la entrevista) + en entrevistas, Badge de estado (etiquetas contractuales Borrador/Preparada/Grabada/Resumida).
   - Estado inicial: texto muted centrado "Escribe para buscar discoveries, empresas, contactos o entrevistas."
   - Empty state (CommandEmpty): "Sin resultados".
   - Error: texto muted centrado "No se pudo buscar".

### Componentes shadcn utilizados

`Button`, `Badge`, `Command` (CommandDialog, CommandInput, CommandList, CommandGroup, CommandItem, CommandEmpty).

**Componente adicional necesario:** `Command` **no está instalado** en el scaffold; requiere la dependencia `cmdk` (la única dependencia nueva de esta spec, justificada: aporta navegación por teclado y accesibilidad del patrón command palette sin reimplementarlas a mano).

### Patrón de interacción

- **Command palette en Dialog** (regla 4.1: interacción < 10 s, un solo campo, no necesita ver la página detrás — y patrón estándar de búsqueda global).
- **Atajo de teclado ⌘K**: excepción documentada a la regla 11.2 ("no keyboard shortcuts custom salvo que la spec lo requiera") — esta spec lo requiere: es la convención universal del patrón y el disparador lo anuncia visualmente (`⌘K`).
- **Navegación con flechas + Enter** dentro del diálogo la aporta el propio componente Command (no se implementa a mano; coherente con 11.2 al estar contenida en el diálogo).
- **Filtrado propio, no el de cmdk**: la coincidencia (case/diacríticos-insensitive) se calcula sobre los datos y se pasan solo los resultados ya filtrados; se desactiva el filtro interno del componente para que el resultado sea determinista y testeable.
- **Máx 8 resultados por grupo** (densidad, regla 8.2): con volumen bajo-medio no hay paginación; se afina el término para acotar.
- **Sin Toast**: la búsqueda no muta datos; los errores se muestran inline en el diálogo (regla 6.1).

### Comportamiento responsive

- **Desktop (lg+):** como el wireframe. **Tablet/Mobile:** no aplican (app de escritorio macOS; excepción documentada desde SPEC-001).

## Notas técnicas

- **Búsqueda en main**: nuevo canal `db:search(query)` con envelope `{ok, data|error}` que recorre el store local y devuelve los resultados agrupados con los datos de contexto ya resueltos (empresa → nombre de discovery; contacto → nombre de empresa e id de empresa para navegar; entrevista → nombre de empresa y status). Coincidencia por subcadena sobre: nombre de discovery, nombre de empresa, nombre de contacto, título de entrevista. Normalización: minúsculas + eliminación de diacríticos (NFD) en ambos lados. Límite 8 por tipo aplicado en main. Query vacía o en blanco → grupos vacíos (el estado inicial lo gestiona la UI sin llamar).
- **Rutas de destino**: discovery → `/discoveries/:id`; empresa y contacto → `/companies/:id`; entrevista → `/interviews/:id`.
- **Debounce corto en el renderer** (~150-200 ms) para no llamar por pulsación; datos locales, latencia despreciable.
- **Regresión presupuestada en tests**: el mock del bridge gana `db.search`; la TopBar gana un botón (tests de layout que cuenten botones o hagan snapshot ligero pueden requerir adaptación por QA).
- **Divergencia de stack:** igual que specs previas (Electron local; e2e no aplica).
