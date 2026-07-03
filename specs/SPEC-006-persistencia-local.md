# SPEC-006 — Persistencia local del dominio (discoveries, empresas, contactos, templates, entrevistas, notas)

> Requisito origen: RF-APP-002 (Must) · Hito H1 ítem 2 · Checklist: "Persistencia local de datos (esquema de datos)"
> Relacionados: RF-DISC-001..005, RF-TPL-001..004, RF-GUION-001..004, RF-NOTE-001..003 (consumidores del esquema en H2/H3/H6), RF-APP-004 (note-templates), NFR §4.6 (datos sensibles, almacenamiento local)
> Naturaleza: feature de producto **backend-only** (sin UI). Define el modelo de datos y la capa de persistencia tipada en el main process, expuesta al renderer vía bridge. La UI CRUD llega en H2.

## Descripción

Establece la base de datos local de Maurya: las entidades del dominio (discoveries, empresas, contactos, templates de entrevista, entrevistas, note-templates y notas), sus relaciones, y una capa de persistencia en el main process con operaciones CRUD tipadas accesibles desde el renderer a través del bridge. Los datos viven exclusivamente en el dispositivo (userData de la app), sobreviven a reinicios y mantienen integridad referencial. Es el cimiento sobre el que H2 construye la UI de organización del discovery.

## Alcance de implementación

- Esta spec define **únicamente el código de producción** que debe entregarse: UI (componentes, páginas, estados), datos (queries, mutations, schema si aplica) y lógica de negocio asociada.
- **Los tests automatizados están fuera del alcance del implementador.** No se deben escribir tests unitarios (Vitest / Testing Library) ni tests end-to-end (Playwright) como parte de esta entrega. Los tests los genera la skill `/somo-qa-dev` y los ejecuta `/somo-qa-tester` contra el código ya pusheado, en un paso posterior del pipeline de QA de SOMO. Cualquier test que el implementador entregue será descartado o reemplazado.
- Si la spec requiere algún ajuste de schema, migración Supabase o cambio de RLS, se indica explícitamente en "Notas técnicas". Si no se indica, no hay cambios de infraestructura. **Sin Supabase**: la persistencia es local (este es el "schema" del producto, ver Notas técnicas).
- **Matiz:** sin UI en esta spec (ni pantallas ni componentes); el harness de captura existente no se modifica. La vinculación de grabaciones/transcripciones del spike con la entidad Entrevista se hará en H4; aquí solo se deja el campo previsto.

## Modelo de datos (contrato)

- **Discovery** — `id`, `name` (requerido, no vacío), `createdAt`, `updatedAt`.
- **Company** — `id`, `discoveryId` (FK), `name` (requerido), `website` (opcional), `linkedinUrl` (opcional), `createdAt`, `updatedAt`.
- **Contact** — `id`, `companyId` (FK), `name` (requerido), `position` (opcional), `linkedinUrl` (opcional), `createdAt`, `updatedAt`.
- **InterviewTemplate** — `id`, `name` (requerido), `phase` (opcional: `exploratory | problem | solution`), `blocks` (lista ordenada de bloques: `title`, `guidance` opcional, `questions`: lista ordenada de `{ text, guidance? }`), `createdAt`, `updatedAt`.
- **Interview** — `id`, `companyId` (FK), `contactId` (FK opcional), `templateId` (FK opcional), `title` (requerido), `status` (`draft | prepared | recorded | summarized`), `scriptMarkdown` (opcional, H3), `objectives` (lista de strings, H3), `wavPath`/`transcriptPath` (opcionales, H4), `createdAt`, `updatedAt`.
- **NoteTemplate** — `id`, `name` (requerido), `context` (texto largo), `sections` (lista ordenada de `{ title, description }`), `createdAt`, `updatedAt`.
- **Note** — `id`, `interviewId` (FK, única por entrevista), `contentMarkdown`, `createdAt`, `updatedAt`.

Relaciones y borrado: Discovery →* Company →* Contact; Company →* Interview; Interview →0..1 Note. **Borrar en cascada** hacia abajo (borrar un discovery elimina sus empresas, contactos, entrevistas y notas). Los templates (Interview/Note) son globales (no pertenecen a un discovery) y **no pueden borrarse** si una entrevista los referencia (o la referencia queda a null — ver AC).

## Criterios de aceptación

### CRUD básico por entidad (happy path)

