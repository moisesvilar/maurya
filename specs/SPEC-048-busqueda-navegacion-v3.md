# SPEC-048 — Búsqueda global y navegación adaptadas al modelo v3

> Origen: ítem 6 de H11 en `docs/checklist.md` (RF-APP-005), draft
> `docs/drafts/company-contact-entities-20260716.md`. Depende de SPEC-044 (sección Empresas
> global) y SPEC-046 (página del grupo). Elimina el «ancla transicional» de SPEC-043/044 y añade
> los grupos de entrevistas a la búsqueda global.

## Descripción

La búsqueda global (⌘K) se adapta al modelo v3: los resultados de empresa navegan directamente a
su detalle global (sin pasar por un discovery), los de contacto al detalle global de su empresa, y
aparece un grupo nuevo «Grupos» que permite encontrar grupos de entrevistas por nombre y saltar a
su página. Además, el back button del detalle de entrevista se vuelve contextual: vuelve al grupo
si la entrevista pertenece a uno, y al detalle global de la empresa en caso contrario.

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
proyecto no hay Supabasa y NO hay bump de schema; SÍ cambian los tipos del contrato de búsqueda
(`types/search.ts`) y el índice en main (`src/main/db/search.ts`) — detallado en "Notas técnicas".
- **Fuera de alcance:** unificar las dos páginas de detalle de entrevista (`InterviewDetailPage` /
`CaptureDetailPage`) y sus rutas — deuda conocida documentada; los redirects legados de SPEC-044
se conservan.

## Criterios de aceptación

### Búsqueda — empresas y contactos globales

- GIVEN una empresa que coincide con la query WHEN se selecciona su resultado THEN navega a `/companies/:companyId` (directo, sin discovery de por medio).
- GIVEN un sistema SIN discoveries pero con empresas WHEN se busca una empresa THEN su resultado APARECE y navega correctamente (deroga la omisión defensiva del ancla transicional de SPEC-043).
- GIVEN un contacto que coincide WHEN se selecciona su resultado THEN navega a `/companies/:companyId` de su empresa, y el contexto mostrado en la fila sigue siendo el nombre de la empresa.

### Búsqueda — grupos de entrevistas

- GIVEN grupos cuyos nombres coinciden con la query (con la misma normalización de acentos/mayúsculas del resto de la búsqueda) WHEN se muestran los resultados THEN aparece el grupo «Grupos» con cada hit mostrando el nombre del grupo y, como contexto muted, el nombre de su discovery.
- GIVEN un hit de grupo WHEN se selecciona THEN navega a `/discoveries/:discoveryId/groups/:groupId`.
- GIVEN más de 8 grupos coincidentes WHEN se muestran los resultados THEN el grupo «Grupos» lista como máximo 8 (límite de main, igual que el resto).
- GIVEN cero grupos coincidentes WHEN se muestran los resultados THEN el grupo «Grupos» no se renderiza (patrón actual de grupos vacíos).
- GIVEN un grupo cuyo discovery no resuelve (dato inconsistente) WHEN se busca THEN ese hit se omite defensivamente (la búsqueda nunca rompe).

### Búsqueda — entrevistas (sin cambios de comportamiento)

- GIVEN un hit de entrevista con empresa WHEN se selecciona THEN navega a su detalle por la ruta anidada existente; sin empresa, a `/captures/:id` (comportamiento SPEC-020 conservado).

### Navegación — back contextual del detalle de entrevista

- GIVEN el detalle de una entrevista con `interviewGroupId` WHEN se pulsa «Volver» THEN navega a la página de su grupo (`/discoveries/:discoveryId/groups/:groupId`, construida con los datos de la propia entrevista).
- GIVEN el detalle de una entrevista sin grupo WHEN se pulsa «Volver» THEN navega a `/companies/:companyId` (detalle global directo, sin pasar por el redirect legado).
- GIVEN una entrevista cuyo grupo fue borrado después de cargar la página WHEN se pulsa «Volver» THEN aterriza en la página del grupo, que muestra su error state con enlace «Volver al discovery» (sin crash — comportamiento SPEC-046 ya existente; no se requiere lógica extra).

