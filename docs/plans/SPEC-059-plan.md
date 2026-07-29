# SPEC-059 — Plan de implementación · Onboarding de la app: primeros pasos guiados

> Plan autorado por el orquestador. Origen: issue #35 (petición humana directa), cubre RF-APP-005 y apoya RF-CFG-001; no traza a una fila del checklist. Clona tres patrones ya establecidos en la casa: derivación pura en `lib/` (SPEC-058, `lib/onboardingStep.ts`), singleton opcional en `db.json` sin bump de `schemaVersion` (`aiCostSettings` / `assistantSettings` / `linkedinMcpSettings`) y canal `db:*` con envelope `DbResult` vía `handleDb`.

## 1. Resumen del cambio

Se añade un banner-checklist de 8 pasos en `/captures` (`CapturesPage`), entre la cabecera de la página y el listado. El banner **deriva** cada paso del estado real (claves + almacén) y **nunca persiste el paso**; lo único persistido son dos marcas del nuevo singleton `onboardingSettings` (`promptsReviewedAt`, `hiddenAt`).

Tres piezas nuevas de backend (un canal agregado de lectura + dos canales de escritura), un módulo puro de derivación en `lib/`, un hook que resuelve las dos fuentes asíncronas (almacén + claves) y un componente de presentación. Sin bump de `schemaVersion`, sin migración, sin tocar el pipeline de audio ni el LLM.

### Ficheros a crear

| Fichero | Qué hace |
| --- | --- |
| `src/renderer/src/lib/appOnboarding.ts` | Lógica pura: de `AppOnboardingStatus` + estado de claves → los 8 pasos con `done`, `target`, literales y el paso actual. Testeable sin DOM (precedente `lib/onboardingStep.ts`). |
| `src/renderer/src/hooks/useAppOnboarding.ts` | Carga en paralelo `db.getOnboardingStatus()` y `secrets.getStatus()`, expone `state` (`loading` / `error` / `ready` / `hidden`) + `view` derivada + acciones `markPromptsReviewed()` y `hide()`. |
| `src/renderer/src/components/captures/AppOnboardingBanner.tsx` | Card de presentación: cabecera (Sparkles + «Primeros pasos con Maurya» + «N de 8» + «Ocultar»), lista de 8 filas con icono de estado, paso actual expandido con texto de apoyo + CTA, estado final «¡Todo listo!». |

### Ficheros a modificar

| Fichero | Qué se cambia |
| --- | --- |
| `src/main/db/store.ts` | Campo opcional `onboardingSettings?: OnboardingSettings` en `DbData`, con comentario del patrón (ausente = ambos null; `isDbData` lo tolera y `persist` lo conserva). **No** se toca `SCHEMA_VERSION`, ni `COLLECTIONS`, ni `emptyData()`, ni `isDbData()`, ni las migraciones (el spread de `migrateV2ToV3` ya conserva los singletons). |
| `src/main/db/repository.ts` | Nueva sección «Onboarding de la app (SPEC-059)» al final, junto a las de coste/asistente/MCP: `getOnboardingSettings()` (normalización defensiva), `markOnboardingPromptsReviewed()`, `hideAppOnboarding()` y el agregado `getAppOnboardingStatus()`. |
| `src/main/db/ipc.ts` | Registro de los 3 canales nuevos con `handleDb`, en un bloque comentado tras el de MCP de LinkedIn. |
| `src/preload/index.ts` | 3 métodos nuevos en el objeto plano `db` (bloque comentado propio), delegando en sus canales. |
| `src/renderer/src/types/domain.ts` | Tipos `OnboardingSettings` y `AppOnboardingStatus` (junto a `AssistantSettings` / `LinkedinMcpSettings`) + las 3 firmas nuevas en `DbApi`. |
| `src/renderer/src/pages/CapturesPage.tsx` | Render de `<AppOnboardingBanner />` inmediatamente después del `div` de cabecera (título «Capturas» + «Nueva captura») y **antes** de la fila de chips de filtro. Nada más de la página cambia. |

## 2. Contrato de los canales

### Canal agregado de lectura

- Canal: **`db:onboarding:get-status`** · repositorio: `getAppOnboardingStatus()` · bridge: `window.api.db.getOnboardingStatus()` · envelope `DbResult<AppOnboardingStatus>`.
- Es de solo lectura y se resuelve en una única pasada sobre el snapshot (`read()`), sin `mutate` — cero escrituras y cero carreras entre listados.

