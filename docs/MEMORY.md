# MEMORY.md — memoria persistente del loop de desarrollo

> Vive fuera de la conversación. El agente lo lee al empezar cada vuelta y lo actualiza al cerrar cada spec.
> Tres secciones: PROBADO (qué se intentó y su resultado), VERIFICADO (hechos confirmados), ABIERTO (qué queda).

## Estado actual del loop
- Spec en curso: _ninguna_
- Decisión humana (2026-07-03): H0 se implementa como **proyecto Electron local** en este repo (electron-vite), NO en Lovable (no puede capturar audio de sistema). QA adaptado: Vitest local; e2e Playwright contra public link no aplica al spike.
- Última spec cerrada: **SPEC-010** (2026-07-04, unit 133/133 PASS a la primera; commit código 09cc056; CRUD discoveries + detalle mínimo /discoveries/:id; cierra ítems 1-2 de H2). Antes: SPEC-009 (layout, H1 COMPLETO), SPEC-008, SPEC-007, SPEC-006, SPEC-005, SPEC-004/003/002/001 (spike H0).
- Lección QA (2026-07-04): con Dialog modal Radix abierto, el fondo queda aria-hidden → queries por rol del contenido de fondo necesitan {hidden:true}.
- Lección QA nueva (2026-07-04): jsdom + Radix Tooltip grace area (rects 0×0) → tras el primer unhover, isPointerInTransit queda anclado y ningún tooltip posterior abre en el mismo render. Regla: máx 1 hover de tooltip por it/render.
- H0 ítem 6 (go/no-go): BORRADOR con GO provisional en docs/spike-audio-go-no-go.md; la FIRMA final espera la sesión de validación del humano (transcripción en vivo, latencia real, diarización, 15 min). **Decisión del loop 2026-07-03: continuar con H1 "a riesgo"** — el riesgo mayor (captura) ya está verificado por humano y el trabajo de H1 es independiente/reversible.
- Próxima tarea: **H2 ítems 3-5 — empresas y contactos** (RF-DISC-003 Must alta de empresa, RF-DISC-004 Must alta de contacto, RF-DISC-005 Should editar/eliminar): candidatos a una sola spec (SPEC-011) sobre el detalle del discovery (/discoveries/:id ya existe con empty state de empresas). Después: RF-TPL-001..004 (templates de entrevista).
- Verificación humana pendiente de SPEC-005: abrir dist/mac-arm64/Maurya.app (clic derecho→Abrir), prompts TCC como "Maurya", key en ~/Library/Application Support/Maurya/.env.local.

## PROBADO
<!-- [SPEC-NNN iter-M] qué se intentó → resultado (PASS/FAIL + causa). Un renglón por intento. -->
- [SPEC-001] Implementación Electron 38.8.6 + loopback por flags (CATap) → código completo, typecheck+lint 0 errores, smoke test OK (commit 553fbc9). Fase 0 acústica NO ejecutable por el agente: TCC micrófono=not-determined, screen=denied.
- [SPEC-001] `shadcn init` → timeouts de red; `lib/utils.ts` y `components.json` escritos a mano (los 8 componentes ui sí por CLI).
- [SPEC-001 QA iter-1] vitest run → 6/11 FAIL (todos: jsdom sin `navigator.mediaDevices`, usado por useAudioDevices:39). Verificador independiente CONFIRMÓ: defecto de test-infra (stub ausente en tests/setup.ts), no de implementación. Corrección en curso vía QA Dev. Report: tests/reports/SPEC-001-iter-20260703-220418.md

- [SPEC-002] Implementación WS nativo (sin @deepgram/sdk) → commit fcfb08b, typecheck 0, lint 0 en src/, smoke OK. Fase 0 contra Deepgram real: auth por subprotocolo OK, interim/final por canal OK, 401 solo clasificable vía fetch /v1/auth/token, flush CloseStream ~2 s.
- [SPEC-002] Rotura esperada de tests SPEC-001 por cambio de contrato (StopResult, api.transcription en MauryaApi): 3 errores de tipos en tests/ + 3 lint no-empty-function preexistentes en tests/setup.ts → para QA Dev.

## VERIFICADO
<!-- Hechos confirmados por ejecución, no suposiciones. Ej: "SPEC-001 e2e verde en Lovable el <fecha>". -->
- El entorno del agente hereda `ELECTRON_RUN_AS_NODE=1`: Electron corre como Node y la ventana no abre. Ejecutar con `env -u ELECTRON_RUN_AS_NODE npm run dev`.
- `setDisplayMediaRequestHandler` + flags `MacLoopbackAudioForScreenShare`/`MacCatapSystemAudioLoopbackCapture` se aceptan sin crash en Electron 38.8.6 / macOS 26.5.1 (pipeline técnico OK; señal acústica sin verificar).
- Repo no tenía .git: inicializado 2026-07-03 (main + pipeline/SPEC-001). Sin remote configurado → sin push.

## ABIERTO
<!-- Qué queda por intentar, dudas técnicas, specs bloqueadas escaladas a humano. -->
- **SPEC-001 verificada por el humano (2026-07-03): "Todo OK"** — permisos TCC concedidos, medidores independientes por fuente, WAV 2ch/16kHz/16-bit con ambas fuentes audibles (AC-01/02/03/06/07/08 físicos cerrados). Pendiente opcional: sesión 15 min (AC-16). El loopback CATap por flags FUNCIONA en esta máquina → señal fuerte de GO para H0.
- API key de Deepgram disponible en `.env.local` (`DEEPGRAM_API_KEY`, gitignored).
- Lanzar la app: `./start.sh` (creado 2026-07-03).
- **Verificación humana pendiente de SPEC-002**: sesión con voz real (interims/finales por fuente en pantalla), transcript.json junto al WAV, key inválida en runtime, pérdida de conexión + reintento, autoscroll. Cómo: `./start.sh`.
- Confirmar equipo real (el roadmap del PRD asume 1 fullstack full-time).
- Leak menor detectado por QA (no corregido, aceptable en spike): useAudioCapture no limpia el interval de 100 ms si se desmonta con captura activa.
