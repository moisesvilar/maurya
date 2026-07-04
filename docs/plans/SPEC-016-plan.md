# Plan de implementación — SPEC-016: asistencia proactiva en tiempo real

> Generado por subagente Plan y aprobado por el orquestador (2026-07-04). Contrato: specs/SPEC-016-asistencia-tiempo-real.md.

## 1. assistantService (main, nuevo)
- Ciclo de vida: startAssistant(sender, interviewId) desde recording:start SOLO con interviewId (nunca /capture); carga interview (objectives/scriptMarkdown best-effort); sin clave → emite no-key y queda INERTE (cero timers/llamadas); stopAssistant() síncrono desde recording:stop ANTES de persistTranscript (+reset en camino de error).
- Enganche: **callback** setFinalLineListener en transcriptionService (invocado tras el push en handleResult, try/catch — el asistente jamás rompe la transcripción). Buffer propio + newLinesSinceLastCall.
- Disparadores (constantes exportadas): MIN_NEW_FINAL_LINES 3 + MIN_INTERVAL_MS 20000 evaluados por línea; fallback setInterval 45000 con ≥1 línea; guard inFlight; sin material → sin llamada. analyzing se emite sin suggestion (el hook conserva la previa). Error → emitir error SIN resetear contadores (reintento natural).
- SDK: claude-opus-4-8, max_tokens 1024, adaptive, effort low + json_schema {action enum, suggestedQuestion, reason, alarms enum[], objectivesMet int[]} additionalProperties false; parseo defensivo; nunca sampling/budget.
- Prompts esbozados (system copiloto Mom Test/Running Lean con las 3 alarmas y brevedad; user: objetivos numerados con estado, guión 6000, conversación últimas 4000 chars formato [canal sN], sugerencia anterior, tarea).
- objectivesMet: Set acumulativo (nunca decrece), filtrado a rango.
- Feedback: assistant:feedback fija voto de la última sugerencia (mutable hasta la siguiente). Summary {suggestionCount, feedback{up,down}}; no-key/sin sesión → null.
- Carrera análisis vs stop: patrón session===target; respuesta tardía descartada. Timer cleanup en stop/reset.

## 2. Persistencia
persistTranscript(wavPath, assistant = null) → JSON {lines, latency, assistant}. ipc: const summary = stopAssistant() antes de persistir. Lectores existentes ignoran el campo (sin regresión). Sin líneas → no se escribe (summary se pierde, aceptable).

## 3. Tipos + bridge
types/assistant.ts (DOM-free): AssistantAction/Alarm/State/Suggestion/UpdateEvent (error: LlmError)/SessionSummary/Vote/AssistantApi {onUpdate, sendFeedback}. Canales assistant:update (send con isDestroyed) y assistant:feedback (invoke). Preload: intersección MauryaApi & {db;secrets;llm;assistant}.

## 4. UI
useAssistant (suscripción; analyzing/error conservan sugerencia; active la sustituye y resetea vote; sendFeedback optimista; reset() llamado en handleStart). AssistantPanel (Card acentuada: fila1 Badge Profundiza ámbar/Continúa verde + chips alarma Cumplido/Genérico/Hipotético + "Analizando…" Loader2 + 👍/👎 aria-labels "Sugerencia útil"/"Sugerencia no útil" con bg-accent al votado; fila2 pregunta font-medium; fila3 reason muted; estados inicial/no-key con Link Ajustes/error discreto). ObjectivesPanel (solo con objetivos; h4 Objetivos; Circle muted / CheckCircle2 verde + line-through). Insertados en Estado 2 ENTRE fila superior y LevelMeters. Al parar, capturing false → desaparece.

## 5. AC→cambio
15 ACs mapeados (el NFR de coste = AC-13).

## 6. Breakage presupuestado
mockApi (assistant: AssistantApi + createMockAssistantApi + emitAssistantUpdate) → sin él crashea el render de tests/unit/recording (todos los de Estado 2); transcriptionService.test (writer gana assistant: null — actualizar forma); llmService exportar helpers sin rotura.

## 7. Orden, validación, riesgos
Orden: types → export helpers llmService → transcriptionService (listener+param) → assistantService → ipc → preload → hook/paneles/RecordingSection. Fase 0 sin clave real: (a) sin clave → panel inactivo y CERO llamadas; (b) clave inválida + Deepgram real → analyzing → error auth discreto → reintento; transcript.json con assistant {0, {0,0}}.
Riesgos: compartir getAnthropicKey/mapSdkError (export, no duplicar); listener en try/catch; stop síncrono sin esperar; carrera con target; timers; sender.isDestroyed; persist sin líneas.