```ts
/** Payload devuelto por db:onboarding:get-status (SPEC-059). */
export interface AppOnboardingStatus {
  /** Singleton persistido, ya normalizado (nunca undefined). */
  settings: OnboardingSettings
  /** Paso 3: ≥1 plantilla de preguntas / de notas. */
  hasInterviewTemplate: boolean
  hasNoteTemplate: boolean
  /** Paso 4/5: ≥1 empresa / ≥1 contacto en cualquier empresa. */
  hasCompany: boolean
  hasContact: boolean
  /** Paso 6/7: ≥1 discovery / ≥1 grupo de entrevistas en cualquier discovery. */
  hasDiscovery: boolean
  hasInterviewGroup: boolean
  /** Paso 8: ≥1 entrevista con `interviewGroupId` no nulo (las capturas no cuentan). */
  hasGroupedInterview: boolean
  /** Destinos de los CTA: primera empresa / primer discovery / primer grupo. */
  firstCompanyId: string | null
  firstDiscoveryId: string | null
  firstGroup: { id: string; discoveryId: string } | null
}
```

Implementación de `getAppOnboardingStatus()` (todo dentro de un solo `read((store) => ...)`, sin llamar a los `list*` del repositorio para no clonar arrays sin necesidad, pero respetando **su mismo orden**):

- `hasInterviewTemplate` = `store.interviewTemplates.length > 0` · `hasNoteTemplate` = `store.noteTemplates.length > 0`.
- `hasCompany` = `store.companies.length > 0` · `firstCompanyId` = `store.companies[0]?.id ?? null` (orden de inserción, el mismo que devuelve `listCompanies()`, que hace `read((store) => store.companies)` sin ordenar).
- `hasContact` = `store.contacts.length > 0` (la condición es «en cualquier empresa», no por empresa: `listContacts(companyId)` filtra, aquí no hace falta).
- `hasDiscovery` = `store.discoveries.length > 0` · `firstDiscoveryId` = `store.discoveries[0]?.id ?? null` (orden de `listDiscoveries()`).
- `hasInterviewGroup` = `store.interviewGroups.length > 0` · `firstGroup` = `{ id, discoveryId }` del primer elemento de `store.interviewGroups` (orden de inserción global).
- `hasGroupedInterview` = `store.interviews.some((i) => i.interviewGroupId !== null)`.
- `settings` = el resultado de `getOnboardingSettings()` (la normalización defensiva vive ahí y se reutiliza).

### Canales de escritura

- **`db:onboarding:mark-prompts-reviewed`** · `markOnboardingPromptsReviewed(): OnboardingSettings` · bridge `window.api.db.markOnboardingPromptsReviewed()` · `DbResult<OnboardingSettings>`. Escribe `promptsReviewedAt = nowIso()` conservando `hiddenAt`. Idempotente (re-pulsar solo refresca la fecha).
- **`db:onboarding:hide`** · `hideAppOnboarding(): OnboardingSettings` · bridge `window.api.db.hideAppOnboarding()` · `DbResult<OnboardingSettings>`. Escribe `hiddenAt = nowIso()` conservando `promptsReviewedAt`. Idempotente.

Ambas usan `mutate((draft) => { draft.onboardingSettings = next; return next })` sobre el valor **normalizado** previo (leer con `getOnboardingSettings()` antes de mutar, para no propagar un singleton corrupto), replicando `setAssistantSettings` / `setLinkedinMcpSettings`. Nunca se escriben por patch genérico (invariante de SPEC-058 para las marcas de onboarding).

Nombre del bridge: `hideAppOnboarding` — **no** `hideOnboarding`, para no confundirse con el `hideInterviewOnboarding(id)` de SPEC-058, que ya existe en `DbApi` y es otro dominio.

> **Desviación respecto a la spec**: la spec sugiere `db:onboarding-status:get`. Se propone `db:onboarding:get-status` / `db:onboarding:mark-prompts-reviewed` / `db:onboarding:hide` porque la convención dominante del fichero es `db:<entidad>:<operación>` (`db:interview:hide-onboarding`, `db:custom-prompt:reset`) y aquí la entidad es `onboarding` con tres operaciones; `db:onboarding-status:get` inventaría una entidad («onboarding-status») que solo cubriría una de las tres. Es una desviación de nombre, no de contrato.

## 3. Tipos nuevos

