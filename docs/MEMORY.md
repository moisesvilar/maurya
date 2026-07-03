# MEMORY.md — memoria persistente del loop de desarrollo

> Vive fuera de la conversación. El agente lo lee al empezar cada vuelta y lo actualiza al cerrar cada spec.
> Tres secciones: PROBADO (qué se intentó y su resultado), VERIFICADO (hechos confirmados), ABIERTO (qué queda).

## Estado actual del loop
- Spec en curso: **SPEC-002-spike-stt-streaming-deepgram** (APROBADA — aprobación permanente de specs concedida por el humano 2026-07-03, ver RULES.md; en desarrollo vía /somo-dev)
- Decisión humana (2026-07-03): H0 se implementa como **proyecto Electron local** en este repo (electron-vite), NO en Lovable (no puede capturar audio de sistema). QA adaptado: Vitest local; e2e Playwright contra public link no aplica al spike.
- Última spec cerrada: **SPEC-001** (2026-07-03, unit 11/11 PASS tras 1 iteración de QA; commits 553fbc9/69dd922/3188a01)
- Próxima tarea pendiente en checklist: H0 ítem 2 — Gestión de permisos macOS (RF-AUDIO-005)

## PROBADO
<!-- [SPEC-NNN iter-M] qué se intentó → resultado (PASS/FAIL + causa). Un renglón por intento. -->
- [SPEC-001] Implementación Electron 38.8.6 + loopback por flags (CATap) → código completo, typecheck+lint 0 errores, smoke test OK (commit 553fbc9). Fase 0 acústica NO ejecutable por el agente: TCC micrófono=not-determined, screen=denied.
- [SPEC-001] `shadcn init` → timeouts de red; `lib/utils.ts` y `components.json` escritos a mano (los 8 componentes ui sí por CLI).
- [SPEC-001 QA iter-1] vitest run → 6/11 FAIL (todos: jsdom sin `navigator.mediaDevices`, usado por useAudioDevices:39). Verificador independiente CONFIRMÓ: defecto de test-infra (stub ausente en tests/setup.ts), no de implementación. Corrección en curso vía QA Dev. Report: tests/reports/SPEC-001-iter-20260703-220418.md

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
- Confirmar equipo real (el roadmap del PRD asume 1 fullstack full-time).
- Leak menor detectado por QA (no corregido, aceptable en spike): useAudioCapture no limpia el interval de 100 ms si se desmonta con captura activa.