- GIVEN la app inicializada WHEN se crea un discovery con nombre "Discovery Maurya" THEN la operación devuelve la entidad con `id` generado y `createdAt`/`updatedAt` poblados.
- GIVEN un discovery existente WHEN se crea una empresa con nombre, website y linkedinUrl bajo ese discovery THEN la empresa queda asociada al discovery y es recuperable listando las empresas del discovery.
- GIVEN una empresa existente WHEN se crea un contacto con nombre, posición y linkedinUrl THEN el contacto queda asociado a la empresa.
- GIVEN un template de entrevista con dos bloques y preguntas ordenadas WHEN se guarda y se vuelve a leer THEN los bloques y preguntas conservan su orden y contenido exactos.
- GIVEN una empresa y un template WHEN se crea una entrevista con título, contacto y template THEN la entrevista queda en estado `draft` con las referencias correctas.
- GIVEN un note-template con contexto y secciones WHEN se guarda y se relee THEN el contenido es idéntico.
- GIVEN cualquier entidad existente WHEN se actualiza un campo THEN `updatedAt` cambia y la lectura devuelve el valor nuevo.

### Persistencia real (supervivencia a reinicios)

- GIVEN entidades creadas WHEN la app se cierra y se vuelve a abrir THEN todas las entidades siguen presentes con sus datos intactos.

### Validación

- GIVEN una operación de creación de discovery/empresa/contacto/template con `name` vacío o solo espacios WHEN se invoca THEN la operación falla con un error tipado de validación y no persiste nada.
- GIVEN una creación de empresa con `discoveryId` inexistente WHEN se invoca THEN falla con error tipado de referencia y no persiste nada.

### Integridad referencial y borrado

- GIVEN un discovery con empresas, contactos y entrevistas WHEN se borra el discovery THEN se eliminan en cascada todas sus empresas, contactos, entrevistas y notas asociadas.
- GIVEN un template de entrevista referenciado por una entrevista WHEN se borra el template THEN la entrevista sobrevive con `templateId` a null (SET NULL, no cascada).
- GIVEN una entrevista con nota WHEN se borra la entrevista THEN su nota se elimina también.

### Empty state (API)

- GIVEN una base de datos recién inicializada WHEN se listan discoveries THEN se devuelve una lista vacía (no un error).

### Error state

- GIVEN el archivo de datos corrupto o ilegible al arrancar WHEN se inicializa la persistencia THEN la app no crashea: reporta el error de forma tipada al renderer y conserva el archivo dañado (renombrado con sufijo `.corrupt-<timestamp>`) antes de crear uno nuevo vacío.

### Edge cases

- GIVEN dos operaciones de escritura encadenadas rápidas WHEN se ejecutan THEN ambas persisten (sin pérdida por escrituras concurrentes).
- GIVEN nombres con caracteres especiales/emoji/longitud 500 WHEN se guardan THEN se recuperan idénticos.

## Notas técnicas

- **Motor de almacenamiento:** decisión delegada al plan de implementación entre (a) **SQLite embebido** (`better-sqlite3` en main; requiere rebuild nativo para Electron — el `postinstall: electron-builder install-app-deps` ya existe) y (b) **almacén JSON transaccional propio** (un archivo por dominio o único, escritura atómica write-rename). Criterios: cero fricción de build > features; el volumen del MVP es bajo (decenas-cientos de filas); H3 necesitará leer "entrevistas previas de una empresa" (consulta simple). Si el rebuild nativo introduce fragilidad en `npm run dev`/`build:mac`, elegir (b).
- **Ubicación:** `app.getPath('userData')/maurya-data/` (junto a `recordings/`). Nunca fuera de userData (NFR §4.6).
- **Arquitectura:** servicios de dominio en main (`src/main/db/` o equivalente: un módulo por entidad o repositorio común), IPC `invoke` tipado por operación, bridge `api.db.<entidad>.<operación>` en preload, tipos compartidos en `src/renderer/src/types/domain.ts` (DOM-free, importable type-only desde main como ya hace `audio.ts`).
- **IDs:** UUID v4 generados en main (`crypto.randomUUID()`).
- **Timestamps:** ISO 8601 UTC generados en main.
- **Errores tipados:** `{ kind: 'validation' | 'not-found' | 'reference' | 'storage', message }` — el renderer los recibirá tal cual (la UI de H2 los mapeará a inline errors/toasts).
- **Sin migraciones formales en esta spec:** un campo `schemaVersion` en el almacén basta; la política de migración llegará cuando haya un cambio real de esquema.
- **Divergencia de stack:** igual que specs previas (Electron local; e2e no aplica; los servicios de main son testeables en node env con userData temporal).