Todos en `src/renderer/src/types/domain.ts` (fuente única del contrato main↔renderer; main y preload lo importan type-only, como ya hacen con `AssistantSettings`). **No** se crea un fichero de tipos nuevo y **no** se declara nada de esto en `src/main`.

- `OnboardingSettings { promptsReviewedAt: string | null; hiddenAt: string | null }` — ISO 8601; ubicar junto a `AssistantSettings` / `LinkedinMcpSettings` con el comentario del patrón «singleton opcional en db.json, sin bump de schemaVersion; ausente = ambos null».
- `AppOnboardingStatus` — el payload del §2; ubicarlo justo debajo de `OnboardingSettings`.
- En `DbApi`, tras el bloque del MCP de LinkedIn: `getOnboardingStatus: () => Promise<DbResult<AppOnboardingStatus>>`, `markOnboardingPromptsReviewed: () => Promise<DbResult<OnboardingSettings>>`, `hideAppOnboarding: () => Promise<DbResult<OnboardingSettings>>`.
- En `src/main/db/store.ts` se importa `OnboardingSettings` desde `../../renderer/src/types/domain` (junto a los demás) para tipar el campo de `DbData`; en `repository.ts` se importan `OnboardingSettings` y `AppOnboardingStatus`.
- En `src/renderer/src/lib/appOnboarding.ts` viven los tipos de la vista derivada (no del contrato IPC): `AppOnboardingStepNumber = 1|2|3|4|5|6|7|8`, `AppOnboardingStepView` y `AppOnboardingView` (ver §4).

## 4. Derivación de los 8 pasos (lógica pura en `lib/`)

Fichero: **`src/renderer/src/lib/appOnboarding.ts`**. Precedente exacto: `src/renderer/src/lib/onboardingStep.ts` (función pura, sin React, sin `window.api`, con el porqué de cada regla en el docblock).

```ts
export interface AppOnboardingInput {
  status: AppOnboardingStatus
  /** Del canal existente secrets:get-status; `configured` de cada clave. */
  anthropicConfigured: boolean
  deepgramConfigured: boolean
}

export interface AppOnboardingStepView {
  step: AppOnboardingStepNumber
  label: string        // etiqueta literal de la tabla de la spec
  support: string      // texto de apoyo de una línea (solo se pinta si es el actual)
  ctaLabel: string     // etiqueta literal del CTA
  done: boolean
  /** Ruta destino ya resuelta (incluye ids), lista para navigate(). */
  target: string
}

export interface AppOnboardingView {
  steps: AppOnboardingStepView[]   // siempre 8, en orden 1..8
  doneCount: number                // el «N» del contador «N de 8»
  /** Primer paso no completado; null = los 8 completados (estado final). */
  currentStep: AppOnboardingStepNumber | null
}

export function deriveAppOnboarding(input: AppOnboardingInput): AppOnboardingView
```

Condición de completado por paso (todas derivadas, ninguna persistida salvo el paso 2):

1. `anthropicConfigured && deepgramConfigured`.
2. `status.settings.promptsReviewedAt !== null` — único paso no derivable de los datos.
3. `status.hasInterviewTemplate && status.hasNoteTemplate`.
4. `status.hasCompany`.
5. `status.hasContact`.
6. `status.hasDiscovery`.
7. `status.hasInterviewGroup`.
8. `status.hasGroupedInterview`.

`doneCount` = número de pasos con `done === true` (cuenta los completados **fuera de orden**: con una empresa creada y sin claves, el contador es «1 de 8» y el paso 4 lleva check aunque el actual sea el 1). `currentStep` = el **primero** con `done === false` recorriendo 1→8; si no hay ninguno, `null` (estado «¡Todo listo!»).

La ocultación (`status.settings.hiddenAt !== null`) **no** se decide aquí: es responsabilidad del hook (§5), que devuelve estado `hidden` y evita renderizar. Mantener `deriveAppOnboarding` como función total sobre los 8 pasos la hace trivialmente testeable.

Los literales (etiqueta, texto de apoyo, etiqueta de CTA) viven en una tabla constante de este mismo módulo, no en el componente: así los ACs de literales y los de derivación se cubren con tests puros y el componente queda de pura presentación. Es una desviación consciente respecto a SPEC-058 (que los tiene en el componente), justificada porque aquí el `target` de 4 de los 8 pasos depende de los datos y ya obliga a resolver la fila entera en la lógica.

