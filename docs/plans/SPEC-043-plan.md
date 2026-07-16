# Plan de implementación — SPEC-043 Modelo de datos v3: empresas globales, grupos de entrevistas y migración automática

> Plan autorado por el subagente planner y validado por el orquestador.
> Fuente de verdad: `specs/SPEC-043-modelo-datos-v3.md`. Cambio de capa de datos (schemaVersion 2→3)
> + adaptación transicional mínima del renderer. **Sin tests** (los adapta QA después;
> `npm run typecheck` solo cubre `src/`, verificado). Sin UI nueva.

Convención transversal: patrón envelope `DbResult` + helper `handleDb` (`src/main/db/ipc.ts`), bridge plano en preload, `mutate()` transaccional y escritura atómica intactos.

---

## 1. `src/renderer/src/types/domain.ts` — contrato de entidades e inputs

### 1.1 Entidades

- **`Company`**: eliminar el campo `discoveryId: string`. Resto intacto (`id`, `name`, `website`, `linkedinUrl`, `context?`, timestamps). Actualizar el comentario JSDoc: empresa global (SPEC-043), reutilizable en cualquier discovery.
- **`Discovery`**: añadir `objectives: string | null` (campo REQUERIDO, texto libre; la migración lo backfillea a `null`).
- **Nueva entidad `InterviewGroup`** (colocarla tras `Discovery`/`Company`, antes de `Interview`):

```ts
export interface InterviewGroup {
  id: string
  discoveryId: string
  name: string
  objective: string | null
  interviewTemplateId: string | null
  noteTemplateId: string | null
  createdAt: string
  updatedAt: string
}
```

- **`Interview`**: eliminar `contactId: string | null`; añadir:
  - `contactIds: string[]` — requerido, orden dado por el caller, ⊆ contactos de `companyId`, sin duplicados, no vacío ⇒ `companyId ≠ null`.
  - `interviewGroupId: string | null` — requerido nullable; ≠ null ⇒ grupo existente del MISMO discovery.
  - Actualizar el JSDoc de `companyId`: ya NO existe la invariante «empresa ∈ discovery» (SPEC-020 derogada en este punto).

### 1.2 Inputs / patches

- **`CreateDiscoveryInput`**: añadir `objectives?: string | null`.
- **`UpdateDiscoveryPatch`**: añadir `objectives?: string | null`.
- **`CreateCompanyInput`**: eliminar `discoveryId: string`. Queda `{ name, website?, linkedinUrl?, context? }`.
- **`CreateInterviewInput`**: eliminar `contactId?: string | null`; añadir `contactIds?: string[]` (ausente → `[]`) y `interviewGroupId?: string | null` (ausente → `null`).
- **`UpdateInterviewPatch`**: eliminar `contactId?: string | null`; añadir `contactIds?: string[]`. **NO** añadir `interviewGroupId` al patch (la spec lo excluye: asignación de grupo solo en create).
- **Nuevos** (junto a los demás inputs):

```ts
export interface CreateInterviewGroupInput {
  discoveryId: string
  name: string
  objective?: string | null
  interviewTemplateId?: string | null
  noteTemplateId?: string | null
}

export interface UpdateInterviewGroupPatch {
  name?: string
  objective?: string | null
  interviewTemplateId?: string | null
  noteTemplateId?: string | null
}
```

### 1.3 `DbApi`

- Cambiar `listCompanies: (discoveryId: string) => ...` por `listCompanies: () => Promise<DbResult<Company[]>>`.
- Añadir la familia de grupos (tras el bloque de interview-templates, antes de interviews):

```ts
createInterviewGroup: (input: CreateInterviewGroupInput) => Promise<DbResult<InterviewGroup>>
listInterviewGroups: (discoveryId: string) => Promise<DbResult<InterviewGroup[]>>
getInterviewGroup: (id: string) => Promise<DbResult<InterviewGroup>>
updateInterviewGroup: (id: string, patch: UpdateInterviewGroupPatch) => Promise<DbResult<InterviewGroup>>
deleteInterviewGroup: (id: string) => Promise<DbResult<null>>
```

---

## 2. `src/renderer/src/types/captures.ts` — listado de capturas y asignación

