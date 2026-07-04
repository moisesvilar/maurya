# Plan de implementación — SPEC-015: grabación integrada en la entrevista

> Generado por subagente Plan y aprobado por el orquestador (2026-07-04). Contrato: specs/SPEC-015-grabacion-entrevista.md. Verificado: hooks del spike genéricos; STATUS_LABELS.recorded existe; Interview/patch ya soportan wavPath/transcriptPath/status.

## 1. Reutilización
Hooks tal cual: usePermissions, useAudioDevices, useTranscription, useCloseGuard. useAudioCapture: start(deviceId, interviewId?) retrocompatible (tests no asertan args). SIN cleanup de unmount en el hook (cambiaría /capture) — vive en RecordingSection.
Componentes: LevelMeter/TranscriptLine/CaptureErrorAlert/StopOnCloseDialog tal cual. EXTRAER a components/recording/ sin mover archivos spike (tests los importan): TranscriptArea + transcriptionStatusBadge + NoKeyAlert (de TranscriptionSection), MicSelect (de ConfigSection), LatencyRow (de ResultSection) — los spike quedan como wrappers con DOM byte-idéntico. PermissionBadges compacto nuevo (mismos literales). CaptureSection no se reutiliza (literales distintos: "Iniciar grabación").

## 2. Main
- recording:start acepta interviewId? → activeInterviewId (null para /capture; reset en el catch de stop).
- recording:stop: tras persistir, si activeInterviewId → updateInterview({wavPath, transcriptPath (null válido), status:'recorded'}) en try/catch (borrada → interview null, archivos quedan) → StopResult gana `interview: Interview | null` (decisión: en el StopResult, no refetch — atómico y cubre el auto-guardado sin consumidor; fallback refetch defensivo en renderer si null con interviewId).
- Caminos verificados: desconexión (finalize SIEMPRE llama stop), cierre (confirmClose→stop), error escritura → todos pasan por recording:stop → asocian.
- NUEVO canal recording:get-transcript-stats(path) → LatencyStats|null (lee {lines,latency} con try/catch→null) — para el resumen tras recarga. Duración tras recarga: fila omitida (documentado).
- Preload: start(interviewId?), getTranscriptStats.

## 3. RecordingSection
Props {interview, onInterviewUpdated}. Estados derivados: Grabando = status∈{starting,recording,stopping}; Grabada = wavPath && !newRecordingRequested; Preparación = resto. Estado local: newRecordingRequested, persistedLatency (fetch getTranscriptStats en Estado 3 sin result en memoria).
Estado 1: PermissionBadges + MicSelect + "Iniciar grabación" (Mic) + CaptureErrorAlert; handleStart: clearError+resetTranscription+start(deviceId, interview.id) (el bloqueo por permisos ya lo hace el hook — AC-2 gratis).
Estado 2: cronómetro + "Detener" destructive Square + Badge transcripción; 2×LevelMeter; TranscriptArea; NoKeyAlert; MicSelect disabled+Tooltip.
Estado 3: Duración (solo con result en memoria) · LatencyRow · rutas mono + "Mostrar en Finder" · "Nueva grabación" → AlertDialog "Sobrescribir grabación" ("La grabación y transcripción actuales se sustituirán.") → newRecordingRequested=true (archivos viejos quedan huérfanos, documentado); reset al terminar la siguiente con éxito.
onSaved: toast "Grabación guardada" + onInterviewUpdated(saved.interview ?? refetch). StopOnCloseDialog + useCloseGuard(stop).
Auto-guardado al desmontar: cleanup con stopRef → finalize → recording.stop llega a main aunque el componente muera (SPA, webContents vivo); setState en desmontado = no-op; toast visible (Toaster global); stoppingRef idempotente. Hueco conocido: unmount durante 'starting' (ms) → main grabando huérfano, recuperable (guard de main en el siguiente start).

## 4. Integración
InterviewDetailPage: RecordingSection ENTRE cabecera y ScriptSection; mismo callback onInterviewUpdated (extraer constante). Badge pasa a "Grabada" sin recargar. statusLabels: recorded contractual (comentario).

## 5. AC→cambio
14 ACs mapeados (tabla del plan).

## 6. Breakage presupuestado
SOLO compilación: tests/helpers/mockApi.ts (getTranscriptStats nuevo en el contrato) → QA añade el mock. El resto verde (defaults de mockApi cubren permisos/devices/subs; fixtures wavPath null → Estado 1; sin colisión de textos; posibles warnings act()). Suites spike: cero cambios (wrappers DOM-idénticos — VALIDAR tras el paso de extracciones). Aviso QA: no usar getByText('Micrófono') (ahora aparece 2×) — roles.

## 7. Orden, validación, riesgos
Orden: tipos → main → preload → extracciones (validar suites spike AQUÍ) → hook → RecordingSection → página. Validación: tsc+lint por bloque; vitest tras extracciones y al final (rojo esperado: solo mockApi en tsc de tests). Manual humano: grabar desde entrevista, navegar a mitad, recargar, desconectar mic, cerrar app, sin key, sesión ≥60 min (ítem 6).
Riesgos: doble captura /capture↔entrevista cubierta por el guard de main ("Ya hay una grabación en curso") — documentar; unmount en stopping (stoppingRef) y en starting (limitación conocida); entrevista borrada (catch → null); close guard con grabación de fondo del spike (preexistente, fuera de alcance, anotar).
