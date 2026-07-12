# Plan de implementación — SPEC-035: Limpieza de UI de la Captura

> Autorado por el orquestador (2026-07-12): tres cambios quirúrgicos en componentes ya conocidos
> por el loop (NoteScriptSections/NoteSection de SPEC-027/029; RecordingSectionView de SPEC-034).

## Pasos

1. **`src/renderer/src/components/interviews/NoteScriptSections.tsx`**
   - `const showNoteSection = hasNote || hasTranscript || hasScript` → `hasNote || hasTranscript`.
   - Actualizar el comentario/docstring de la disposición (tabla de casos: con guión, sin nota y
     sin transcripción → solo Guión; cita SPEC-035).
2. **`src/renderer/src/components/interviews/NoteSection.tsx`**
   - Eliminar la rama muerta `noteState.status === 'ready' && note === null && !hasTranscript`
     (el `<p>` «Graba la entrevista para poder generar la nota.») — tras el paso 1 es
     inalcanzable desde producción. Actualizar docstring.
3. **`src/renderer/src/components/recording/RecordingSection.tsx`** (RecordingSectionView)
   - En el bloque «Estado 2 — Grabando»: `<TranscriptArea …/>` solo con
     `variant === 'interview'`. `TranscriptionStatusBadge`, `AssistantPanel`, `LevelMeter`s,
     `NoKeyAlert` y `MicSelect disabled` quedan en ambas variantes. Comentario citando SPEC-035
     (la transcripción sigue corriendo: badge/asistente/persistencia intactos).
4. `npm run typecheck` + `npm run lint` + prettier. Ejecutar `npx vitest run tests/unit/notes/
   tests/unit/markdown/ tests/unit/recording/ tests/unit/captures/` para conocer el impacto (los
   tests que asertan el mensaje o el área en vivo en captura romperán → los adapta QA Dev, NO el
   implementador; cualquier otra rotura es regresión).

## Sin tocar

TranscriptArea.tsx (sigue usándose en entrevista y spike), useTranscription, main/preload,
InterviewDetailPage/CaptureDetailPage (la variante ya la decide el prop controller de SPEC-034).

## Gotchas

- El caso «con transcripción y sin nota» debe seguir mostrando los controles de generación
  (no tocar esa rama de NoteSection).
- Tests previsiblemente afectados: NoteSection.test (mensaje), NoteScriptSections.test (caso
  guión-sin-nota-sin-transcripción), quizá CaptureDetailPage.recordingControls.test si asertaba
  el área en vivo (verificar). SPEC-015 (entrevista) NO debe romper.