- **`CaptureListItem`**: sustituir `contactName: string | null` por `contactNames: string[]` (nombres resueltos en el orden de `contactIds`; los ids irresolubles se OMITEN — defensivo, un dato roto nunca rompe el listado). Actualizar JSDoc.
- **`AssignCompanyInput`** y **`AssignNewCompanyInput`/`AssignNewContactInput`**: SIN cambios de forma (decisión asumida: un contacto opcional). Actualizar el JSDoc de `AssignCompanyInput`: `companyId` ahora es cualquier empresa del SISTEMA (ya no «del discovery de la captura»); `newCompany` crea la empresa GLOBAL.
- **`AssignCompanyResult`**: sin cambios (`contact: Contact | null` se mantiene; la entrevista resultante lleva `contactIds = [contacto.id]` o `[]`).

---

## 3. `src/renderer/src/types/search.ts` — hits de búsqueda

- **`SearchCompanyHit`**: eliminar `discoveryName: string`. CONSERVAR `discoveryId: string`, redefinido en JSDoc como *ancla de navegación transicional* (la ruta anidada `/discoveries/:discoveryId/companies/:companyId` sigue siendo la única de detalle de empresa hasta H11.2): se resuelve en main (ver §6) y ya no procede de `company.discoveryId`.
- **`SearchContactHit`**: conservar la forma (`companyDiscoveryId` pasa a ser la misma ancla transicional). Actualizar JSDoc.
- **`SearchInterviewHit`**: sin cambios (`interview.discoveryId` sigue existiendo).

---

## 4. `src/main/db/store.ts` — schema v3 y migraciones

### 4.1 Constantes y forma

- `SCHEMA_VERSION = 3` (comentario: v3 = SPEC-043, empresas globales + grupos + N contactos).
- `DbData`: añadir `interviewGroups: InterviewGroup[]` (colección REQUERIDA, tras `interviewTemplates`). Importar el tipo `InterviewGroup` de domain.
- `emptyData()`: añadir `interviewGroups: []`.
- Importar `randomUUID` de `'crypto'` (para los grupos «General» de la migración).

### 4.2 `isDbData` (acepta v2 sin `interviewGroups`)

Mantener `COLLECTIONS` con las 7 colecciones actuales (base común v1/v2/v3) y añadir la validación por versión al final:

```ts
if (record.schemaVersion >= 3 && !Array.isArray(record.interviewGroups)) {
  return false
}
return true
```

(Para v1/v2 el predicado `value is DbData` es nominal — igual que hoy, donde el v1 parseado se trata como `DbData` antes de migrar; los casts legados se hacen explícitos abajo.)

### 4.3 Tipos legados (locales al módulo, no exportar a domain)

```ts
/** Company v1/v2: pertenecía a un discovery. */
interface CompanyV2 extends Company {
  discoveryId: string
}
/** Interview v1/v2: contacto único, sin contactIds ni interviewGroupId. */
interface InterviewV2 extends Omit<Interview, 'contactIds' | 'interviewGroupId'> {
  contactId: string | null
}
/** Discovery v1/v2: sin objectives. */
type DiscoveryV2 = Omit<Discovery, 'objectives'>
/** Forma v1/v2 del almacén (sin interviewGroups). */
interface DbDataV2 extends Omit<DbData, 'discoveries' | 'companies' | 'interviews' | 'interviewGroups'> {
  discoveries: DiscoveryV2[]
  companies: CompanyV2[]
  interviews: InterviewV2[]
}
```

### 4.4 Retipar `migrateV1ToV2`

Cambiar la firma a `function migrateV1ToV2(v1: DbDataV2): DbDataV2` — la lógica NO cambia (backfill de `discoveryId` desde `company.discoveryId`, drop de entrevistas huérfanas + sus notas). Compila porque `CompanyV2` conserva `discoveryId` e `InterviewV2` conserva la forma v2.

### 4.5 Nueva `migrateV2ToV3`