## 5. Destino de cada CTA (rutas verificadas en `src/renderer/src/App.tsx`)

| # | CTA | `target` | Verificación |
| --- | --- | --- | --- |
| 1 | Ir a Ajustes | `/settings?tab=api-keys` | `SettingsPage` acepta `tab=api-keys` (default). |
| 2 | Revisar prompts | `/settings?tab=custom-prompts` | valor válido del guard de `SettingsPage`. |
| 3 | Crear plantillas | `/settings?tab=interview-templates` si `!hasInterviewTemplate`; si no, `/settings?tab=note-templates` | ambos valores válidos del guard. |
| 4 | Crear empresa | `/companies` | ruta `companies` → `CompaniesPage`. |
| 5 | Añadir contacto | `/companies/${firstCompanyId}` | ruta `companies/:companyId` → `CompanyDetailPage`. |
| 6 | Crear discovery | `/discoveries` | ruta `discoveries` → `DiscoveriesPage`. |
| 7 | Crear grupo | `/discoveries/${firstDiscoveryId}` | ruta `discoveries/:id` → `DiscoveryDetailPage` (el parámetro del router se llama `:id`, la URL construida es idéntica a la de la spec). |
| 8 | Crear entrevista | `/discoveries/${firstGroup.discoveryId}/groups/${firstGroup.id}` | ruta `discoveries/:discoveryId/groups/:groupId` → `InterviewGroupDetailPage` (SPEC-046). |

Los 4 valores de `?tab=` de la spec (`api-keys`, `custom-prompts`, `interview-templates`, `note-templates`) **existen tal cual** en `SettingsPage.tsx` (`type SettingsTab` + guard del query param): no hay discrepancia. Aviso menor de copy: la pestaña `interview-templates` se rotula «Plantillas de preguntas» en la UI, no «Plantillas de entrevistas» (la spec no exige tocarlo; no se toca).

Fallback defensivo (los ids no pueden ser null cuando su paso es el actual, porque el paso previo estaría incompleto, pero el tipo lo admite): si `firstCompanyId` es null → `/companies`; si `firstDiscoveryId` es null → `/discoveries`; si `firstGroup` es null → `/discoveries`. Nunca construir una URL con `undefined` dentro.

La navegación es `useNavigate()` del router (`void navigate(target)`), no `<Link>`: el paso 2 tiene que ejecutar la mutación en el mismo gesto y conviene un único camino para los 8.

## 6. Hook `useAppOnboarding`

Fichero: **`src/renderer/src/hooks/useAppOnboarding.ts`**, patrón de `useCaptures` (máquina de estados discriminada, carga en el efecto de montaje, `setState` dentro del callback de la promesa para no violar `react-hooks/set-state-in-effect`).

- Estado: `{ status: 'loading' } | { status: 'error' } | { status: 'hidden' } | { status: 'ready'; view: AppOnboardingView }`.
- Carga: `Promise.all([window.api.db.getOnboardingStatus(), window.api.secrets.getStatus()])` en el montaje, con guarda `cancelled` (patrón `useSecrets`). Si **cualquiera** de los dos envelopes es `{ ok: false }` → `error` (y el banner no se renderiza). Si el envelope de estado trae `settings.hiddenAt !== null` → `hidden`.
- **No** se reutiliza el hook `useSecrets`: monta su propio estado, dispara un `toast.error` cuando `secrets:get-status` falla y aplica un fallback «cifrado no disponible» pensado para Ajustes. En la home eso sería ruido y contradiría el AC «el banner no se renderiza y el resto de la página funciona con normalidad». Se llama a `window.api.secrets.getStatus()` directamente y en silencio.
- `markPromptsReviewed()`: `await window.api.db.markOnboardingPromptsReviewed()`; si `ok`, actualiza el `settings` local (el paso 2 pasa a `done` sin recargar); si no, `toast.error(result.error.message)`. En ambos casos el componente navega después (el fallo de la marca no debe bloquear la navegación al destino).
- `hide()`: `await window.api.db.hideAppOnboarding()`; si `ok`, estado → `hidden` (el banner desaparece, sin Toast, por decisión de UX de la spec); si no, `toast.error`.
- Sin suscripción en vivo ni `reload` expuesto: la spec fija «derivación al montar la página» (volver de Ajustes re-monta `CapturesPage` y refresca los checks).

## 7. Componente `AppOnboardingBanner`

