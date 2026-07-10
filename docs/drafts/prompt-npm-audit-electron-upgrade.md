# Prompt — Resolver `npm audit` (vitest + Electron) en worktree aparte

> Prompt autocontenido para lanzar en una sesión de Claude Code dentro de un
> worktree aislado creado desde `main`. Copia el bloque de abajo como mensaje
> inicial de la sesión.

---

Eres desarrollador senior en Maurya (app Electron + React + TypeScript para macOS:
captura mic + audio de sistema, transcribe con Deepgram, asiste/resume con Claude).
Trabajas en un worktree aislado creado desde `main`. Lee CLAUDE.md y docs/RULES.md
antes de tocar nada.

OBJETIVO: resolver las 3 vulnerabilidades que reporta `npm audit`, en dos fases
independientes, dejando la suite en verde y sin degradar tests.

Estado actual (`npm audit`):
1. vitest <3.2.6 + @vitest/coverage-v8 <=3.2.5 — 2 CRÍTICAS (dev only): lectura/
   ejecución de archivo arbitrario cuando el servidor de UI de Vitest escucha.
   Riesgo real bajo (el proyecto corre `vitest run`, sin --ui), pero hay que cerrarlas.
2. electron <=39.8.4 — 1 ALTA (runtime): use-after-free en offscreen rendering,
   crash en clipboard.readImage(), window.open con targets no acotados al opener.
   Versión actual: electron 38.8.6. Fix = electron 43.x → salto de 5 majors, BREAKING.

FASE A — bump seguro de vitest (hazla primero, commit propio):
- `npm install -D vitest@^3.2.6 @vitest/coverage-v8@^3.2.6`
- `npm run typecheck` y `npm test` en verde (misma cuenta de tests que en main; no
  se debilita, borra, .skip ni .only ningún test — regla dura de RULES.md).
- `npm audit`: confirma que las 2 críticas de vitest desaparecen.
- Commit Conventional Commits: `chore(deps): bump vitest a 3.2.6+ (cierra GHSA-5xrq-8626-4rwp)`

FASE B — upgrade de Electron 38 → 43 (tarea de riesgo, commit propio):
- Sube electron a 43.x y ajusta electron-vite / electron-builder / @electron/rebuild
  si hace falta. Revisa breaking changes de Electron 39, 40, 41, 42 y 43 (Chromium/
  Node bump, cambios en window.open, safeStorage, deprecaciones de API).
- Verifica que NO se rompe:
  · Pipeline de audio: flags de loopback CATap añadidos ANTES de app.whenReady()
    (loopbackHandler.ts), interceptor getDisplayMedia, captura mic+sistema, WAV.
    Requiere macOS 14.2+. Esta verificación es MANUAL (grabación real).
  · safeStorage/Keychain (secrets cifrados) siguen leyendo/escribiendo.
  · `npm run typecheck`, `npm test` en verde.
  · `npm run build:mac` produce Maurya.app + DMG/ZIP arm64 con sello ad-hoc y la
    app arranca (humo manual).
- Si algo del audio/empaquetado no se puede verificar de forma automatizada, déjalo
  documentado como MANUAL con lo que probaste por lectura de código.
- Commit: `chore(deps): actualiza Electron 38 → 43 (cierra GHSA-532v-... y otras)`

CRITERIO DE HECHO:
- `npm audit` sin vulnerabilidades (o con las residuales justificadas por escrito).
- typecheck + suite unit en verde por `npm test`.
- build:mac OK y arranque manual verificado (o el bloqueo documentado si no puedes
  firmar la parte de audio sin hardware).

NO toques docs/prd.md ni docs/checklist.md salvo que apliques el flujo del loop.
NO uses `npm audit fix --force` a ciegas: aplica los cambios controladamente y
justifica cada bump. Máximo 3 iteraciones por fase; a la 3ª en rojo, para y escala.
