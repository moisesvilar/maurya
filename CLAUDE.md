# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

 Maurya es tu copiloto para entrevistas de descubrimiento. Te ayuda a aplicar The Mom Test en tiempo real: escucha la conversación, detecta cuándo se desvía hacia generalidades, opiniones o cumplidos de cortesía, y te sugiere cómo reconducirla hacia hechos concretos. Así sales de cada entrevista con problemas reales y relevantes.

Concretamente, es una app **Electron + React + TypeScript** para macOS que captura micrófono + audio del sistema, transcribe en  
vivo con Deepgram y asiste/resume con Claude.

---

## Flujo de desarrollo (orquestador del loop)

Eres el agente de soporte de desarrollo. El desarrollo es un bucle sobre las
specs pendientes de `docs/checklist.md`:

1. Localiza en `docs/checklist.md` la primera tarea `[ ]` pendiente. Ejecuta
/somo-spec` para definir su spec.
2. Carga el contexto de los ítems `RF-...` que la spec referencia en `docs/prd.md`.
3. Con todo el contexto, usa `/somo-spec` para definir la spec.
4. Ejecuta `/somo-dev`: un subagente en modo `plan` genera el plan de
mplementación. Analízalo, itera si hace falta, y cuando esté listo lanza la
mplementación con otro subagente. Avisa al usuario al terminar.
5. Ejecuta `/somo-qa-dev` para generar los tests unitarios (y e2e si aplican).
6. Ejecuta `/somo-qa-tester` para correr los tests.
7. Si fallan, diagnostica si el problema es el test (itera con `/somo-qa-dev`) o
a implementación (crea una iteración `spec-XXX-iter-N-YYY` y vuelve al paso 4).
8. Spec cerrada → marca `[x]` en `docs/checklist.md` y vuelve al paso 1.
9. Sin tareas pendientes, la misión termina.

**Lee `docs/RULES.md` antes de operar el loop** — reglas duras que lo acotan.
Las más críticas:

- **Nunca** debilitar, borrar ni `.skip`/`.only` un test para que pase. Si un
test falla, primero demuestra (verificador independiente) que el mal está en el
test, no en la implementación. "Verificado" = tests en verde por
`/somo-qa-tester`, no "compila".
- **Máximo 3 iteraciones** por SPEC; a la 3ª en rojo → parar y escalar a humano.
- Solo se modifica `docs/prd.md` / `docs/checklist.md` para marcar `[x]` al cerrar.
- Cada spec traza a uno o varios `RF-...` del PRD; no inventar requisitos.
- Las specs pasan a `/somo-dev` **sin** aprobación humana previa (derogado 2026-07-03).

Contexto del loop:

- `docs/prd.md` — PRD (34 RF, roadmap H0–H7). `docs/checklist.md` — specs por hito.
- `docs/MEMORY.md` — **léelo antes de cada vuelta y actualízalo antes de cerrar una spec.**
- `specs/` — specs definidas (`SPEC-NNN-slug.md`). `docs/plans/` — planes de implementación.
- `tests/spec-test-map.json` — trazabilidad AC → test por cada SPEC.
- **e2e (Playwright) no aplica** en este proyecto: es una app Electron local sin
public link (decisión humana 2026-07-03). La verificación end-to-end es manual;
QA automatizado = Vitest unit. Los ACs no automatizables quedan documentados
como `MANUAL` en `spec-test-map.json`.

---

## Comandos

```bash
npm run dev          # arranca la app en desarrollo (electron-vite)
./start.sh           # equivalente que limpia ELECTRON_RUN_AS_NODE (ver nota abajo)
npm run typecheck    # tsc de main+preload (node) y renderer (web) — sin emitir
npm run lint         # eslint con caché
npm run format       # prettier --write

npm test             # Vitest unit (una pasada)
npm run test:watch   # Vitest en watch
npx vitest run tests/unit/persistence/repository.test.ts   # un solo archivo
npx vitest run -t "cascading"                              # por nombre de test