Fichero: **`src/renderer/src/components/captures/AppOnboardingBanner.tsx`** (vive con la página que lo hospeda; `components/interviews/` es de SPEC-058 y no se comparte nada). Sin props: consume `useAppOnboarding()` y se autogobierna; devuelve `null` en `loading`, `error` y `hidden` (AC: ni skeleton ni placeholder).

- Raíz: `Card` de `components/ui/card` con `data-testid="app-onboarding-banner"`.
- Cabecera: `Sparkles` (20px) + «Primeros pasos con Maurya» (heading) + «{doneCount} de 8» (muted) a la izquierda; a la derecha `Button variant="ghost"` con `X` (16px) + texto «Ocultar» y `data-testid="app-onboarding-hide"`. En mobile la fila cae a dos líneas (`flex-col md:flex-row`).
- Lista: `ul` con las 8 filas; cada `li` con `data-testid={'app-onboarding-step-' + step}` y `data-state` = `done` | `current` | `pending` (precedente SPEC-055-iter-2). Icono: `CheckCircle2` verde si `done`, `CircleDot` primary si es el actual, `Circle` muted si pendiente. Etiqueta muted en pendientes, normal en completados, **negrita** en el actual.
- Paso actual: bajo su etiqueta, el `support` (muted) y el `Button` (variant default, `data-testid="app-onboarding-action"`, `w-full md:w-auto`) con `ctaLabel`. Es el **único** primary del Card.
- `onClick` del CTA: si `currentStep === 2` → `await markPromptsReviewed()` y luego `void navigate(target)`; en el resto → `void navigate(target)` directo.
- Estado final (`currentStep === null`): los 8 checks y, en lugar del paso expandido, la línea «¡Todo listo! Ya tienes Maurya configurado y tu primera entrevista creada.» con `PartyPopper` (20px). Sin botón de acción; «Ocultar» sigue en la cabecera.
- Iconos Lucide usados: `Sparkles`, `CheckCircle2`, `Circle`, `CircleDot`, `X`, `PartyPopper` — todos disponibles en `lucide-react`, sin dependencias nuevas.
- Sin Toast propio, sin AlertDialog, sin Tooltip: ninguna acción del banner es destructiva ni deshabilitable.

## 8. Orden de implementación (pasos atómicos)

1. **Tipos**: `OnboardingSettings` + `AppOnboardingStatus` + las 3 firmas en `DbApi` (`src/renderer/src/types/domain.ts`). Typecheck en rojo esperado hasta el paso 3 (el preload debe implementar `DbApi` completo).
2. **Store**: campo opcional en `DbData` (`src/main/db/store.ts`), con comentario del patrón.
3. **Repositorio**: `getOnboardingSettings`, `markOnboardingPromptsReviewed`, `hideAppOnboarding`, `getAppOnboardingStatus` (`src/main/db/repository.ts`).
4. **IPC + preload**: registro con `handleDb` de los 3 canales y los 3 métodos del bridge. Aquí `npm run typecheck` debe volver a verde.
5. **Lógica pura**: `src/renderer/src/lib/appOnboarding.ts` con la tabla de literales y `deriveAppOnboarding`.
6. **Hook**: `src/renderer/src/hooks/useAppOnboarding.ts`.
7. **Componente**: `src/renderer/src/components/captures/AppOnboardingBanner.tsx`.
8. **Página**: insertar el banner en `CapturesPage.tsx` entre la cabecera y los chips de filtro.
9. Cierre: `npm run typecheck` + `npm run lint` + `npm run format`. Verificación end-to-end **manual** con `./start.sh` (no hay e2e en este proyecto, decisión humana 2026-07-03).

## 9. Riesgos, discrepancias y decisiones del implementador

