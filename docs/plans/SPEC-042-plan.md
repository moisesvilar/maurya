# Plan de implementación — SPEC-042 Fusión de las dos secciones «Objetivos»

> Plan autorado por el orquestador. Spec: `specs/SPEC-042-fusion-seccion-objetivos.md`.
> Solo renderer: `ObjectivesSection.tsx` y `ScriptSection.tsx`. Sin cambios en main/tipos.

## 1. `components/interviews/ObjectivesSection.tsx`

- Estado nuevo: `objectivesDraft: string[] | null` (null = prístino) + `saving: boolean` +
  `confirmDiscard: boolean`. `displayedObjectives = objectivesDraft ?? interview.objectives`.
  `isDirty` = draft !== null && (longitud distinta || algún texto distinto) — copiar el cálculo
  de ScriptSection (líneas ~118-122).
- Fila del objetivo: el `<span>{objective}</span>` se sustituye por
  `<Input value={displayedObjectives[index]} aria-label={`Objetivo ${index+1}`} data-testid="objective-input" onChange=…>`
  (mutación del draft con el patrón de ScriptSection). Tras el lápiz, botón nuevo
  `<Button variant="ghost" size="icon" aria-label="Eliminar objetivo" data-testid="objective-delete-button"><Trash2/></Button>`
  que filtra el índice del draft.
- La lista itera `displayedObjectives`; los adornos por índice (icono con `objectiveState`,
  motivo, override, lápiz) toleran índices fuera de lo persistido (`results[index]`,
  `overrides?.[index]` ya usan optional/undefined; `objectiveState` indexa arrays — seguro).
- Bajo la lista (y también en el empty state): Button «Añadir objetivo» (outline, Plus,
  `objectives-add-button`) que apila `''` al draft. El hint del empty state pasa a
  «Se generan con el guión o añádelos aquí».
- Con `isDirty`: barra sticky `objectives-editor-actions` (copiar estructura de
  `script-editor-actions`) con Descartar (abre AlertDialog «Descartar cambios», patrón
  ScriptSection) y Guardar (spinner con `saving`).
- `handleSave`: filtra vacíos (`trim() !== ''`), `await window.api.db.updateInterview(interview.id, { objectives })`;
  ok → `onInterviewUpdatedRef.current(result.data)` + `setObjectivesDraft(null)` + Toast
  «Objetivos guardados»; error → toast.error (mensaje del envelope). Sin try/catch (envelope).
- El diálogo de override y `handleEvaluate` no cambian.

## 2. `components/interviews/ScriptSection.tsx`

- Eliminar: estado `objectivesDraft`, `displayedObjectives`, el bloque JSX completo de
  objetivos (h4 + Inputs + eliminar + añadir) y los imports que queden sin uso (Trash2, Plus,
  Input si no se usan en otro sitio del fichero).
- `isDirty` y `handleSave` quedan solo sobre el markdown (retirar el tramo de objetives del
  payload de updateInterview y el `setObjectivesDraft(null)` post-guardado).
- Actualizar el comentario de SPEC-025 («este bloque es la única superficie de edición») por la
  referencia a SPEC-042 (la edición vive en ObjectivesSection).

## Invariantes a preservar

- La invalidación de objectiveResults/objectiveOverrides al cambiar objectives la hace el
  repositorio (NO reimplementar en renderer).
- Guardar el guión no toca objectives (payload sin ese campo).
- Seguimiento en vivo, evaluación, marcas manuales y sus testids existentes intactos.
- Typecheck + lint verdes.