```ts
/**
 * Migración v2 → v3 (SPEC-043): empresas globales (drop de discoveryId, sin
 * deduplicar), Discovery.objectives = null, Interview.contactId → contactIds
 * ([id] o []), y un grupo «General» por discovery CON entrevistas al que se
 * asignan todas las entrevistas del discovery. Settings y campos opcionales
 * (aiUsage, objectiveResults, ...) se conservan intactos por spread.
 */
function migrateV2ToV3(v2: DbDataV2): DbData {
  const now = new Date().toISOString()
  const discoveryIdsWithInterviews = new Set(v2.interviews.map((interview) => interview.discoveryId))
  const interviewGroups: InterviewGroup[] = []
  const groupIdByDiscovery = new Map<string, string>()
  for (const discovery of v2.discoveries) {
    if (!discoveryIdsWithInterviews.has(discovery.id)) {
      continue // decisión asumida: sin entrevistas no hay grupo «General»
    }
    const id = randomUUID()
    groupIdByDiscovery.set(discovery.id, id)
    interviewGroups.push({
      id,
      discoveryId: discovery.id,
      name: 'General',
      objective: null,
      interviewTemplateId: null,
      noteTemplateId: null,
      createdAt: now,
      updatedAt: now
    })
  }
  return {
    ...v2,
    schemaVersion: 3,
    discoveries: v2.discoveries.map((discovery) => ({ ...discovery, objectives: null })),
    companies: v2.companies.map(({ discoveryId: _discoveryId, ...company }) => company),
    interviews: v2.interviews.map(({ contactId, ...interview }) => ({
      ...interview,
      contactIds: contactId !== null && contactId !== undefined ? [contactId] : [],
      interviewGroupId: groupIdByDiscovery.get(interview.discoveryId) ?? null
    })),
    interviewGroups
  }
}
```

Notas: los rest-spreads eliminan literalmente `discoveryId`/`contactId` del JSON persistido (AC «sin campo contactId»); `_discoveryId` con prefijo `_` pasa `noUnusedLocals`. Los campos opcionales de entrevista (`aiUsage`, `objectiveResults`, `objectiveOverrides`, `questionOutcomes`) y los settings viajan intactos en los spreads.

### 4.6 `initStore` — encadenado y persistencia atómica

Sustituir el bloque de migración actual por:

```ts
if (parsed.schemaVersion === 1) {
  data = migrateV2ToV3(migrateV1ToV2(parsed as unknown as DbDataV2))
  persist(data)
} else if (parsed.schemaVersion === 2) {
  data = migrateV2ToV3(parsed as unknown as DbDataV2)
  persist(data)
} else {
  data = parsed // v3: se carga tal cual, sin re-migrar ni reescribir grupos
}
```

Todo lo demás intacto: camino `.corrupt-<ts>` + `emptyData()` + `initError` consultable por `getStatus()` (si la migración lanza, cae en ese camino, comportamiento SPEC-006). `persist` sigue siendo `writeFileAtomicSync`.

---

## 5. `src/main/db/repository.ts` — CRUD, invariantes y cascadas v3

### 5.1 Nuevos helpers (junto a `assertReference`)

```ts
/**
 * Invariante v3 de contactIds: sin duplicados (validation), y si no está
 * vacío exige companyId ≠ null (reference) y que TODOS los ids sean contactos
 * existentes de esa empresa (reference).
 */
function assertInterviewContacts(draft: DbData, companyId: string | null, contactIds: string[]): void {
  const seen = new Set<string>()
  for (const contactId of contactIds) {
    if (seen.has(contactId)) {
      throw validationError('La lista de contactos contiene ids duplicados')
    }
    seen.add(contactId)
  }
  if (contactIds.length === 0) {
    return
  }
  if (companyId === null) {
    throw referenceError('No se pueden asignar contactos a una entrevista sin empresa')
  }
  for (const contactId of contactIds) {
    const contact = draft.contacts.find((candidate) => candidate.id === contactId)
    if (contact === undefined || contact.companyId !== companyId) {
      throw referenceError(`El contacto ${contactId} no existe o no pertenece a la empresa de la entrevista`)
    }
  }
}

/** Invariante v3 de grupo: existe y pertenece al discovery de la entrevista. */
function assertInterviewGroup(draft: DbData, discoveryId: string, interviewGroupId: string): void {
  const group = draft.interviewGroups.find((candidate) => candidate.id === interviewGroupId)
  if (group === undefined || group.discoveryId !== discoveryId) {
    throw referenceError('El grupo no existe o no pertenece al discovery de la entrevista')
  }
}

/** Valida las referencias opcionales a templates de un grupo (reference si no existen). */
function assertGroupTemplateRefs(
  draft: DbData,
  interviewTemplateId: string | null | undefined,
  noteTemplateId: string | null | undefined
): void {
  if (interviewTemplateId !== undefined && interviewTemplateId !== null) {
    assertReference(draft.interviewTemplates, interviewTemplateId, 'template de entrevista')
  }
  if (noteTemplateId !== undefined && noteTemplateId !== null) {
    assertReference(draft.noteTemplates, noteTemplateId, 'note-template')
  }
}
```

