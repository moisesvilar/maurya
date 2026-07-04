# MEMORY.md — memoria persistente del loop de desarrollo

> Vive fuera de la conversación. El agente lo lee al empezar cada vuelta y lo actualiza al cerrar cada spec.
> Tres secciones: PROBADO (qué se intentó y su resultado), VERIFICADO (hechos confirmados), ABIERTO (qué queda).

## Estado actual del loop
- Spec en curso: _ninguna_
- Decisión humana (2026-07-03): H0 se implementa como **proyecto Electron local** en este repo (electron-vite), NO en Lovable (no puede capturar audio de sistema). QA adaptado: Vitest local; e2e Playwright contra public link no aplica al spike.
- Última spec cerrada: **SPEC-012** (2026-07-04, unit 174/174 PASS; commit código 280bc16; templates de entrevista con editor de dos niveles, duplicar, fase; flaky SPEC-011 estabilizado). **H2 COMPLETO (9/9)**. Antes: SPEC-011 (empresas/contactos), SPEC-010 (discoveries), SPEC-009 (layout, H1 COMPLETO), SPEC-008..001.
- Lección QA (2026-07-04): dialogs abiertos desde DropdownMenu — el returnFocus del menú compite con onOpenAutoFocus del Dialog (FocusScope re-enfoca con select:true) → NO asertar selección ni foco síncrono; usar waitFor(toHaveFocus). Y: toasts de sonner son <li> → no contar listitems globales con toasts visibles.
- Lección QA (2026-07-04): con Dialog modal Radix abierto, el fondo queda aria-hidden → queries por rol del contenido de fondo necesitan {hidden:true}.
- Lección QA nueva (2026-07-04): jsdom + Radix Tooltip grace area (rects 0×0) → tras el primer unhover, isPointerInTransit queda anclado y ningún tooltip posterior abre en el mismo render. Regla: máx 1 hover de tooltip por it/render.
- H0 ítem 6 (go/no-go): BORRADOR con GO provisional en docs/spike-audio-go-no-go.md; la FIRMA final espera la sesión de validación del humano (transcripción en vivo, latencia real, diarización, 15 min). **Decisión del loop 2026-07-03: continuar con H1 "a riesgo"** — el riesgo mayor (captura) ya está verificado por humano y el trabajo de H1 es independiente/reversible.
- Última spec cerrada: **SPEC-014** (2026-07-04, unit 204/204 PASS; commit 077c24c; guión+objetivos con claude-opus-4-8, structured outputs, contexto histórico, edición). **H3 COMPLETO (5/5)** — generación real pendiente de que el humano configure su clave Anthropic en Ajustes. Antes: SPEC-013 (crear entrevista), H2 y H1 completos, spike H0 (5/6, go/no-go pendiente firma).
- @anthropic-ai/sdk 0.110.0 pinneado (solo main; electron-vite lo externaliza y builder lo empaqueta desde dependencies). Patrón LLM: llmService en main, key secrets→env, errores tipados kinds, structured outputs json_schema, persistir solo tras parseo válido.
- Última spec cerrada: **SPEC-015** (2026-07-04, unit 218/218 PASS; commit 5ec1fcd; grabación integrada en la entrevista, componentes extraídos a components/recording/, /capture intacta). H4 ítems 1-5 cerrados; **ítem 6 (sesión ≥60 min) manual pendiente del humano**.
- Última spec cerrada: **SPEC-016** (2026-07-04, unit 239/239 PASS; commit 60d57cf; asistente proactivo Mom Test con disparadores 3 líneas/20 s/45 s, panel de sugerencia única, objetivos en vivo, alarmas, 👍/👎 persistido). **H5 COMPLETO (8/8) — EL DIFERENCIADOR HECHO.**
- Próxima tarea: **H6 — resumen + persistencia (5 ítems)** en una spec (SPEC-017): RF-NOTE-001 generar resumen con note-template vía LLM + RF-NOTE-004 consultar/editar la nota + RF-NOTE-005 exportar. **RF-NOTE-002 (persistir transcripción) y RF-NOTE-003 (reutilización por el LLM) YA ESTÁN CUBIERTOS** por SPEC-002/015 y SPEC-014 respectivamente — marcarlos como cubiertos con referencia (patrón ítem 2 de H0). Status summarized al generar la nota. Entidad Note + note-templates (SPEC-008) ya existen.
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
