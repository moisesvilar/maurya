# Plan de implementación — SPEC-006: persistencia local del dominio

> Generado por subagente Plan y aprobado por el orquestador (2026-07-03). Contrato: specs/SPEC-006-persistencia-local.md.

## 1. Motor: JSON transaccional propio (better-sqlite3 DESCARTADO)
Conflicto ABI estructural: dev corre main en Electron (módulo nativo compilado para Electron vía postinstall) pero los tests de QA corren en Vitest/Node → el mismo .node no sirve para ambos (ERR_DLOPEN_FAILED). Volumen decenas-cientos de filas; consulta más compleja de H3 = filter por companyId. Criterio de la spec: cero fricción de build.
Almacén: **archivo único** `userData/maurya-data/db.json` `{schemaVersion:1, discoveries, companies, contacts, interviewTemplates, interviews, noteTemplates, notes}` — cascadas multi-colección = una transacción atómica natural. Escritura atómica: tmp + fsync + renameSync (APFS). Serialización: operaciones síncronas (ipcMain.handle secuencial) → escrituras encadenadas sin solape por construcción.

## 2. Archivos
Nuevos: `src/renderer/src/types/domain.ts` (entidades, inputs, patches, DbError{kind: validation|not-found|reference|storage}, DbResult<T>, DbStatus, DbApi — DOM-free como audio.ts), `src/main/db/{store,errors,repository,ipc}.ts`. Editar: `src/main/ipc.ts` (1 línea registerDbIpcHandlers), `src/preload/index.ts` + `index.d.ts` (api.db = MauryaApi & {db: DbApi}). audio.ts intacto.

## 3. Bridge
~29 canales `db:<entidad>:<op>` + `db:get-status` (pull, para el error de init). **api.db plano** (`createCompany`, no `company.create`) — desviación documentada de la nota de la spec, para mantener el contextBridge trivial. Envelope `DbResult` SIEMPRE (nunca rechazar la promesa: Electron pierde `kind` al serializar rejections).

## 4. ACs
CRUD → helpers create/update con uuid+ISO en main; arrays anidados preservan orden. Supervivencia → persist síncrono + load en init. Validación → name.trim() vacío = validation ANTES de mutar; FK inexistente = reference; not-found en update/delete; segunda nota por entrevista = validation. mutate() aplica sobre structuredClone y solo publica/persiste si no lanza → "no persiste nada" literal. Cascadas en una sola mutate: discovery→companies→contacts+interviews→notes; deleteInterviewTemplate → SET NULL en interviews.templateId (ídem deleteContact→contactId). Corrupción → rename a `.corrupt-<ts>` + almacén nuevo + initError consultable; jamás crash. Empty → []. Emoji/500 chars → sin trim/sanitización al persistir.

## 5. Orden, validación, riesgos
Orden: domain.ts → errors+store → repository → db/ipc + línea en ipc.ts → preload → validación. Validación: typecheck && lint && test (spike intacto) && dev con humo por DevTools (crear cadena, relanzar, corromper db.json, cascada). Riesgos: no tocar flujo de captura (solo 1 línea en ipc.ts + preload); fs síncrono irrelevante a este volumen (escape: cola de promesas); structuredClone O(store) trivial; QA testeable con vi.mock('electron') + mkdtempSync (patrón wavFileService).
