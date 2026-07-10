# Prompt de arranque — Externalizar y editar los prompts de Claude

> Pega el bloque de abajo en una sesión nueva de Claude Code.

---

Quiero externalizar y hacer editables los prompts de la integración con Claude. Contexto y objetivo:

## Situación actual
Los prompts están hardcodeados dentro de tres servicios de `src/main`, en funciones
`buildSystemPrompt` / `buildUserPrompt` / `buildSystemBlocks`:

- `src/main/llmService.ts` → `buildSystemPrompt` (líneas ~180-201): persona + reglas
  para generar guión + objetivos de entrevista. Salida structured `{ scriptMarkdown, objectives }`.
- `src/main/noteService.ts` → `buildSystemPrompt` (líneas ~127-144): persona + reglas
  para sintetizar la nota de resumen. Salida `{ sections }`.
- `src/main/assistantService.ts` → `buildSystemPrompt` (líneas ~348-364) + `buildSystemBlocks`
  (~375-393): copiloto en vivo. Salida `{ action, suggestedQuestion, reason, alarms, objectivesMet }`.
  OJO: usa prompt caching (SPEC-023) — el prefijo `systemBlocks` se construye UNA vez por sesión
  en `startAssistant` y debe ser byte-estable entre llamadas; lleva `cache_control: ephemeral`.

Las tres partes `buildUserPrompt` NO son prompt editable: ensamblan datos de la persistencia
(empresa, contacto, transcript, template). Solo debe externalizarse/editarse la instrucción
"system" (persona + reglas).

## Objetivo
1. Extraer el texto de los tres system prompts a un módulo de defaults aparte
   (p. ej. `src/main/prompts/defaults.ts`), fuera de la lógica de los servicios.
2. Permitir consultarlos y editarlos desde Ajustes, como una nueva pestaña
   "Prompts personalizados" junto a "Claves de IA" y "Plantillas de notas"
   (`src/renderer/src/pages/SettingsPage.tsx`, hoy con tabs 'api-keys' | 'note-templates').
3. Resolución en cada uso: override guardado por el usuario → default del módulo.
   Al restablecer, se vuelve al default.

## Arquitectura a seguir (invariantes del proyecto — respétalos)
- Persistencia: los overrides van al store local vía el patrón envelope `DbResult`
  (`src/main/db/ipc.ts` con `handleDb`, `repository.ts`, `store.ts`). Sigue exactamente
  el cableado de note-templates de punta a punta: repository → `db:*` IPC → bridge en
  `src/preload/index.ts` → contrato en `src/renderer/src/types/domain.ts` → hook
  `src/renderer/src/hooks/use*` → componente en `src/renderer/src/components/settings/`.
  Clona el patrón de `useNoteTemplates` + `NoteTemplatesTab.tsx` (loading/error/ready,
  toasts, etc.).
- Los prompts NO son secretos: van a `db.json`, no a `secrets.json`.
- Regla del modelo intacta: nunca enviar temperature/top_p/top_k/budget_tokens.
- Caché del asistente: el override se lee al arrancar la sesión (`startAssistant`),
  nunca a mitad; mantén `systemBlocks` byte-estable durante la sesión.

## Decisiones que quiero que me plantees ANTES de implementar
1. ¿Editable = TODO el system prompt, o solo el bloque "persona + guía" dejando bloqueadas
   las reglas estructurales que sostienen el schema (p. ej. "responde solo con el JSON",
   límites de caracteres del asistente `SUGGESTED_QUESTION_MAX_CHARS`/`REASON_MAX_CHARS`)?
   Recomiéndame lo más seguro para no romper los structured outputs.
2. Formato del "archivo aparte": módulo `.ts` tipado y bundleado vs. `.md` leído en runtime.
3. Trazabilidad: esto es una feature nueva. Según CLAUDE.md el desarrollo es spec-driven
   desde `docs/checklist.md` con RF del PRD. Dime si conviene crear un RF-CFG-xxx y una SPEC
   nueva (y correr el loop /somo-spec → /somo-dev → /somo-qa-*), o abordarlo directo.

Primero explora y confírmame la línea exacta de cada prompt y el cableado, luego proponme
el plan con las 3 decisiones resueltas. No edites `docs/prd.md` ni `docs/checklist.md` salvo
para cerrar. No debilites tests para que pasen.