npm run build:mac    # typecheck + electron-vite build + electron-builder --mac
```

- `npm run dev` **falla en silencio si `ELECTRON_RUN_AS_NODE` está exportada**
(Electron arranca como Node y la ventana no abre). Usa `./start.sh` o
`env -u ELECTRON_RUN_AS_NODE npm run dev`.
- `npm run build:mac` produce `dist/mac-arm64/Maurya.app` + DMG/ZIP arm64 con
firma **ad-hoc** (sin Developer ID ni notarización). Ver `README.md` para
abrir la app sin notarizar y para colocar la key en el userData empaquetado.
- Requisitos: macOS 14.2+ (backend CATap del loopback), Node 20+.

---

## Arquitectura

Tres procesos Electron con **context isolation** (`electron.vite.config.ts`):

- `**src/main/**` — proceso principal (Node). Único lugar donde viven claves,
SDKs (Anthropic, WebSocket de Deepgram) y el filesystem.
- `**src/preload/index.ts**` — puente `contextBridge`. Expone `window.api` con
una **API plana** (`db`, `secrets`, `llm`, `notes`, `assistant`, `recording`,
`transcription`, `permissions`, `window`). Cada método delega en un canal IPC.
- `**src/renderer/src/**` — React 19 + React Router (`HashRouter`) + Tailwind v4
  - shadcn/ui (`components/ui/`). Alias `@` → `src/renderer/src`.

### Patrón IPC de envelope (invariante clave)

Los handlers que pueden fallar **nunca rechazan la promesa**: Electron pierde el
`kind` tipado al serializar rejections. Devuelven un envelope discriminado
`{ ok: true, data } | { ok: false, error }`. Hay una familia por dominio, cada
una con su helper de registro en su `ipc.ts`:

- `db:*` → `DbResult` (`src/main/db/ipc.ts`, helper `handleDb`)
- `secrets:*` → `SecretsResult` · `llm:*` → `LlmResult` · `notes:export` → `NoteExportResult`
(todos en `src/main/ipc.ts`)

Al añadir un canal: registrar el handler en el `ipc.ts` correspondiente, añadir
el método al bridge en `preload/index.ts`, y tipar el contrato en
`src/renderer/src/types/`. El typecheck garantiza la coherencia del contrato.

### Seguridad de claves (invariante transversal)

La clave en claro **solo** viaja renderer→main en `secrets:save`; main jamás la
devuelve (las respuestas llevan `KeyStatus` con `configured` + `last4`). Toda
generación con LLM/STT corre **íntegra en main**; por IPC solo cruzan IDs,
eventos tipados y resultados. Resolución de clave (re-evaluada en cada uso):
**Ajustes cifrados (safeStorage/Keychain) → `.env.local` → null**. Nunca usar
`import.meta.env` para secretos (los inlinaría en el bundle); ver `src/main/env.ts`.

### Persistencia local

Almacén JSON transaccional en `userData/maurya-data/`:

- `db.json` — dominio (`src/main/db/store.ts` + `repository.ts` + `search.ts`).
`read()` sobre snapshot inmutable; `mutate()` trabaja sobre un `structuredClone`
y **solo persiste si la mutación no lanza** (validación → 0 escrituras). Toda
mutación es síncrona vía `ipcMain.handle` → se serializan, sin carreras.
- `secrets.json` — blobs cifrados con safeStorage, separados del dominio.
- Escritura **atómica** siempre (`src/main/atomicFile.ts`: tmp + fsync + rename).
- Robustez: un archivo corrupto se conserva como `.corrupt-<ts>`, se arranca un
almacén vacío y el fallo queda consultable vía `getStatus()` — nunca crashea.
- 7 entidades con integridad referencial (cascada / SET NULL): discoveries →
companies → contacts / interviews → notes; interview/note templates globales.

### Pipeline de audio y transcripción

1. `loopbackHandler.ts` — flags Chromium de loopback macOS (CATap), añadidos
*antes de `app.whenReady()`**, + interceptor `getDisplayMedia` (audio de
istema en modo `loopback`).
2. Renderer captura mic + sistema, mezcla a **PCM 16-bit 16 kHz estéreo**
L=mic, R=sistema) vía AudioWorklet (`worklets/recorderProcessor.ts`,
services/`), y envía chunks por` recording:write-chunk`.
3. `wavFileService.ts` escribe el WAV (fuente de verdad). Un **tee** empuja el
ismo chunk a `transcriptionService.ts` → `deepgramService.ts` (WebSocket
ativo, auth por subprotocolo, `multichannel`+`diarize`). La transcripción es
*degradable**: cualquier fallo suyo nunca afecta a la escritura del WAV.
4. Al parar: `finishTranscription` (CloseStream + flush) → `stopRecording` →
persistTranscript`escribe``.transcript.json con { lines, latency, assistant, consent }` junto al WAV.

### LLM (Claude)

`llmService.ts` (guión + objetivos), `noteService.ts` (nota de resumen +
export Markdown), `objectiveEvaluationService.ts`, `contextService.ts` y
`assistantService.ts` (asistente proactivo en vivo) usan `@anthropic-ai/sdk`
con structured outputs. **El modelo y el thinking se configuran POR TAREA**
(revisión de coste 2026-07): catálogo de 7 tareas en `types/domain.ts`
(`AiTaskId`, defaults en `DEFAULT_AI_TASK_SETTINGS`), tarifas por modelo en
`aiCost.ts` (desglose de 4 componentes persistido en `aiUsage.byTask`) y
mapeo del parámetro `thinking` por modelo en `aiModels.ts` — la semántica
difiere por modelo (Sonnet 5 apagado exige `disabled` explícito; Haiku exige
`enabled`+`budget_tokens`; una combinación inválida da 400). Regla común:
**nunca** enviar `temperature`/`top_p`/`top_k` (dan 400); `effort` solo en
modelos que lo soportan (Haiku no). El asistente corre en DOS llamadas:
interactiva (sugerencia+alarmas+cursor, default Haiku sin thinking, disparos
3 líneas/20 s + respaldo 45 s, degradados a solo-respaldo con la cola llena)
y mantenimiento (resolución de cola + objetivos, default Sonnet 5 con
thinking, cada 30 s con skip si no hay nada que mantener). Solo se activa con
`interviewId` (nunca en `/capture`) y sin clave queda **inerte** (cero llamadas).

### Renderer

`pages/` (rutas) · `components/{feature}/` + `components/ui/` (shadcn) ·
`hooks/use*` (un hook por dominio, envuelven `window.api`) · `types/` (contratos
compartidos main↔renderer) · `services/` (captura de audio) · `lib/` (utilidades).
La ruta `/capture` es el harness de captura provisional (herencia de los spikes H0).

### Tests

Solo **Vitest unit** (`vitest.config.ts`, jsdom; alias `@`). Los módulos Node
puros de main se testean con `@vitest-environment node`. Organizados por dominio
en `tests/unit/<dominio>/`; helpers en `tests/helpers/` (mock de `window.api`,
fake MediaStream). Setup global en `tests/setup.ts` (jest-dom).