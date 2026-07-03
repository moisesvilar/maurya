# MEMORY.md — memoria persistente del loop de desarrollo

> Vive fuera de la conversación. El agente lo lee al empezar cada vuelta y lo actualiza al cerrar cada spec.
> Tres secciones: PROBADO (qué se intentó y su resultado), VERIFICADO (hechos confirmados), ABIERTO (qué queda).

## Estado actual del loop
- Spec en curso: **SPEC-001-spike-captura-audio-macos** (APROBADA por humano; en desarrollo vía /somo-dev)
- Decisión humana (2026-07-03): H0 se implementa como **proyecto Electron local** en este repo (electron-vite), NO en Lovable (no puede capturar audio de sistema). QA adaptado: Vitest local; e2e Playwright contra public link no aplica al spike.
- Última spec cerrada: _ninguna_
- Próxima tarea pendiente en checklist: H0 ítem 1 (captura mic+sistema) → en spec

## PROBADO
<!-- [SPEC-NNN iter-M] qué se intentó → resultado (PASS/FAIL + causa). Un renglón por intento. -->
- _(vacío — aún no se ha ejecutado ninguna vuelta)_

## VERIFICADO
<!-- Hechos confirmados por ejecución, no suposiciones. Ej: "SPEC-001 e2e verde en Lovable el <fecha>". -->
- _(vacío)_

## ABIERTO
<!-- Qué queda por intentar, dudas técnicas, specs bloqueadas escaladas a humano. -->
- H0 depende de resolver la captura de audio mic+sistema en macOS (mayor riesgo técnico del PRD).
- Confirmar equipo real (el roadmap del PRD asume 1 fullstack full-time).
