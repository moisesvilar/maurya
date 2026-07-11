# Plan de implementación — SPEC-029: Edición markdown por defecto en Nota y Guión

> Generado por el subagente planner (2026-07-12) a partir de
> `specs/SPEC-029-edicion-markdown-por-defecto.md`.

## Hechos verificados en el código

1. **Contrato de `MarkdownEditor`**: `initialMarkdown` se lee **una sola vez** al crear la
   instancia TipTap (`useEditor({ content: initialMarkdown })`, sin deps). No hay API de reset:
   **la única forma de resetear el contenido es remontar el componente con una `key` distinta.**
   `onChange` solo se dispara en `onUpdate` (ediciones reales), nunca al montar — el dirty-check
   contra el string persistido no da falsos positivos (convención SPEC-027).
2. **`MarkdownView`**: sus únicos consumidores de producción son `NoteSection.tsx` y
   `ScriptSection.tsx`. Tras esta spec queda sin consumidores de producción; **no se borra** (los
   tests actuales lo referencian; su eliminación no es parte de esta entrega).
3. **Flujo tras guardar/regenerar el guión**: `onInterviewUpdated(result.data)` →
   `InterviewDetailPage` setState → la prop `interview` baja actualizada. Los setState locales del
   mismo callback de promesa se batchean (React 19) → un remontaje por key incrementada en ese
   callback ya lee el contenido nuevo.
4. **`NoteScriptSections`**: `forceMount` + `hidden` mantiene ambas secciones montadas → los
   borradores sobreviven al cambio de pestaña sin trabajo extra; los dos "Regenerar" coexisten
   montados (de ahí los testids).
5. **Lint/compiler**: prohibido `setState` síncrono en efectos y sincronizar estado desde props
   con efectos — fuerza el diseño de draft de abajo.
6. Tests que romperán (adapta QA Dev, NO el implementador): `tests/unit/notes/NoteSection.test.tsx`,
   `tests/unit/script/ScriptSection.test.tsx`, `tests/unit/markdown/NoteScriptSections.test.tsx`,
   `tests/spec-test-map.json` (SPEC-014/017/027).

## Estrategia general

Solo renderer, solo 2 ficheros modificados. Se elimina `mode: 'read' | 'edit'` de ambas secciones
y el `MarkdownEditor` queda siempre montado cuando hay contenido. Mecanismo central:

**Draft "null = prístino" + key de reset por contador.**

- `draft: string | null`, inicial `null`. `null` = "el editor no ha recibido ninguna edición real
  desde el último reset": como el editor solo emite `onChange` en ediciones reales, el draft no
  necesita inicializarse desde el persistido (evita el efecto de sincronización prop→estado que
  vetan las reglas del compiler).
- Dirty: `draft !== null && draft !== persistido`. Cubre el AC "deshacer hasta igualar el
  persistido" (llega onChange con string igual → dirty false → barra desaparece).
- `editorResetKey: number` (contador). El editor se renderiza con `key={editorResetKey}`. Se
  incrementa **solo** en: (a) descarte confirmado, (b) regeneración con éxito. **Nunca tras
  Guardar**: tras guardar, draft === nuevo persistido → dirty false → barra desaparece sin
  remontar, conservando foco y caret. Tras Guardar tampoco `setDraft(null)`: si el usuario tecleó
  durante el guardado en vuelo, ese onChange posterior debe seguir marcando dirty; la comparación
  por igualdad lo resuelve sola.
- Cuando la prop se actualiza tras Guardar, el editor NO se resetea (initialMarkdown solo se lee
  al montar y la key no cambió) — exactamente lo pedido por la nota técnica.
- En regeneración, el incremento de key y la actualización de datos ocurren en el mismo callback
  de promesa → un solo re-render → el editor remontado lee ya el contenido nuevo.

> Alternativa descartada: key por string persistido — remontaría el editor tras Guardar y
> perdería el caret. El contador es obligatorio.

## Fichero 1 — `src/renderer/src/components/interviews/NoteSection.tsx`

### Estado
- **Eliminar** `mode` y `handleStartEdit`.
- `draft`: `useState<string | null>(null)`.
- **Añadir** `editorResetKey` (`useState(0)`).
- Derivar en render: `persisted = note?.contentMarkdown ?? ''`;
  `dirty = note !== null && draft !== null && draft !== persisted`.