## UX Design

### Wireframe textual

**Command palette ⌘K (existente, SPEC-018):** grupos en este orden: Discoveries · **Grupos**
(nuevo) · Empresas · Contactos · Entrevistas. La fila de grupo replica el patrón de la de
contacto: icono `Layers` (16px), nombre truncado y contexto muted a la derecha con el nombre del
discovery. El resto de filas no cambian visualmente.

**Detalle de entrevista (existente):** sin cambios visuales; solo cambia el destino del botón
ghost «Volver».

### Componentes shadcn utilizados

Componentes: Command (cmdk, existente), sin componentes nuevos.

### data-testid

Sin data-testid adicionales: los grupos del palette se localizan por su heading dentro de
`[cmdk-group]` (lección de QA de SPEC-018) y las filas por texto.

### Patrón de interacción

- Mismo patrón de palette de SPEC-018 (grupos vacíos ocultos, máx 8 por grupo, Escape cierra,
  Enter navega).
- Back button en lugar de breadcrumbs: decisión de consistencia con toda la app (regla 2.2/2.3 —
  breadcrumbs y back button no coexisten y el patrón vigente en las páginas de detalle es back
  button; la profundidad percibida por salto es siempre 1 nivel).

### Comportamiento responsive

Sin cambios (hereda el del palette y las páginas existentes).

## Notas técnicas

- `types/search.ts`: `SearchCompanyHit` pierde `discoveryId` (queda `{ id, name }`);
  `SearchContactHit` pierde `companyDiscoveryId`; nuevo `SearchGroupHit { id, discoveryId, name,
  discoveryName }`; `SearchResults` gana `groups: SearchGroupHit[]` (colocado entre `discoveries`
  y `companies`).
- `src/main/db/search.ts`: eliminar por completo el «ancla transicional» (mapa
  `anchorDiscoveryByCompany` + fallback) — las empresas ya no necesitan discovery y dejan de
  omitirse; añadir el índice de grupos (nombre normalizado NFD, mismo helper de matching, límite
  8, contexto `discoveryName` resuelto con Map O(1); discovery irresoluble → hit omitido).
- `GlobalSearchDialog.tsx`: grupo «Grupos» nuevo (icono `Layers`), navegación de empresas a
  `/companies/:id` y de contactos a `/companies/:companyId`; entrevistas sin cambios.
- `InterviewDetailPage.tsx`: el back button pasa de la ruta anidada de empresa a: con
  `interview.interviewGroupId` → `/discoveries/${interview.discoveryId}/groups/${interviewGroupId}`;
  sin grupo → `/companies/${companyId}` (el `companyId` del param de la ruta sigue disponible).
  El error state «Volver a Discoveries» no cambia.
- Derogaciones: SPEC-043/044 (ancla transicional de búsqueda y navegación de hits por rutas
  legadas), SPEC-013 (back del detalle de entrevista a la ruta anidada). Sus tests se adaptan como
  evolución presupuestada.

## Decisiones asumidas

- [¿Ruta plana `/interviews/:id` unificada?] → asumido NO (alternativa: unificar detalle de
  entrevista y captura bajo una ruta plana). Criterio: cambio grande sin requisito en el draft; la
  ruta anidada funciona y `/captures/:id` ya es el detalle universal sin empresa. Queda como deuda
  conocida.
- [¿Breadcrumbs en las páginas anidadas?] → asumido NO, se mantienen los back buttons
  (alternativa: breadcrumbs en grupo/entrevista). Criterio: regla 2.3 (no coexisten) y consistencia
  con el patrón vigente en todas las páginas de detalle.
- [¿Posición del grupo «Grupos» en el palette?] → asumido entre Discoveries y Empresas
  (alternativa: al final). Criterio: refleja la jerarquía discovery → grupo → entrevista.
- [¿Back de entrevista sin grupo y sin empresa?] → no aplica: esa combinación solo existe en
  capturas, cuyo detalle es `/captures/:id` con back propio a Capturas (sin cambios).
