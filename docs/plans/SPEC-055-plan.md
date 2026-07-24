# Plan de implementación — SPEC-055

Reubicación 100% renderer. Sin cambios de main/preload/IPC/persistencia. Reutiliza
`useRecordingController` (SPEC-034/041), `TopBarPortal`/`TopBarSlot` (SPEC-034) y los canales
`recording:*`.

## 1. `CaptureTopBarControls.tsx` → `RecordingTopBarControls.tsx`

Renombrar el componente y el archivo. Tres ramas por estado del controller:

- `controller.recorded` → NUEVA rama Grabada: `data-testid="topbar-recorded-controls"`, etiqueta
  «Grabada» (con `· mm:ss` si `controller.result !== null`, vía `formatElapsed`) + botones «Mostrar
  en Finder» (`handleShowInFinder`) y «Nueva grabación» (abre el AlertDialog «Sobrescribir
  grabación», estado `confirmOverwrite` local aquí + `requestNewRecording`). El AlertDialog se monta
  dentro de este componente (va con su botón).
- `controller.capturing` → rama Grabando existente (`topbar-recording-controls`): cronómetro,
  Detener, TranscriptionStatusBadge, 2 LevelMeter compactos.
- resto → rama Preparación existente (`topbar-capture-controls`): PermissionBadges +
  OpenSettingsButton + MicSelect compacto.

## 2. `RecordingSection.tsx` → superficie bajo la cabecera (sin heading)

Se simplifica a un bloque que se renderiza **bajo la cabecera** (no al final). Contiene:

- Avisos: `CaptureErrorAlert` (error no-permiso + transcription.error), `DegradedTranscriptionAlert`
  (capturing && degraded), `NoKeyAlert` (capturing && no-key).
- Detalle Grabada (`recorded`): duración (si `result`), `LatencyRow` (si `displayLatency`), ruta WAV,
  ruta transcript. SIN botones (suben a la top bar), SIN heading.
- Diálogos: `ConsentDialog`, `StopOnCloseDialog`, `DiscardReasonsDialog` + efecto de motivos.

Se ELIMINAN: el heading «Grabación», el bloque de Preparación inline, y el AlertDialog «Sobrescribir»
(se mueve al componente de top bar con su botón). Se elimina el prop `variant`, el router
`RecordingSection`/`SelfControlledRecordingSection` (queda muerto) — el componente pasa a recibir
siempre `controller`. Renombrar a `RecordingSurface` para reflejar que ya no es la sección del final.
Quitar imports muertos (`Mic`, `MicSelect`, `PermissionBadges`, `OpenSettingsButton`, etc. según
queden sin uso).

## 3. Páginas: `InterviewDetailContent` y `CaptureDetailContent`

Estructura idéntica en ambas:

- Portal a la top bar con `RecordingTopBarControls` en **todos los estados** (quitar el gate
  `!recorded`; ahora Grabada también portala).
- Cabecera envuelta en `flex md:flex-row md:justify-between`; en Preparación, botón «Iniciar
  grabación» a la derecha (la captura ya lo tiene + «Asignar empresa»; la entrevista lo gana).
- `RecordingSurface` renderizada **bajo la cabecera** (tras `PermissionErrorAlert`, antes de
  `ObjectivesSection`), no al final.
- Retirar el render de la antigua sección al final.

Orden resultante del cuerpo: cabecera → PermissionErrorAlert → RecordingSurface (avisos + detalle
Grabada) → Objetivos → AssistantLiveSection → Nota/Guión.

## 4. QA (paso posterior)

Actualizar suites: SPEC-015 (preparación → top bar/cabecera; grabada → top bar + surface), SPEC-034
(Grabada en top bar; derogar AC-08/10/11), SPEC-049 (OpenSettingsButton en top bar), SPEC-041
(referencias a grabada/prep), section-order de InterviewDetailPage (sin heading «Grabación»), y las
suites que montan el detalle y llegan a grabación. Actualizar `spec-test-map.json`.