### Cabecera (con nota)
Condición `note !== null` (ya sin `mode === 'read'`), siempre visible también con cambios:
- **Eliminar** botón "Editar" (y el import de `Pencil`).
- "Exportar" (DropdownMenu) y "Ver transcripción": sin cambios de contenido.
- **"Regenerar" unificado**: Button `variant="outline"` (antes ghost "Regenerar nota"), icono
  `RefreshCw`, label `"Regenerar"`, `data-testid="note-regenerate-button"`, último de la fila.
  Con `generating`: swap actual pero outline y con el testid presente en ambos estados.
  Deshabilitado → envolver con el helper `withTooltip` existente (`disabledReason`). No envolver
  en Tooltip el estado "generando".
- Wrap responsive: contenedor de cabecera con `flex flex-wrap items-center justify-between gap-3`.

### Cuerpo (con nota) — fusionar las ramas read/edit en una sola rama `note !== null`
Orden: Alert de `generationError` → `templateSelect` (misma condición actual) → editor → barra.
- `MarkdownEditor` con `key={editorResetKey}`, `initialMarkdown={note.contentMarkdown}`,
  `onChange={setDraft}`, `ariaLabel="Nota"`, `testId="note-markdown-editor"`.
- **Eliminar** `<MarkdownView>` y su import (no tocar `MarkdownView.tsx`).
- Barra sticky **solo si `dirty`**: div sticky actual + `data-testid="note-editor-actions"`, con
  **"Descartar" (outline) a la IZQUIERDA de "Guardar" (default)** (orden invertido respecto al
  actual). Guardar con Loader2 mientras `saving`; ambos disabled con `saving`.

### Handlers
- `handleDiscard`: siempre `setConfirmDiscard(true)` (el botón solo existe con dirty).
- Acción confirmada del AlertDialog "Descartar cambios": `setConfirmDiscard(false)`;
  `setDraft(null)`; `setEditorResetKey((k) => k + 1)`. Sin `setMode`.
- `handleSave`: guard `if (note === null || draft === null) return`; persiste
  `contentMarkdown: draft`. Éxito: `setNoteState(...)` + toast "Nota guardada", nada más. Error:
  `toast.error` (draft intacto → barra sigue).
- `handleGenerate`: en `result.ok`, añadir `setDraft(null)` y `setEditorResetKey((k) => k + 1)`
  a lo actual. Inofensivo en la generación inicial.

### Sin cambios
Ramas `note === null`, `TranscriptSheet`, AlertDialog "Regenerar nota", toasts, efecto de carga,
`onNoteChange`. AlertDialog "Descartar cambios" mantiene "Cancelar" + "Descartar" destructive.

## Fichero 2 — `src/renderer/src/components/interviews/ScriptSection.tsx`

### Estado
- **Eliminar** `mode`, `handleStartEdit`, `handleCancelEdit`.
- `scriptDraft`: `useState<string | null>(null)`.
- `objectivesDraft`: `useState<string[] | null>(null)` — **null = prístino** → la lista mostrada
  es `displayedObjectives = objectivesDraft ?? interview.objectives`. Resuelve la
  re-sincronización sin efectos: mientras no haya edición, la lista sigue a la prop; al primer
  cambio se materializa.
- **Añadir** `editorResetKey` (`useState(0)`).
- Dirty derivado en render (sustituye a `isDirty()`):
  - `persistedScript = interview.scriptMarkdown ?? ''`
  - `scriptDirty = scriptDraft !== null && scriptDraft !== persistedScript`
  - `objectivesDirty = objectivesDraft !== null && (length distinta || algún elemento distinto)`
  - `isDirty = scriptDirty || objectivesDirty`

### Cabecera
- Sin guión: `generateButton('Generar guión')` sin cambios.
- Con guión (sin condición de `mode`): **eliminar** "Editar"/`Pencil`; "Regenerar" siempre
  visible: `variant="outline"`, `RefreshCw`, label "Regenerar",
  `data-testid="script-regenerate-button"`. **Añadir Tooltip en disabled** (hoy no lo tiene):
  helper `withTooltip` idéntico al de NoteSection (helper local por componente, convención del
  repo). Estado `generating`: swap actual con el testid presente.
- Mismo ajuste `flex-wrap` responsive.