### 5.2 Cascadas

- **`deleteCompaniesCascade`** — nueva semántica (empresa → contactos CASCADE + entrevistas SET NULL). Reemplazar el cuerpo:

```ts
/** Cascada v3: borra empresas con sus contactos; las entrevistas SOBREVIVEN con companyId null y contactIds vacío. */
function deleteCompaniesCascade(draft: DbData, companyIds: Set<string>): void {
  draft.contacts = draft.contacts.filter((contact) => !companyIds.has(contact.companyId))
  for (const interview of draft.interviews) {
    if (interview.companyId !== null && companyIds.has(interview.companyId)) {
      interview.companyId = null
      interview.contactIds = []
    }
  }
  draft.companies = draft.companies.filter((company) => !companyIds.has(company.id))
}
```

  NO tocar `updatedAt` de las entrevistas (patrón de los SET NULL existentes: `deleteContact`, `deleteInterviewTemplate`). Se conservan `scriptMarkdown`, `objectives`, `wavPath`, `transcriptPath` y la nota (no se toca `notes`).
- **`deleteInterviewsCascade`**: sin cambios.
- **`deleteDiscovery`**: eliminar el bloque que borraba las empresas del discovery. Nueva secuencia: (1) `findOrThrow` del discovery; (2) `deleteInterviewsCascade` con las entrevistas de `discoveryId === id` (igual que hoy: borra también sus notas); (3) `draft.interviewGroups = draft.interviewGroups.filter((group) => group.discoveryId !== id)`; (4) filtrar el discovery. Ninguna empresa ni contacto cae.
- **`deleteContact`**: sustituir el `if (interview.contactId === id)` por retirada del id en todas las entrevistas:

```ts
for (const interview of draft.interviews) {
  if (interview.contactIds.includes(id)) {
    interview.contactIds = interview.contactIds.filter((contactId) => contactId !== id)
  }
}
```

- **`deleteInterviewTemplate`**: además del SET NULL existente en `interview.templateId`, añadir SET NULL en grupos: `for (const group of draft.interviewGroups) { if (group.interviewTemplateId === id) group.interviewTemplateId = null }`.
- **`deleteNoteTemplate`**: añadir SET NULL: `for (const group of draft.interviewGroups) { if (group.noteTemplateId === id) group.noteTemplateId = null }` antes de filtrar el template.

### 5.3 Discovery

- **`createDiscovery`**: añadir `objectives: input.objectives ?? null` al objeto creado.
- **`updateDiscovery`**: añadir `if (patch.objectives !== undefined) { discovery.objectives = patch.objectives }` (texto o null; `touched` ya garantiza el avance estricto de `updatedAt`).

### 5.4 Company

- **`createCompany`**: eliminar `assertReference(draft.discoveries, ...)` y el campo `discoveryId` del objeto. `assertName` intacto (AC de nombre vacío → validation, cero escrituras).
- **`listCompanies`**: firma `export function listCompanies(): Company[]` → `return read((store) => store.companies)` (todas las del sistema).
- **`deleteCompany`**: sin cambios de código (usa la cascada redefinida). `findOrThrow` ya cubre el AC not-found.

### 5.5 InterviewGroup — CRUD nuevo (sección nueva entre InterviewTemplate e Interview)

