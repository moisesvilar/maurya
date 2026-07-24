# Plan de implementación — SPEC-055

Reubicación 100% renderer. Sin cambios de main/preload/IPC/persistencia. Reutiliza `useRecordingController` (SPEC-034/041), `TopBarPortal`/`TopBarSlot` (SPEC-034) y los canales `recording:*`.

## 1. `CaptureTopBarControls.tsx` → `RecordingTopBarControls.tsx`

Renombrar el componente y el archivo. Tres ramas por estado del controller:

- `controller.recorded` → NUEVA rama Grabada: `data-testid="topbar-recorded-controls"`, etiqueta «Grabada» (con `· mm:ss` si `controller.result !== null`, vía `formatElapsed`) + botones «Mostrar en Finder» (`handleShowInFinder`) y «Nueva grabación» (abre el AlertDialog «Sobrescribir grabación», estado `confirmOverwrite` local aquí + `requestNewRecording`). El AlertDialog se monta dentro de este componente (va con su botón).
- `controller.capturing` → rama Grabando existente (`topbar-recording-controls`): cronómetro, Detener, TranscriptionStatusBadge, 2 LevelMeter compactos.
- resto → rama Preparación existente (`topbar-capture-controls`): PermissionBadges + OpenSettingsButton + MicSelect compacto.

## 2. `RecordingSection.tsx` → superficie bajo la cabecera (sin heading)

Se simplifica a un bloque que se renderiza **bajo la cabecera** (no al final). Contiene: avisos (`CaptureErrorAlert` de error no-permiso + transcription.error; `DegradedTranscriptionAlert` con capturing && degraded; `NoKeyAlert` con capturing && no-key), detalle Grabada (`LatencyRow` si `displayLatency`, ruta WAV, ruta transcript — SIN botones, SIN heading, SIN duración) y los diálogos (`ConsentDialog`, `StopOnCloseDialog`, `DiscardReasonsDialog`) + efecto de motivos.

Se ELIMINAN: el heading «Grabación», el bloque de Preparación inline, y el AlertDialog «Sobrescribir» (se mueve al componente de top bar con su botón). Se elimina el prop `variant`, el router `RecordingSection`/`SelfControlledRecordingSection` (queda muerto) — el componente pasa a recibir siempre `controller`. Renombrar a `RecordingSurface`. Quitar imports muertos.

## 3. Páginas: `InterviewDetailContent` y `CaptureDetailContent`

Estructura idéntica en ambas: portal a la top bar con `RecordingTopBarControls` en **todos los estados** (quitar el gate `!recorded`); cabecera envuelta en `flex md:flex-row md:justify-between` con «Iniciar grabación» a la derecha en Preparación (la captura ya lo tiene + «Asignar empresa»; la entrevista lo gana); `RecordingSurface` renderizada **bajo la cabecera** (tras `PermissionErrorAlert`, antes de `ObjectivesSection`), no al final; retirar el render de la antigua sección.

Orden resultante del cuerpo: cabecera → PermissionErrorAlert → RecordingSurface (avisos + detalle Grabada) → Objetivos → AssistantLiveSection → Nota/Guión.

## 4. QA (paso posterior)

Actualizar suites: SPEC-015 (preparación → top bar/cabecera; grabada → top bar + surface), SPEC-034 (Grabada en top bar; derogar AC-08/10/11), SPEC-049 (OpenSettingsButton en top bar), orden de secciones sin heading «Grabación» (SPEC-030/025). Actualizar `spec-test-map.json`.