- **Discrepancia de nombre de canal** (§2): la spec propone `db:onboarding-status:get`; el plan propone `db:onboarding:get-status` por coherencia con `db:<entidad>:<op>`. Si el implementador prefiere respetar la spec al pie de la letra, que lo haga de forma consistente en los tres canales; lo que **no** debe hacer es mezclar convenciones.
- **Ubicación exacta del banner**: la spec dice «entre la cabecera y el listado», pero entre ambos hay hoy la fila de chips de filtro (`Todas` / `Sin empresa`). Decisión del plan: el banner va **encima de los chips** (los chips son parte del listado, no de la cabecera). Es la única lectura que respeta «a todo el ancho del contenido» sin partir el bloque de filtros.
- **Orden de «primero»**: `listCompanies()` y `listDiscoveries()` devuelven el array del almacén **sin ordenar** (orden de inserción); `listInterviewGroups(discoveryId)` filtra el array global, también sin ordenar. El agregado usa `store.companies[0]`, `store.discoveries[0]` y `store.interviewGroups[0]`: mismo orden que el listado, tal como exige la spec. Ojo: **no existe** un listado global de grupos en el repositorio (`listInterviewGroups` es por discovery), así que «el primer grupo existente» se define como el primer elemento del array global `interviewGroups` — coherente con el orden por discovery y sin inventar un orden nuevo. Documentarlo en el docblock.
- **`secrets:get-status` y el toast de `useSecrets`** (§6): decisión de no reutilizar el hook. Si el implementador reutilizara `useSecrets`, un fallo de lectura de claves pintaría un Toast destructive en la home y, peor, el fallback `UNAVAILABLE_STATUS` (`configured: false`) haría que el banner mostrara el paso 1 como actual en vez de no renderizarse — incumpliendo el AC de fallo de derivación.
- **Retroceso derivado**: no hay nada que implementar (AC del borrado de la última empresa). Se cumple gratis porque nada se persiste y `CapturesPage` se re-monta al volver. El riesgo real sería cachear el estado a nivel de app o suscribirse a eventos: **no hacerlo**.
- **Paso 2 y fallo de escritura**: si `markOnboardingPromptsReviewed` falla, se navega igual y el paso sigue pendiente en la siguiente carga. Alternativa descartada: bloquear la navegación (el banner guía, no audita).
- **Usuarios existentes**: con datos previos y sin `promptsReviewedAt`, el paso 2 aparecerá como actual aunque todo lo demás esté hecho. Es el comportamiento especificado (derivación pura, sin heurísticas de primera ejecución); un click resuelve.
- **`schemaVersion` NO se toca**: bump = migración obligatoria + riesgo sobre `db.json` reales. El campo opcional pasa `isDbData` sin cambios (solo valida `schemaVersion` y las colecciones) y `persist` lo conserva por serialización completa. Verificar que `migrateV1ToV2` / `migrateV2ToV3` lo conservan: lo hacen, ambas parten de `{ ...v }`.
- **Robustez del singleton**: `getOnboardingSettings()` debe tolerar `onboardingSettings` no-objeto, o con campos que no sean `string | null` → `{ promptsReviewedAt: null, hiddenAt: null }`, sin lanzar (mismo contrato defensivo que `getAssistantSettings` / `getLinkedinMcpSettings`). Un almacén raro nunca debe dejar la home sin banner *ni* crashear.
- **Riesgo bajo pero real de flash**: el banner aparece un tick después del primer render de la página (dos promesas). Es lo especificado (sin skeleton); no añadir animaciones ni reservar espacio.

## 10. Qué NO se toca

- **Tests**: por la cláusula de alcance de la spec, el implementador **no** escribe ni adapta tests. En particular, `tests/helpers/mockApi.ts` necesitará los 3 métodos nuevos de `DbApi` (`getOnboardingStatus`, `markOnboardingPromptsReviewed`, `hideAppOnboarding`) para seguir siendo un mock completo del bridge — lo hace `/somo-qa-dev`, no el implementador. Nota: `npm run typecheck` **no** incluye `tests/` (`tsconfig.web.json` solo incluye `src/renderer/src/**`), así que la ausencia no rompe el typecheck del entregable.
- Nada de SPEC-058: `src/renderer/src/lib/onboardingStep.ts`, `components/interviews/InterviewOnboardingBanner.tsx`, `onboardingBridge` y los canales `db:interview:confirm-objectives` / `db:interview:hide-onboarding` quedan intactos. Los dos onboardings no comparten estado, tipos ni componentes.
- `SettingsPage.tsx`, `App.tsx` (no hay rutas nuevas), `Sidebar`, `TopBar`, hooks existentes (`useCaptures`, `useSecrets`, `useDiscoveries`, `useInterviewTemplates`, `useNoteTemplates`), pipeline de audio/transcripción, `llmService` y el catálogo de tareas de IA.
- El resto de `CapturesPage`: filtros, listado, `NewCaptureDialog`, `EditCaptureDialog`, `AssignCompanySheet` y el `AlertDialog` de borrado se quedan exactamente como están.
- `docs/prd.md` y `docs/checklist.md`: esta spec no traza a una fila del checklist, no hay `[x]` que marcar.