```ts
export function createInterviewGroup(input: CreateInterviewGroupInput): InterviewGroup {
  assertName(input.name, 'grupo de entrevistas')
  return mutate((draft) => {
    assertReference(draft.discoveries, input.discoveryId, 'discovery')
    assertGroupTemplateRefs(draft, input.interviewTemplateId, input.noteTemplateId)
    const now = nowIso()
    const group: InterviewGroup = {
      id: randomUUID(),
      discoveryId: input.discoveryId,
      name: input.name,
      objective: input.objective ?? null,
      interviewTemplateId: input.interviewTemplateId ?? null,
      noteTemplateId: input.noteTemplateId ?? null,
      createdAt: now,
      updatedAt: now
    }
    draft.interviewGroups.push(group)
    return group
  })
}

export function listInterviewGroups(discoveryId: string): InterviewGroup[] {
  return read((store) => store.interviewGroups.filter((group) => group.discoveryId === discoveryId))
}

export function getInterviewGroup(id: string): InterviewGroup {
  return read((store) => findOrThrow(store.interviewGroups, id, 'grupo de entrevistas'))
}

export function updateInterviewGroup(id: string, patch: UpdateInterviewGroupPatch): InterviewGroup {
  if (patch.name !== undefined) {
    assertName(patch.name, 'grupo de entrevistas')
  }
  return mutate((draft) => {
    const group = findOrThrow(draft.interviewGroups, id, 'grupo de entrevistas')
    assertGroupTemplateRefs(draft, patch.interviewTemplateId, patch.noteTemplateId)
    if (patch.name !== undefined) group.name = patch.name
    if (patch.objective !== undefined) group.objective = patch.objective
    if (patch.interviewTemplateId !== undefined) group.interviewTemplateId = patch.interviewTemplateId
    if (patch.noteTemplateId !== undefined) group.noteTemplateId = patch.noteTemplateId
    group.updatedAt = touched(group.updatedAt)
    return group
  })
}

/** Borra el grupo; sus entrevistas SOBREVIVEN con interviewGroupId null (SET NULL). */
export function deleteInterviewGroup(id: string): null {
  return mutate((draft) => {
    findOrThrow(draft.interviewGroups, id, 'grupo de entrevistas')
    for (const interview of draft.interviews) {
      if (interview.interviewGroupId === id) {
        interview.interviewGroupId = null
      }
    }
    draft.interviewGroups = draft.interviewGroups.filter((group) => group.id !== id)
    return null
  })
}
```

Importar `CreateInterviewGroupInput`, `UpdateInterviewGroupPatch`, `InterviewGroup` en el bloque de imports type-only.

### 5.6 Interview

- **`createInterview`**:
  - ELIMINAR la invariante «empresa ∈ discovery» (el `if (company.discoveryId !== input.discoveryId)`); con `companyId ≠ null` basta `assertReference(draft.companies, companyId, 'empresa')`.
  - Sustituir el bloque de `contactId` por: `const contactIds = input.contactIds ?? []` + `assertInterviewContacts(draft, companyId, contactIds)`.
  - Añadir: `const interviewGroupId = input.interviewGroupId ?? null; if (interviewGroupId !== null) { assertInterviewGroup(draft, input.discoveryId, interviewGroupId) }`.
  - Objeto creado: `contactIds`, `interviewGroupId` (en lugar de `contactId`).
- **`updateInterview`**: sustituir el bloque de validación/asignación de `patch.contactId` por:

```ts
if (patch.contactIds !== undefined) {
  assertInterviewContacts(draft, interview.companyId, patch.contactIds)
}
// ... y en las asignaciones:
if (patch.contactIds !== undefined) {
  interview.contactIds = patch.contactIds
}
```

  (Sin `interviewGroupId` en el patch.) Resto intacto, incluida la invalidación de `objectiveResults`/`objectiveOverrides` al cambiar `objectives`.
- **`listAllInterviews`**: sustituir la resolución de `contactName` por:

```ts
contactNames: interview.contactIds
  .map((contactId) => contactNames.get(contactId))
  .filter((name): name is string => name !== undefined),
```

  (nombres en el orden de `contactIds`; ids rotos se omiten — defensivo). Discovery/empresa/template siguen resolviendo a `''`/null como hoy.
- **`assignInterviewCompany`**:
  - Rama `newCompany`: eliminar `assertReference(draft.discoveries, interview.discoveryId, ...)` y el campo `discoveryId` del objeto empresa (empresa GLOBAL).
  - Rama `companyId` existente: eliminar la invariante `company.discoveryId !== interview.discoveryId` (se acepta cualquier empresa del sistema).
  - Asignación final: `interview.companyId = company.id`; sustituir `interview.contactId = ...` por `interview.contactIds = contact !== null ? [contact.id] : []`. La validación «contacto ∈ empresa elegida» se mantiene tal cual. Sigue siendo UN solo `mutate` (atomicidad del AC de empresa nueva).
- **`deleteInterview`**, `setInterview*`, `addInterviewAiUsage`: sin cambios.

---

## 6. `src/main/db/search.ts` — búsqueda con empresas globales

- **Hits de empresa**: `company.discoveryId` ya no existe. Resolución del ancla transicional de navegación (documentarla en comentario como transicional hasta H11.2):

