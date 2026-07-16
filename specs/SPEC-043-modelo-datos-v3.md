# SPEC-043 — Modelo de datos v3: empresas globales, grupos de entrevistas y migración automática

> Origen: ítem 1 de H11 en `docs/checklist.md` (RF-DISC-006..010, RF-APP-002), decisiones humanas
> del 2026-07-16 en `docs/drafts/company-contact-entities-20260716.md`. Es la spec base del hito:
> H11.2..6 construyen la UI sobre este modelo. Introduce el cambio de modelo más grande desde
> SPEC-006: las empresas dejan de pertenecer a un discovery.

## Descripción

Hoy una empresa vive dentro de un discovery: usarla en otro discovery obliga a duplicarla, y una
entrevista solo admite un contacto. Esta spec convierte empresas y contactos en entidades globales
reutilizables, añade los grupos de entrevistas dentro de cada discovery (con objetivo y templates
por defecto), da al discovery un campo de objetivos, permite N contactos por entrevista y migra
automáticamente los datos existentes sin pérdida. Es un cambio de capa de datos: la UI nueva
(secciones Empresas, grupos, selector de N contactos) llega en las specs H11.2..5; aquí solo se
adapta mecánicamente la UI existente para que la app siga funcionando igual que hoy.

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
proyecto no hay Supabase: el cambio de schema afecta al JSON store local (`db.json`,
schemaVersion 2→3) y se detalla en "Notas técnicas".
- **La UI nueva de H11 está fuera de alcance** (sección Empresas global, CRUD de grupos, selector
de N contactos, template de nota con override): aquí solo se hace la adaptación mecánica mínima
de la UI existente descrita en "Notas técnicas §Adaptación transicional del renderer", para que
typecheck, lint y la app sigan verdes con el modelo nuevo.

## Criterios de aceptación

### Empresas globales

- GIVEN el almacén inicializado WHEN se crea una empresa con nombre válido (sin indicar discovery) THEN la empresa se persiste sin campo `discoveryId` y con `website`/`linkedinUrl`/`context` según input (ausentes → null).
- GIVEN empresas creadas WHEN se listan las empresas THEN se devuelven TODAS las del sistema (el listado ya no se filtra por discovery).
- GIVEN una empresa con nombre vacío o solo espacios WHEN se intenta crear THEN se rechaza con error `validation` y no se persiste nada.
- GIVEN un discovery con empresas usadas en sus entrevistas WHEN se elimina el discovery THEN las empresas y sus contactos SOBREVIVEN (solo caen las entrevistas del discovery, sus notas y sus grupos).

### Borrado de empresa (SET NULL en entrevistas)

- GIVEN una empresa con contactos y entrevistas asociadas WHEN se elimina la empresa THEN sus contactos se eliminan en cascada y cada entrevista asociada sobrevive con `companyId` null y `contactIds` vacío, conservando `scriptMarkdown`, `objectives`, `wavPath`, `transcriptPath` y su nota.
- GIVEN una empresa inexistente WHEN se intenta eliminar THEN se rechaza con error `not-found` y no se persiste nada.

### Grupos de entrevistas (CRUD)

- GIVEN un discovery existente WHEN se crea un grupo con nombre válido THEN se persiste con `discoveryId` del discovery, `objective`/`interviewTemplateId`/`noteTemplateId` según input (ausentes → null) y timestamps de creación.
- GIVEN un grupo con nombre vacío o solo espacios WHEN se intenta crear THEN se rechaza con error `validation` y no se persiste nada.
- GIVEN un discovery inexistente WHEN se intenta crear un grupo en él THEN se rechaza con error `reference` y no se persiste nada.
- GIVEN un `interviewTemplateId` o `noteTemplateId` inexistente WHEN se intenta crear o actualizar un grupo con él THEN se rechaza con error `reference` y no se persiste nada.
- GIVEN grupos de varios discoveries WHEN se listan los grupos de un discovery THEN se devuelven solo los de ese discovery.
- GIVEN un grupo existente WHEN se actualiza nombre, `objective`, `interviewTemplateId` o `noteTemplateId` THEN el cambio se persiste y `updatedAt` avanza estrictamente.
- GIVEN un grupo con entrevistas asignadas WHEN se elimina el grupo THEN las entrevistas SOBREVIVEN con `interviewGroupId` null (conservando el resto de sus datos) y el grupo desaparece.
- GIVEN un template de entrevista o un note-template referenciado por un grupo WHEN se elimina ese template THEN el grupo sobrevive con la referencia correspondiente a null (SET NULL).

### Objetivos del discovery

- GIVEN un discovery WHEN se crea con `objectives` de texto no vacío THEN se persiste ese texto; si no se indica, el discovery queda con `objectives` null.
- GIVEN un discovery existente WHEN se actualiza `objectives` (texto o null) THEN el cambio se persiste y `updatedAt` avanza estrictamente.

