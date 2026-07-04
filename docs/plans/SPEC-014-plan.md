# Plan de implementación — SPEC-014: guión y objetivos con IA

> Generado por subagente Plan y aprobado por el orquestador (2026-07-04). Contrato: specs/SPEC-014-guion-ia.md. Verificado: repository.updateInterview ya acepta scriptMarkdown/objectives/status; getDecryptedSecret('anthropic') existe; main sin externalizeDepsPlugin (rollup bundlea deps).

## 1. Dep
`npm i --save-exact @anthropic-ai/sdk` (reciente, ≥0.70 para output_config y opus-4-8 tipados; verificar en typecheck, jamás any). Import SOLO en src/main/llmService.ts. Fase 0 verifica bundling (plan B: externalizeDepsPlugin).

## 2. llmService (main)
Constantes: claude-opus-4-8, max_tokens 16000, thinking adaptive, NUNCA sampling/budget_tokens; TRANSCRIPT_EXCERPT_CHARS 8000; MAX_PREVIOUS_INTERVIEWS 5; OUTPUT_SCHEMA {scriptMarkdown, objectives[]} additionalProperties false (rango 3-7 por prompt — schema no soporta minItems).
getAnthropicKey: secrets('anthropic') → env ANTHROPIC_API_KEY → null. getLlmStatus → {hasAnthropicKey}.
generateInterviewScript(interviewId): getInterview (templateId null → no-template; sin key → no-key) → getCompany/getContact/getInterviewTemplate → contexto histórico: listInterviews(companyId) filtrado (≠id, con transcriptPath o nota), desc, cap 5; transcript: readFileSync+JSON.parse campo lines → "[channel sN] texto" → slice(-8000), try/catch omite corruptos (best-effort); nota truncable → prompt (system: preparador discovery Mom Test/Running Lean + fase; user: secciones Empresa/Contacto/Template serializado/Entrevistas anteriores/Tarea) → client.messages.create → stop_reason !== end_turn → format; filtrar thinking, JSON.parse del primer text, validar shape, descartar objetivos vacíos → updateInterview({scriptMarkdown, objectives, status:'prepared'}) SOLO tras parseo válido → Interview.
Errores: LlmOperationError kinds no-key|no-template|auth|rate-limit|connection|format; mapeo AuthenticationError→auth, RateLimitError→rate-limit, APIConnectionError→connection ANTES de APIError→connection; parse→format. Mensajes es-ES. Guard inFlight por interviewId.

## 3. Tipos + bridge
types/llm.ts (DOM-free): LlmErrorKind/LlmError/LlmResult/LlmStatus/LlmApi {getStatus, generateScript}. IPC llm:get-status / llm:generate-script con wrapper handleLlm ASYNC (a diferencia de handleDb). Preload api.llm; la clave jamás cruza el bridge.

## 4. UI
components/interviews/ScriptSection.tsx con ESTADO LOCAL (sin hook aparte; único consumidor). Props {interview, onInterviewUpdated}. Estados: keyStatus loading|ok|missing (getStatus en effect), generating, mode read|edit, drafts, confirmRegenerate/confirmDiscard, saving.
Render: cabecera h3 Guión + acciones (Generar con Sparkles, disabled+Tooltip por template/clave, spinner Loader2 + "Generando guión…"; lectura: Editar Pencil ghost + Regenerar RefreshCw outline); Alert default de clave con Link Ajustes; empty FileText "Aún no hay guión"+botón; lectura whitespace-pre-wrap + h4 Objetivos ul Target; edición Textarea rows 14 + fila por objetivo (Input + Trash2 "Eliminar objetivo") + Plus "Añadir objetivo" + sticky Cancelar/Guardar.
Handlers: generate (toast "Guión generado"/toast.error, finally setGenerating(false)); regenerate (AlertDialog "Se sobrescribirán el guión y los objetivos actuales."); save (filtra vacíos silenciosamente, api.db.updateInterview {scriptMarkdown, objectives} SIN status, toast "Cambios guardados"); cancel (dirty → AlertDialog "Descartar cambios").
InterviewDetailPage: sustituir bloque del empty por ScriptSection, ELIMINAR el secundario derogado, onInterviewUpdated actualiza el state ready (Badge Preparada re-renderiza). statusLabels: prepared pasa a contractual (comentario).

## 5. AC→cambio
12 ACs mapeados (tabla del plan).

## 6. Breakage presupuestado
tests/unit/interviews/InterviewDetailPage.test.tsx: AC-12 SPEC-013 (secundario derogado) + LOS 3 TESTS del archivo romperán porque mockApi no expone api.llm (TypeError en getStatus al montar) → QA añade createMockLlmApi (default hasAnthropicKey false) y extiende BridgeApi. spec-test-map: descripción AC-12. Nada más (grep verificado).

## 7. Orden, validación, riesgos
Fase 0: instalar + build/dev con esqueleto (bundling) + pipeline de errores con ANTHROPIC_API_KEY inválida en .env.local → Toast auth end-to-end (SDK real, sin clave válida). Fase 1 main → Fase 2 plumbing → Fase 3 UI → Fase 4 humo manual con fixtures (transcript.json copiado a mano). Generación real = verificación humana pendiente.
Riesgos: bundling (fase 0, plan B externalize); versión SDK; prompt acotado; parse cubierto; handleLlm async; no bloquear main (readFileSync KBs aceptable); doble click (disabled+inFlight); timeout SDK 10min OK sin streaming a 16K.