```ts
// Ancla transicional: la ruta de detalle de empresa sigue anidada bajo un
// discovery. Se usa el discovery de la primera entrevista de la empresa y,
// si no tiene, el primer discovery del sistema; sin ancla, el hit se omite
// (mismo patrón defensivo que la omisión actual por referencia rota).
const anchorDiscoveryByCompany = new Map<string, string>()
for (const interview of store.interviews) {
  if (interview.companyId !== null && !anchorDiscoveryByCompany.has(interview.companyId)) {
    anchorDiscoveryByCompany.set(interview.companyId, interview.discoveryId)
  }
}
const fallbackDiscoveryId = store.discoveries[0]?.id
const anchorFor = (companyId: string): string | undefined =>
  anchorDiscoveryByCompany.get(companyId) ?? fallbackDiscoveryId
```

- Bucle de empresas: eliminar el lookup a `discoveriesById` y `discoveryName`; el hit pasa a `{ id, discoveryId: anchor, name }` con `const anchor = anchorFor(company.id); if (anchor === undefined) continue`.
- Bucle de contactos: `companyDiscoveryId` pasa a `anchorFor(company.id)` con la misma omisión defensiva si es `undefined`. El resto (`companyName`, etc.) intacto.
- Bucle de entrevistas: sin cambios. `discoveriesById` puede quedar sin usos → eliminarlo si ya no se usa (`noUnusedLocals`); el `Map` de `companiesById` se conserva (contactos y entrevistas lo usan).

---

## 7. `src/main/db/ipc.ts` — canales nuevos

En `registerDbIpcHandlers()`, tras el bloque `db:interview-template:*`:

```ts
// Grupos de entrevistas (SPEC-043): CRUD con envelope DbResult.
handleDb('db:interview-group:create', repository.createInterviewGroup)
handleDb('db:interview-group:list', repository.listInterviewGroups)
handleDb('db:interview-group:get', repository.getInterviewGroup)
handleDb('db:interview-group:update', repository.updateInterviewGroup)
handleDb('db:interview-group:delete', repository.deleteInterviewGroup)
```

`db:company:list` no cambia de registro (el handler ahora ignora argumentos porque `listCompanies` ya no los declara). Nada más cambia.

---

## 8. `src/preload/index.ts` — bridge

En el objeto `db`:

- `listCompanies: () => ipcRenderer.invoke('db:company:list')` (sin parámetro).
- Añadir (tras los métodos de interview-template):

```ts
createInterviewGroup: (input) => ipcRenderer.invoke('db:interview-group:create', input),
listInterviewGroups: (discoveryId) => ipcRenderer.invoke('db:interview-group:list', discoveryId),
getInterviewGroup: (id) => ipcRenderer.invoke('db:interview-group:get', id),
updateInterviewGroup: (id, patch) => ipcRenderer.invoke('db:interview-group:update', id, patch),
deleteInterviewGroup: (id) => ipcRenderer.invoke('db:interview-group:delete', id),
```

El tipado lo garantiza `const db: DbApi` (typecheck de coherencia del contrato).

---

## 9. `src/main/llmService.ts` y `src/main/noteService.ts` — primer contacto

Adaptación mecánica (la personalización N contactos es H11.4):

- `src/main/llmService.ts` (~línea 408):

```ts
const firstContactId = interview.contactIds[0] ?? null
const contact = firstContactId !== null ? repository.getContact(firstContactId) : null
```

- `src/main/noteService.ts` (~línea 324): mismo cambio.
- `buildUserPrompt` de ambos servicios: sin cambios (siguen recibiendo `Contact | null`; el camino degradado «Sin contacto asignado» se conserva).
- `src/main/assistantService.ts`: **sin cambios** (verificado: solo lee `objectives`, `scriptMarkdown` y `aiUsage`).
- `src/main/contextService.ts`: sin cambios (su `contactId` es el parámetro de `generateContactContext`, no el campo de Interview).

---

## 10–21. Renderer transicional

### 10. `src/renderer/src/hooks/useCompanies.ts`

- Firma: `export function useCompanies(): UseCompaniesResult` (eliminar el parámetro `discoveryId`).
- Efecto de carga: `window.api.db.listCompanies()` con deps `[]`.
- `createCompany`: `window.api.db.createCompany(values)` (sin `discoveryId`), deps `[]`.
- Actualizar JSDoc: empresas GLOBALES (SPEC-043 transicional; la página bajo el discovery lista todas).