### Cuerpo (con guión) — fusionar ramas
- `MarkdownEditor` con `key={editorResetKey}`, `initialMarkdown={persistedScript}`,
  `onChange={setScriptDraft}`, `testId="script-markdown-editor"` — siempre montado con guión.
- **Eliminar** `<MarkdownView>` y su import.
- **Bloque "Objetivos" siempre visible bajo el editor** (estructura SPEC-014 intacta), iterando
  sobre `displayedObjectives`. Handlers con updater funcional que materializa el prístino:
  - editar: `setObjectivesDraft((prev) => (prev ?? [...interview.objectives]).map(...))`
  - eliminar: `setObjectivesDraft((prev) => (prev ?? [...interview.objectives]).filter(...))`
  - añadir: `setObjectivesDraft((prev) => [...(prev ?? interview.objectives), ''])`
- Barra sticky **solo si `isDirty`**: `data-testid="script-editor-actions"`; renombrar "Cancelar"
  → **"Descartar"** (outline, izquierda) + "Guardar" (default, Loader2 con saving).

### Handlers
- Descartar: onClick → `setConfirmDiscard(true)`. Acción confirmada: `setConfirmDiscard(false)`;
  `setScriptDraft(null)`; `setObjectivesDraft(null)`; `setEditorResetKey((k) => k + 1)`.
- AlertDialog "Descartar cambios": cancel "Seguir editando" → **"Cancelar"** (unificación).
  Descripción actual se mantiene.
- `handleSave`: `objectives = (objectivesDraft ?? interview.objectives).map(trim).filter(!== '')`;
  `updateInterview(interview.id, { scriptMarkdown: scriptDraft ?? persistedScript, objectives })`.
  Éxito: `onInterviewUpdated(result.data)` + toast "Cambios guardados" +
  **`setObjectivesDraft(null)`** — imprescindible: el filtrado de vacíos hace que la lista
  persistida pueda diferir del draft (`['a','']` → `['a']`) y sin el reset la barra quedaría
  visible tras guardar. **No** tocar `scriptDraft` ni la key (caret intacto). Error: `toast.error`.
- `handleGenerate`: en `result.ok`, añadir `setScriptDraft(null)`, `setObjectivesDraft(null)`,
  `setEditorResetKey((k) => k + 1)`. El batching garantiza que el remontaje lee el guión nuevo.

### Sin cambios
Empty state sin guión, Alert de clave missing, `generateButton`, AlertDialog "Regenerar guión",
sincronización con ObjectivesSection (fluye por `onInterviewUpdated`; la invariante de descarte
vive en main y no se toca).

## Ficheros que NO se tocan
- `NoteScriptSections.tsx` — cero cambios (forceMount ya cumple los ACs de sincronización).
- `MarkdownEditor.tsx` — cero cambios (el contrato actual es lo que el diseño necesita).
- `MarkdownView.tsx` — queda sin consumidores de producción pero no se borra.
- Nada de main/preload/IPC/tipos.

## Docstrings
Actualizar los JSDoc de `NoteSection` y `ScriptSection`: edición siempre activa (SPEC-029),
Guardar/Descartar solo con cambios, reset por remontaje con key en descarte/regeneración, y por
qué no se remonta tras Guardar.

## Secuencia sugerida
1. `ScriptSection.tsx` (patrón base y caso más completo). 2. `NoteSection.tsx`.
3. `npm run typecheck` + `npm run lint`. 4. Verificación manual con `./start.sh` si es posible.

## Riesgos y gotchas
- **No resetear el draft tras Guardar** (ni setDraft(null) ni key): rompería "teclear durante el
  guardado en vuelo" y el caret. El dirty por comparación lo resuelve.
- **`setObjectivesDraft(null)` tras guardar SÍ es obligatorio** (asimetría por el filtrado de
  objetivos vacíos).
- **No inicializar drafts en efectos** (diseño null-prístino; resets solo en handlers/callbacks).
- **Identidad de callbacks**: sin useCallback nuevos salvo necesidad (compiler del repo). Los
  updaters funcionales capturan `interview` del render actual — correcto.
- **Dos "Regenerar" montados a la vez** en pestañas (forceMount): los testids desambiguan;
  ponerlos en el elemento botón incluido el estado "Generando…".
- **Orden de botones**: la Nota invierte el orden actual (Descartar a la izquierda); el Guión ya
  lo tiene.
- **Tests existentes romperán** (SPEC-014/017/027): adapta QA Dev, NO el implementador.