### Entrevistas con N contactos y grupo opcional

- GIVEN una empresa con dos contactos WHEN se crea una entrevista con esa empresa y `contactIds` con ambos THEN se persiste con `contactIds` en el orden dado y `interviewGroupId` según input (ausente → null).
- GIVEN un `contactIds` que incluye un contacto de OTRA empresa WHEN se intenta crear o actualizar la entrevista THEN se rechaza con error `reference` y no se persiste nada.
- GIVEN un `contactIds` no vacío y `companyId` null WHEN se intenta crear o actualizar la entrevista THEN se rechaza con error `reference` y no se persiste nada.
- GIVEN un `contactIds` con ids duplicados WHEN se intenta crear o actualizar la entrevista THEN se rechaza con error `validation` y no se persiste nada.
- GIVEN un grupo del discovery A WHEN se intenta crear una entrevista del discovery B con ese grupo THEN se rechaza con error `reference` y no se persiste nada.
- GIVEN una entrevista con `interviewGroupId` de un grupo existente de su discovery WHEN se crea THEN se persiste con esa referencia.
- GIVEN un contacto referenciado por el `contactIds` de varias entrevistas WHEN se elimina el contacto THEN cada entrevista sobrevive con ese id retirado de su `contactIds` (los demás contactos se conservan).
- GIVEN la asignación diferida de empresa (flujo capturas) con una empresa existente WHEN se asigna THEN se acepta cualquier empresa del sistema (ya no se exige que "pertenezca" al discovery de la captura) y la entrevista queda con `companyId` y `contactIds` según lo elegido ([contacto] o vacío).
- GIVEN la asignación diferida con empresa nueva WHEN se asigna THEN la empresa se crea GLOBAL (sin discovery) y la entrevista queda apuntando a ella, todo en una única mutación atómica.
- GIVEN el listado global de capturas WHEN se resuelven los nombres THEN cada ítem resuelve los nombres de TODOS sus contactos (en el orden de `contactIds`) además de discovery, empresa y template, con referencias rotas → null (defensivo).

### Migración v2 → v3

- GIVEN un `db.json` con `schemaVersion: 2` (empresas con `discoveryId`, entrevistas con `contactId`) WHEN se inicializa el almacén THEN se migra y persiste atómicamente como v3: empresas sin `discoveryId` (resto de campos intactos, sin deduplicar), cada entrevista con `contactIds` = `[contactId]` (o vacío si era null) y sin campo `contactId`.
- GIVEN un v2 con discoveries CON entrevistas WHEN se migra THEN cada uno de esos discoveries recibe exactamente un grupo «General» (`objective`/`interviewTemplateId`/`noteTemplateId` null) y todas sus entrevistas quedan con `interviewGroupId` de ese grupo; los discoveries sin entrevistas no reciben grupo.
- GIVEN un v2 con settings opcionales (`aiCostSettings`, `assistantSettings`, `customPrompts`, `linkedinMcpSettings`) y campos opcionales de entrevista (`aiUsage`, `objectiveResults`, `objectiveOverrides`, `questionOutcomes`) WHEN se migra THEN todos se conservan intactos.
- GIVEN un `db.json` con `schemaVersion: 1` WHEN se inicializa el almacén THEN se encadenan las migraciones v1→v2→v3 y el resultado es un v3 válido.
- GIVEN un `db.json` ya en v3 WHEN se inicializa el almacén THEN se carga tal cual, sin re-migrar ni reescribir grupos «General» adicionales.
- GIVEN un almacén nuevo (sin archivo) WHEN se inicializa THEN se crea vacío con `schemaVersion: 3` y la colección `interviewGroups` presente.
- GIVEN un archivo corrupto o con estructura inválida WHEN se inicializa THEN se conserva como `.corrupt-<ts>`, se arranca un v3 vacío y el error queda consultable vía `getStatus()` (comportamiento SPEC-006 intacto).

### Cascada de discovery (v3)

- GIVEN un discovery con grupos, entrevistas (con y sin grupo) y notas WHEN se elimina el discovery THEN caen en cascada sus entrevistas, las notas de estas y sus grupos — y NINGUNA empresa ni contacto.

## Notas técnicas

- **Schema v3 (`db.json`)**: `SCHEMA_VERSION = 3`; `DbData` gana la colección `interviewGroups`
  (array obligatorio en v3). El chequeo estructural `isDbData` debe aceptar un v2 sin
  `interviewGroups` para poder migrarlo (validación por versión o colección tolerada como ausente
  pre-migración). La migración corre en `initStore` ANTES del primer `mutate`, con persistencia
  atómica (patrón `migrateV1ToV2`); v1 encadena v1→v2→v3.
- **Entidades**: `Company` pierde `discoveryId`. `Discovery` gana `objectives: string | null`
  (texto libre). Nueva `InterviewGroup { id, discoveryId, name, objective: string | null,
  interviewTemplateId: string | null, noteTemplateId: string | null, createdAt, updatedAt }`.
  `Interview` pierde `contactId` y gana `contactIds: string[]` e
  `interviewGroupId: string | null`.