### 11. `src/renderer/src/pages/DiscoveryDetailPage.tsx`

- Cambiar `useCompanies(id ?? '')` por `useCompanies()`. Nada más (los links a `/discoveries/${id}/companies/${company.id}` siguen usando el `id` de la URL como ancla de la ruta anidada).

### 12. `src/renderer/src/hooks/useInterviews.ts`

- `InterviewFormValues` se mantiene con `contactId: string | null` (valor de UI del selector único transicional).
- `createInterview`: construir el input explícitamente (no spread, porque el shape cambió):

```ts
const result = await window.api.db.createInterview({
  discoveryId,
  companyId,
  title: values.title,
  contactIds: values.contactId !== null ? [values.contactId] : [],
  templateId: values.templateId
})
```

- `updateInterview`: patch `{ title, contactIds: values.contactId !== null ? [values.contactId] : [], templateId }`.

### 13. `src/renderer/src/hooks/useCaptures.ts`

- `EditCaptureValues` conserva `contactId?: string | null` (undefined = no tocar).
- `updateCapture`: sustituir `...(values.contactId !== undefined ? { contactId: values.contactId } : {})` por `...(values.contactId !== undefined ? { contactIds: values.contactId !== null ? [values.contactId] : [] } : {})`.
- `createCapture`: sin cambios (no envía contactos).

### 14. `src/renderer/src/components/interviews/InterviewFormDialog.tsx`

- `const [contactId, setContactId] = useState(interview?.contactIds[0] ?? NONE)`. Resto intacto (el submit sigue emitiendo `InterviewFormValues.contactId`, que el hook mapea).

### 15. `src/renderer/src/components/captures/EditCaptureDialog.tsx`

- `const [contactId, setContactId] = useState(interview.contactIds[0] ?? NONE)`. Resto intacto.

### 16. `src/renderer/src/components/captures/AssignCompanySheet.tsx`

- Efecto de carga de empresas: `window.api.db.listCompanies()` con deps `[]` (todas las empresas del sistema). Comentario: «SPEC-043: la asignación acepta cualquier empresa, ya no solo las del discovery».
- Nada más cambia: el input `AssignCompanyInput` conserva su forma; el selector sigue siendo de UN contacto; textos del Sheet intactos (los reemplaza H11).

### 17. `src/renderer/src/pages/CompanyDetailPage.tsx`

- `interviewRefsLabel`: sustituir la resolución de `contactName` por la de TODOS los contactos:

```ts
const contactLabel = interview.contactIds
  .map((contactId) => contacts.find((contact) => contact.id === contactId)?.name)
  .filter((name): name is string => name !== undefined)
  .join(', ')
return [contactLabel === '' ? null : contactLabel, templateName]
  .filter((name): name is string => name !== null)
  .join(' · ')
```

- El resto de la página no cambia (`useInterviews(discoveryId ?? '', companyId ?? '')` sigue válido: la creación de entrevistas sigue anclada al discovery de la URL, que en v3 solo debe existir).

### 18. `src/renderer/src/pages/InterviewDetailPage.tsx`

- `contactLabel`: resolver TODOS los contactos, join por ", ", fallback 'Sin contacto':

```ts
const contactLabel = (interview: Interview): string => {
  if (contactsState.status === 'ready') {
    const names = interview.contactIds
      .map((contactId) => contactsState.contacts.find((item) => item.id === contactId)?.name)
      .filter((name): name is string => name !== undefined)
    if (names.length > 0) {
      return names.join(', ')
    }
  }
  return 'Sin contacto'
}
```

### 19. `src/renderer/src/pages/CaptureDetailPage.tsx`

- Estado ready: sustituir `contact: Contact | null` por `contacts: Contact[]` (en `CaptureDetailState` y `CaptureDetailContentProps`).
- Carga: sustituir la promesa de contacto único por `Promise.all(interview.contactIds.map((contactId) => window.api.db.getContact(contactId)))` y `contacts: contactResults.filter((r) => r.ok).map((r) => r.data)` (referencia rota → se omite; degrada a «Sin contacto», nunca error state).
- `handleAssigned`: `contacts: result.contact !== null ? [result.contact] : []`.
- Cabecera: `{contacts.length > 0 ? contacts.map((c) => c.name).join(', ') : 'Sin contacto'}`.

