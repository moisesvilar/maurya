# Plan de implementación — SPEC-017: nota de resumen de entrevista (IA + edición + export)

> Generado por subagente Plan y aprobado por el orquestador (2026-07-04). Contrato: specs/SPEC-017-nota-resumen-entrevista.md. Hallazgos verificados: `ui/sheet.tsx` NO existe (añadirlo); `statusLabels.summarized='Resumida'` ya existe (solo pasa a contractual). Sin dependencias nuevas.

## 1. Main
- **noteService.ts (nuevo)** — reutiliza getAnthropicKey/mapSdkError/LlmOperationError de llmService; nunca sampling/budget.
  - `generateInterviewNote(interviewId, noteTemplateId)` con guard inFlight. Guards sin coste: sin transcriptPath → kind `no-transcript` (nuevo en LlmErrorKind); sin clave → no-key; template sin secciones → format.
  - Lee transcript.json defensivo (fallo → error tipado); carga interview+company+contact+noteTemplate.
  - SDK: claude-opus-4-8, max_tokens 16000, adaptive, json_schema `{sections:[{title,contentMarkdown}]}` additionalProperties:false; stop_reason end_turn + primer bloque text.
  - Prompts: system sintetizador discovery EN ESPAÑOL (context del template manda; evidencia concreta + citas; hechos vs inferencias; una entrada por sección en orden). User: empresa/contacto, secciones numeradas título—descripción, conversación `[Tú]`/`[Interlocutor N]` truncada a TRANSCRIPT_PROMPT_CHARS=60_000.
  - Ensamblado: `sections.length !== template.sections.length` → format; markdown = `## <título del TEMPLATE>` + contenido (títulos del template como fuente de verdad). Persistir SOLO tras parseo válido: createNote/updateNote + updateInterview {status:'summarized'} → `{interview, note}`.
  - `exportInterviewDocument(window, interviewId, target)`: dialog.showSaveDialog (defaultPath slug(title)+`-nota.md`/`-transcripcion.md`, filtro Markdown); cancelar → {saved:false} ok; nota = contentMarkdown tal cual; transcripción = `**<hablante>:** <texto>` por línea; fallo escritura → kind write.
- `readTranscriptLines(path)` + canal **recording:get-transcript-lines** con envelope (ilegible → {ok:false, kind:'unreadable'}) — distinto de get-transcript-stats (null).
- ipc.ts: `llm:generate-note` (wrapper LlmResult); `notes:export` handler ad-hoc (async, BrowserWindow.fromWebContents(event.sender)); get-transcript-lines.
- Hablantes: helper puro `speakerLabel(line)` (mic→"Tú"; system→`Interlocutor ${speaker+1}`; null→1) en módulo DOM-free compartido main/renderer (o duplicado 4 líneas con comentario cruzado).

## 2. Tipos + bridge
- llm.ts: LlmErrorKind += 'no-transcript'; NoteGenerationResult {interview, note}; LlmApi.generateNote.
- audio.ts: TranscriptLinesResult; MauryaApi.recording.getTranscriptLines.
- **notes.ts (nuevo, DOM-free)**: NoteExportTarget 'note'|'transcript'; NoteExportOutcome {saved, filePath}; NoteExportError kinds not-found|no-content|write; NotesApi.export.
- preload index.ts + index.d.ts: llm.generateNote, recording.getTranscriptLines, notes.

## 3. UI
- **ui/sheet.tsx NUEVO** (desviación documentada: la spec decía instalado y no lo está; primitivo shadcn sobre radix-ui 1.6.1, cero deps).
- **NoteSection.tsx** (patrón ScriptSection, sin hook nuevo; useNoteTemplates para el Select): Card h3 "Nota", 6 estados — (1) sin transcript ni nota: "Graba la entrevista para poder generar la nota."; (2) grabada sin nota: Select template (aria-label "Note-template", preseleccionado 1º) + "Generar nota" (Sparkles) + outline "Ver transcripción" (FileText); sin templates → "Crea un note-template para generar la nota" + Link + disabled Tooltip "Necesitas un note-template"; sin clave → Alert con Link a Ajustes (LITERAL DISTINTO del de guión) + Tooltip; (3) Loader2 "Generando nota…"; (4) lectura: Select persiste + toolbar Editar (Pencil) / DropdownMenu "Exportar" (Download: "Exportar nota (.md)", "Exportar transcripción (.md)" solo con transcriptPath) / "Ver transcripción" / ghost "Regenerar nota" (RefreshCw); render sin dependencia: líneas `## ` como heading semibold, resto whitespace-pre-wrap; (5) edición: Textarea + "Guardar"/"Descartar" (dirty→AlertDialog "Descartar cambios"); (6) error: Alert destructive con error.message bajo la toolbar, nota previa intacta. Skeleton en carga inicial (getNoteByInterview). AlertDialog "Regenerar nota" (Cancelar/"Regenerar"). Toasts "Nota generada"/"Nota guardada". Guardar solo contentMarkdown, status intacto. Éxito → onInterviewUpdated + set note. Nota sin transcriptPath: lectura/edición normal, sin "Ver transcripción" ni export de transcripción, "Regenerar nota" disabled Tooltip "Graba la entrevista para regenerar la nota".
- **TranscriptSheet.tsx**: Sheet derecho, "Transcripción"; getTranscriptLines al abrir; Badge speakerLabel + texto; error → "No se pudo leer la transcripción".
- Export: saved:true → "Nota exportada"/"Transcripción exportada"; saved:false → nada; ok:false → toast destructive "No se pudo exportar".
- InterviewDetailPage: NoteSection ENTRE RecordingSection y ScriptSection, onInterviewUpdated compartido. statusLabels: comentario contractual (valor ya existe). Listado ya consume STATUS_LABELS.

## 4. AC→cambio
23 ACs: base (4) → estados 1-2; generación (6) → canal+servicio+spinner+AlertDialog+error sin persistir; edición (6); transcripción (2); export (4); Badge Resumida (1).

## 5. Breakage presupuestado (exacto)
- **Runtime (vitest run, 239 tests): 0 rotos** — defaults del mock cubren NoteSection (getNoteByInterview→null, listNoteTemplates→[], llm sin clave). Condiciones obligatorias: literal del alert de clave distinto del de guión; aria-labels sin colisión; textos nuevos no asertados.
- **tsc -p tsconfig.test.json: falla SOLO tests/helpers/mockApi.ts en 3 puntos** (llm.generateNote, recording.getTranscriptLines, notes en BridgeApi/installMockApi). QA adapta. Ni un error más. statusLabels: cero rotura (sin test directo, valor ya compilaba).

## 6. Orden, validación, riesgos
Orden: tipos → speakerLabels → noteService → ipc → preload → ui/sheet → TranscriptSheet → NoteSection → página+statusLabels.
Validación: typecheck+lint limpios; vitest 239/239; tsc tests falla exactamente §5. Smoke `env -u ELECTRON_RUN_AS_NODE npm run dev`.
Riesgos: Sheet manual (§3); import puro renderer→main (fallback duplicar); doble click (inFlight+disabled); truncado por max_tokens → format sin persistir; showSaveDialog async → handler ad-hoc con ventana.