- **Invariantes del repositorio (v3)**: `contactIds` ⊆ contactos de `companyId`, sin duplicados,
  no vacío ⇒ `companyId` ≠ null; `interviewGroupId` ≠ null ⇒ el grupo existe y
  `group.discoveryId === interview.discoveryId`. Desaparece la invariante SPEC-020 «la empresa
  pertenece al discovery» (las empresas son globales).
- **Cascadas (v3)**: discovery → grupos + entrevistas (+notas). Empresa → contactos (CASCADE) +
  entrevistas (SET NULL: `companyId` null y `contactIds` vacío). Contacto → retirada del id en
  `contactIds`. Grupo → entrevistas con `interviewGroupId` null. Template de entrevista →
  `Interview.templateId` null (existente) + `InterviewGroup.interviewTemplateId` null. Note-template
  → `InterviewGroup.noteTemplateId` null.
- **Contratos IPC/bridge**: `db:*` gana la familia de grupos (`createInterviewGroup`,
  `listInterviewGroups(discoveryId)`, `getInterviewGroup`, `updateInterviewGroup`,
  `deleteInterviewGroup`) con el patrón envelope `DbResult` y helper `handleDb` existentes;
  `listCompanies()` pierde el parámetro; inputs/patches de discovery ganan `objectives`, los de
  entrevista cambian `contactId` → `contactIds` y ganan `interviewGroupId` (solo en create;
  la asignación de grupo por patch no se necesita aún). `CaptureListItem.contactName` pasa a
  `contactNames: string[]` (resueltos en orden). `AssignCompanyInput` conserva su forma actual
  (un contacto opcional); `AssignCompanyResult.contact` se mantiene y la entrevista resultante
  lleva `contactIds` = `[contacto]` o `[]`.
- **Adaptación transicional del renderer** (mínima, la reemplazan H11.2..5): la página de empresas
  bajo el discovery lista TODAS las empresas (globales) y su alta deja de enviar `discoveryId`;
  el Dialog de crear entrevista (SPEC-013) y el Sheet de asignación (SPEC-020) siguen con su
  selector de UN contacto y envían `contactIds` de 0 o 1 elemento; las filas que muestran
  "{contacto}" muestran los `contactNames` unidos por ", " (o el fallback "Sin contacto");
  el contexto de empresa en la búsqueda global deja de mostrar el nombre del discovery. Ningún
  flujo de usuario desaparece.
- **Servicios LLM**: `llmService`/`noteService`/`assistantService` resuelven hoy UN contacto; se
  adaptan mecánicamente a usar el PRIMER contacto de `contactIds` (la personalización con N
  contactos es de H11.4). El comportamiento degradable sin empresa/contacto se conserva.
- **Derogaciones de specs anteriores** (para el mapa de trazabilidad, no reimplementar): SPEC-011
  (empresas por discovery: alta/listado filtrado), SPEC-013/020 (invariante empresa∈discovery y
  `contactId` único), SPEC-018 (contexto "{discovery}" en resultados de empresa). Sus tests se
  adaptan como evolución presupuestada.

## Decisiones asumidas

- [¿Grupo «General» también para discoveries sin entrevistas?] → asumido NO: solo discoveries con
  ≥1 entrevista reciben grupo en la migración (alternativa: crearlo siempre). Criterio: no fabricar
  entidades vacías que el usuario no pidió.
- [¿Qué pasa con las entrevistas al borrar su grupo?] → asumido SET NULL (`interviewGroupId` null,
  la entrevista conserva grabación/nota) (alternativa: cascada). Criterio: coherente con la
  decisión humana «borrar empresa → SET NULL»; una entrevista realizada nunca se pierde por
  reorganización.
- [¿Templates del grupo obligatorios al crearlo?] → asumido opcionales/nullable (alternativa:
  obligatorios). Criterio: patrón degradable existente (`Interview.templateId` nullable); la UI de
  H11.3 decidirá qué exige el formulario.
- [¿`contactIds` duplicados?] → asumido error `validation` explícito (alternativa: deduplicar en
  silencio). Criterio: coherente con el resto de validaciones del repositorio (fallar y no
  persistir, sin corregir datos del caller).
- [¿`Discovery.objectives` texto libre o lista?] → asumido `string | null` texto libre
  (alternativa: `string[]` como los objetivos de entrevista). Criterio: RF-DISC-008 lo define como
  texto libre; la lista tipada solo existe donde la IA la genera (entrevista).
- [¿`assignInterviewCompany` con N contactos ya?] → asumido conservar UN contacto opcional en el
  input (alternativa: multiselección ya en esta spec). Criterio: el flujo multi-contacto con su UI
  es H11.4; aquí solo cambia la forma persistida (`contactIds`).