### 20. `src/renderer/src/pages/CapturesPage.tsx`

- `captureRefsLabel`: sustituir `item.contactName` por `item.contactNames.length > 0 ? item.contactNames.join(', ') : null` dentro del filter/join existente.

### 21. `src/renderer/src/components/search/GlobalSearchDialog.tsx`

- Grupo Empresas: eliminar el `<span>` de contexto `{hit.discoveryName}`. La navegación `/discoveries/${hit.discoveryId}/companies/${hit.id}` se conserva (ancla transicional resuelta en main, §6). Contactos y entrevistas: sin cambios.

---

## Invariantes a preservar

1. **Envelope IPC**: ningún canal `db:*` rechaza la promesa; todo error viaja como `{ ok: false, error }` vía `handleDb`. Los nuevos canales de grupos usan exactamente el mismo helper.
2. **Transaccionalidad**: toda escritura pasa por `mutate()` (structuredClone + persist solo si no lanza). Validación fallida ⇒ CERO escrituras. `assignInterviewCompany` sigue siendo UN solo `mutate`.
3. **Escritura atómica**: `persist` = `writeFileAtomicSync`, también en las migraciones de `initStore`.
4. **Robustez de arranque**: archivo corrupto/estructura inválida (o migración que lanza) ⇒ `.corrupt-<ts>` + almacén v3 vacío + `initError` consultable con `getStatus()`; nunca crashea.
5. **Invariantes v3 del repositorio**: `contactIds` sin duplicados (validation) ⊆ contactos de `companyId` (reference), no vacío ⇒ `companyId ≠ null` (reference); `interviewGroupId ≠ null` ⇒ grupo existente del mismo discovery (reference); DEROGADA la invariante empresa∈discovery.
6. **Cascadas v3**: discovery → entrevistas (+notas) + grupos, NUNCA empresas/contactos; empresa → contactos (CASCADE) + entrevistas (SET NULL conservando guión/objetivos/WAV/transcript/nota); contacto → retirada del id de `contactIds`; grupo → `interviewGroupId` null; template de entrevista → `Interview.templateId` null + `InterviewGroup.interviewTemplateId` null; note-template → `InterviewGroup.noteTemplateId` null. Los SET NULL no tocan `updatedAt` (patrón existente).
7. **`updatedAt` estrictamente creciente** en updates de usuario vía `touched()` (aplica a discovery `objectives` y a grupos).
8. **Migración sin pérdida**: settings singleton y campos opcionales de entrevista intactos; empresas sin deduplicar; grupo «General» SOLO en discoveries con ≥1 entrevista; v3 se carga tal cual (idempotencia: reiniciar no crea grupos nuevos).
9. **Ningún flujo de usuario desaparece**: alta/listado de empresas desde el discovery, Dialog de entrevista y Sheet de asignación con UN contacto (persistido como `contactIds` de 0/1), listado de capturas, detalle de captura/entrevista, búsqueda global. Servicios LLM degradables sin empresa/contacto intactos (usan el primer contacto).
10. **NO tocar `tests/`** ni `docs/prd.md`/`docs/checklist.md`. La validación del implementador es `npm run typecheck` (solo src) + `npm run lint`; los tests rotos son esperados y los adapta QA.

## Orden de implementación

1. **Tipos** — `domain.ts` (§1), `captures.ts` (§2), `search.ts` (§3).
2. **Store** — `store.ts` (§4).
3. **Repositorio** — `repository.ts` (§5).
4. **Búsqueda** — `search.ts` de main (§6).
5. **IPC** — `ipc.ts` (§7).
6. **Preload** — `index.ts` (§8).
7. **Servicios LLM** — `llmService.ts` y `noteService.ts` (§9).
8. Checkpoint: typecheck de node VERDE aquí.
9. **Hooks** — `useCompanies`, `useInterviews`, `useCaptures` (§10, §12, §13).
10. **Dialogs** — `InterviewFormDialog`, `EditCaptureDialog`, `AssignCompanySheet` (§14–16).
11. **Páginas** — `DiscoveryDetailPage`, `CompanyDetailPage`, `InterviewDetailPage`, `CaptureDetailPage`, `CapturesPage` (§11, §17–20).
12. **Búsqueda UI** — `GlobalSearchDialog` (§21).
13. Checkpoint final: `npm run typecheck` (node + web) y `npm run lint` en verde.
