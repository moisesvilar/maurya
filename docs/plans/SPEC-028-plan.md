# Plan de implementación — SPEC-028: Marcar y desmarcar objetivos como cumplidos con comentario

> Generado por el subagente planner (2026-07-11) a partir de
> `specs/SPEC-028-marcar-objetivos-cumplidos.md`. Verificaciones previas sobre el código real:
> en `components/ui/` existen `dialog.tsx`, `textarea.tsx`, `tooltip.tsx`, `button.tsx`; **no
> existen `radio-group.tsx` ni `label.tsx`** → hay que añadirlos (sin dependencia npm nueva: el
> repo usa el paquete unificado `radix-ui@1.6.1`, que incluye los primitivos RadioGroup y Label).
> La invariante SPEC-025 vive en `updateInterview` (repository.ts ~444-455) y la regeneración del
> guión pasa por ahí (`llmService.ts:453`), así que extenderla cubre también el AC de "Regenerar".
> `objectiveEvaluationService.ts` es el patrón a clonar (schema structured output + thinking
> adaptive + filtrado de bloques thinking + stop_reason + parseo defensivo + recordInterviewUsage
> antes de persistir + LlmOperationError/mapSdkError/toLlmError de `llmService.ts`).

## 0. Resumen de diseño

Un canal IPC nuevo `llm:override-objective` (familia `llm:*`, envelope `LlmResult<Interview>`,
sin eventos: es acción manual y el resultado viaja en la respuesta del invoke, patrón
`llm:evaluate-objectives` manual). Un servicio nuevo en main (`objectiveOverrideService.ts`) que
valida, reescribe la explicación con Claude (o degrada a `text = comment` sin clave), acumula
coste y persiste marca+texto **en un único `mutate`** (atomicidad garantizada por el store).
Campo nuevo `objectiveOverrides` en `Interview`, alineado por índice con `objectives`, solo
escribible por main, descartado por la misma invariante que ya descarta `objectiveResults`. En el
renderer, `ObjectivesSection` gana el lápiz por objetivo, la precedencia
`override > evaluación > vivo`, las dos líneas de explicación (previa tachada + reescrita) y un
componente nuevo `ObjectiveOverrideDialog`.

## 1. Pasos ordenados, fichero a fichero

### Bloque A — Tipos compartidos y preload (contrato primero: el typecheck ancla todo lo demás)

**Paso 1. `src/renderer/src/types/domain.ts`**
- Añadir junto a `ObjectiveResult`:
  ```ts
  /**
   * Marca manual de cumplimiento de UN objetivo (SPEC-028). `comment` es el
   * literal del humano; `text` la explicación reescrita por el LLM (o el
   * comentario literal si no hay clave de Anthropic).
   */
  export interface ObjectiveOverride {
    met: boolean
    comment: string
    text: string
  }
  ```
- En `Interview`, tras `objectiveResults`, añadir:
  ```ts
  objectiveOverrides?: Array<ObjectiveOverride | null> | null
  ```
  con docstring calcado al de `objectiveResults`: alineado por índice con `objectives` (entrada
  `null` = sin marca manual), opcional y **sin bump de `schemaVersion`** (patrón
  `aiUsage`/`objectiveResults`), solo lo escribe main vía `setInterviewObjectiveOverride`, nunca
  escribible por patch, y cualquier cambio en `objectives` lo descarta (invariante del
  repositorio).
- **No** tocar `UpdateInterviewPatch` (el campo no es escribible por el patch genérico).

**Paso 2. `src/renderer/src/types/llm.ts`**
- Añadir a `LlmApi`:
  ```ts
  /** Marca manual de cumplimiento con reescritura de la explicación (SPEC-028). */
  overrideObjective: (
    interviewId: string,
    objectiveIndex: number,
    met: boolean,
    comment: string
  ) => Promise<LlmResult<Interview>>
  ```
- No hay evento nuevo ni `LlmErrorKind` nuevo (los fallos mapean a los kinds existentes:
  `format`, `auth`, `rate-limit`, `connection`; el camino sin clave NO es error, ver §4).

**Paso 3. `src/preload/index.ts`**
- En el objeto `llm`, añadir:
  ```ts
  overrideObjective: (interviewId, objectiveIndex, met, comment) =>
    ipcRenderer.invoke('llm:override-objective', interviewId, objectiveIndex, met, comment)
  ```

### Bloque B — Main

**Paso 4. `src/main/db/repository.ts`** (dos cambios)
- **Extender la invariante** en `updateInterview` (bloque `if (patch.objectives !== undefined)`):
  cuando `changed`, además de anular `objectiveResults`, anular `objectiveOverrides`:
  ```ts
  if (changed && interview.objectiveOverrides != null) {
    interview.objectiveOverrides = null
  }
  ```
  (condición independiente de la de `objectiveResults`: puede haber overrides sin evaluación —
  AC "Marcado sin evaluación previa"). Cubre a la vez la edición de la lista de objetivos y
  "Regenerar" el guión. Actualizar el comentario de la invariante para citar SPEC-028.
- **Nueva mutación** junto a `setInterviewObjectiveResults` (mismo patrón: no toca `updatedAt`,
  no se expone por IPC de patch, solo la usa main desde el servicio):
  ```ts
  export function setInterviewObjectiveOverride(
    id: string,
    index: number,
    override: ObjectiveOverride
  ): Interview {
    return mutate((draft) => {
      const interview = findOrThrow(draft.interviews, id, 'entrevista')
      if (!Number.isInteger(index) || index < 0 || index >= interview.objectives.length) {
        throw validationError('El objetivo indicado no existe en la entrevista')
      }
      // Rebase defensivo: el array siempre queda alineado en longitud con objectives
      const overrides = Array.from(
        { length: interview.objectives.length },
        (_, i) => interview.objectiveOverrides?.[i] ?? null
      )
      overrides[index] = override
      interview.objectiveOverrides = overrides
      return interview
    })
  }
  ```
  Validaciones dentro del `mutate`: si lanza, cero escrituras (garantía del store).

**Paso 5. `src/main/objectiveOverrideService.ts`** (fichero nuevo) — detalle completo en §4.

**Paso 6. `src/main/ipc.ts`**
- Importar `overrideInterviewObjective` del servicio nuevo y registrar junto a
  `llm:evaluate-objectives`:
  ```ts
  // Marca manual de cumplimiento (SPEC-028): mismo envelope LlmResult.
  handleLlm(
    'llm:override-objective',
    (interviewId: string, objectiveIndex: number, met: boolean, comment: string) =>
      overrideInterviewObjective(interviewId, objectiveIndex, met, comment)
  )
  ```

### Bloque C — Renderer

**Paso 7. `src/renderer/src/components/ui/label.tsx`** (nuevo, estilo shadcn actual del repo)
- `import { Label as LabelPrimitive } from 'radix-ui'` + `cn`; componente función con
  `data-slot="label"` y las clases estándar de shadcn. Sin dependencia npm nueva.

**Paso 8. `src/renderer/src/components/ui/radio-group.tsx`** (nuevo, estilo shadcn actual)
- `import { RadioGroup as RadioGroupPrimitive } from 'radix-ui'` + `CircleIcon` de lucide;
  exporta `RadioGroup` (`data-slot="radio-group"`, `grid gap-3`) y `RadioGroupItem`
  (`data-slot="radio-group-item"`, indicador con `CircleIcon` relleno). Mismo formato de
  componentes función con `React.ComponentProps<...>` que usa `dialog.tsx`.

**Paso 9. `src/renderer/src/components/interviews/ObjectiveOverrideDialog.tsx`** (nuevo) —
detalle en §5.

**Paso 10. `src/renderer/src/components/interviews/ObjectivesSection.tsx`** (extensión) —
detalle en §5.

**Paso 11. Validación final**: `npm run typecheck` + `npm run lint` (+ `npm run format`). Sin
tests (fuera de alcance, los genera `/somo-qa-dev`).

## 2. Contrato exacto del canal IPC nuevo

| | |
|---|---|
| **Canal** | `llm:override-objective` |
| **Registro** | `handleLlm` en `src/main/ipc.ts` (envelope `LlmResult`, la promesa **nunca** se rechaza) |
| **Payload** | `(interviewId: string, objectiveIndex: number, met: boolean, comment: string)` |
| **Retorno** | `Promise<LlmResult<Interview>>` — la entrevista actualizada, con `objectiveOverrides[objectiveIndex] = { met, comment, text }` y el `aiUsage` ya acumulado si hubo llamada |
| **Errores** (`{ ok: false, error: LlmError }`) | `format` (índice inválido, comentario vacío, respuesta LLM malformada o `stop_reason` ≠ `end_turn`), `auth` / `rate-limit` / `connection` (vía `mapSdkError`) |
| **Eventos** | **Ninguno.** Acción manual: el resultado viaja en la respuesta del invoke (patrón del camino manual de `llm:evaluate-objectives`). |
| **Caso sin clave** | **No es error**: resuelve `{ ok: true }` con `text = comment` persistido (feature degradable, AC "sin clave"). |

Bridge: `window.api.llm.overrideObjective(interviewId, objectiveIndex, met, comment)`.

## 3. Cambios de dominio

- **Tipo nuevo** `ObjectiveOverride { met: boolean; comment: string; text: string }`.
- **`Interview.objectiveOverrides?: Array<ObjectiveOverride | null> | null`**: alineado por
  índice con `objectives`; `null`/ausente = sin marcas; entrada `null` = ese objetivo sin marca.
  Opcional, sin bump de `schemaVersion`.
- **Invariante del repositorio** (extendida): cualquier mutación que **cambie** la lista
  `objectives` anula `objectiveOverrides` además de `objectiveResults`. Cubre edición manual
  (SPEC-014) y "Regenerar" guión.
- **Validaciones en `setInterviewObjectiveOverride`**: entrevista existente (`findOrThrow` →
  `not-found`), índice entero dentro de `[0, objectives.length)` (→ `validation`), y rebase del
  array a la longitud vigente de `objectives`. El servicio valida además `comment` no vacío ANTES
  de llamar al LLM.
- **No escribible por patch**: `UpdateInterviewPatch` no cambia.

## 4. Servicio de reescritura en main — `src/main/objectiveOverrideService.ts` (nuevo)

Clon estructural de `objectiveEvaluationService.ts`, más simple (sin transcript, sin camino
automático, sin eventos, sin guard de límite de coste — decisión de la spec: acción manual
explícita).

```ts
export async function overrideInterviewObjective(
  interviewId: string,
  objectiveIndex: number,
  met: boolean,
  comment: string
): Promise<Interview>
```

Flujo:

1. **Guards de entrada** (antes de cualquier llamada): `repository.getInterview(interviewId)`
   (lanza `not-found`); índice inválido → `LlmOperationError('format', 'El objetivo indicado no
   existe en la entrevista')`; `comment.trim() === ''` → `LlmOperationError('format', 'El
   comentario es obligatorio')` (defensa en profundidad; el renderer ya valida).
2. **Guard sin clave** (`getAnthropicKey() === null`): **no** lanzar. Persistir directamente
   `setInterviewObjectiveOverride(id, index, { met, comment: trimmed, text: trimmed })` y
   devolver la entrevista. Cero llamadas al LLM (principio del asistente inerte).
3. **Llamada única a Claude** — constantes: `MODEL = 'claude-opus-4-8'`, `MAX_TOKENS = 4096`,
   `TEXT_MAX_CHARS = 400` (mismo tope que `REASON_MAX_CHARS` de SPEC-025). **NUNCA**
   `temperature`/`top_p`/`top_k`/`budget_tokens` (400 en este modelo). Igual que la evaluación:
   `thinking: { type: 'adaptive' }` y `output_config.format json_schema`.
   - **Schema structured output**:
     ```ts
     const OUTPUT_SCHEMA = {
       type: 'object' as const,
       properties: { text: { type: 'string' as const, maxLength: TEXT_MAX_CHARS } },
       required: ['text'],
       additionalProperties: false
     }
     ```
   - **System prompt** (mismo estilo/registro que `buildSystemPrompt` de la evaluación): redactor
     de explicaciones de cumplimiento de un copiloto de discovery anclado a The Mom Test; el
     entrevistador ha corregido a mano el veredicto y aporta un comentario; redactar la
     explicación definitiva. Reglas: TODO en español; `text` 30-50 palabras máximo; **integrar el
     comentario del humano como fuente principal** y, si se aporta la explicación previa de la
     IA, **conservar la evidencia concreta compatible** (cifras, hechos); coherente con el
     veredicto manual; responder solo con el JSON pedido.
   - **User prompt** (secciones, patrón `buildUserPrompt`): `## Objetivo`; `## Veredicto manual
     del entrevistador` (Cumplido/No cumplido); `## Comentario del entrevistador`; condicional
     `## Explicación previa de la evaluación automática (evidencia a integrar)` con
     `objectiveResults[index].reason` y su veredicto **solo si** existe; `## Tarea` final.
4. **Post-proceso defensivo** (idéntico al patrón existente): try/catch → `mapSdkError`;
   `stop_reason !== 'end_turn'` → `format`; primer bloque `text` (filtrando thinking);
   `JSON.parse` + validar `text` string no vacío tras `trim()` → si no,
   `LlmOperationError('format', ...)`. **Nada se persiste ante cualquier fallo** (ni la marca:
   marca+texto son unidad atómica, decisión de la spec).
5. **Coste (SPEC-021)**: `recordInterviewUsage(interview.id, extractUsage(response))` — solo tras
   parseo válido y ANTES de persistir, para que la `Interview` devuelta ya incluya el `aiUsage`
   actualizado. Sin guard de límite de coste (acción manual explícita).
6. **Persistencia atómica**: `return repository.setInterviewObjectiveOverride(interview.id,
   objectiveIndex, { met, comment: trimmed, text: parsedText })`.

Sin guard `inFlight`: el Dialog es modal y el botón Guardar queda disabled durante el guardado.

## 5. Renderer — `ObjectivesSection.tsx` y `ObjectiveOverrideDialog.tsx`

### 5.1 `ObjectiveOverrideDialog.tsx` (componente nuevo en `components/interviews/`)

Sigue el patrón `InterviewFormDialog`: componente exterior `Dialog`/`DialogContent` +
**formulario interior que se remonta en cada apertura** (Radix desmonta `DialogContent` al
cerrar → estado fresco sin effects, evita `react-hooks/set-state-in-effect`).

Props:
```ts
interface ObjectiveOverrideDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Texto del objetivo (DialogDescription). */
  objectiveText: string
  /** Preselección del RadioGroup (calculada por el padre: marca vigente o contrario del estado mostrado). */
  initialMet: boolean
  /** Comentario precargado (override.comment vigente o ''). */
  initialComment: string
  /** true = éxito (el diálogo se cierra); false = fallo (permanece abierto conservando selección y comentario). */
  onSubmit: (met: boolean, comment: string) => Promise<boolean>
}
```

Contenido (wireframe de la spec):
- `DialogContent` con `data-testid="objective-override-dialog"`; `DialogTitle` "Cumplimiento del
  objetivo"; `DialogDescription` con `objectiveText`.
- `<form onSubmit>` con:
  - `RadioGroup` vertical (value `'met' | 'unmet'`, state inicial desde `initialMet`), dos
    `RadioGroupItem` + `Label` asociados por `htmlFor`/`id`: "Cumplido" / "No cumplido".
  - `Label` "Comentario" + `Textarea` `data-testid="objective-override-comment"`, `rows={4}`,
    placeholder "¿Por qué? Aporta la evidencia u observación que justifica el cambio", state
    inicial desde `initialComment`; `aria-invalid` cuando hay error.
  - Error inline `<p className="text-sm text-destructive">El comentario es obligatorio</p>` bajo
    el Textarea, controlado por `showRequiredError` (submit con `comment.trim() === ''`; se
    limpia en `onChange` — patrón `InterviewFormDialog`). **El botón Guardar nunca se deshabilita
    por validación**; solo durante el guardado.
  - `DialogFooter`: Button "Cancelar" (`variant="outline"`, `type="button"`, disabled mientras
    `saving`) y Button "Guardar" (`type="submit"`, default; mientras `saving`:
    `<Loader2 className="animate-spin" />` + disabled).
- `handleSubmit`: `preventDefault`; validar; `setSaving(true)`;
  `void onSubmit(met, comment.trim()).then((ok) => { setSaving(false); if (ok) onOpenChange(false) })`.
  En fallo el formulario conserva selección y comentario.
- Escape/overlay: comportamiento por defecto de Radix Dialog → cierra sin persistir.

### 5.2 `ObjectivesSection.tsx` (cambios)

- **Datos nuevos**: `const overrides = interview.objectiveOverrides ?? null`.
- **Estado nuevo**: `const [overrideIndex, setOverrideIndex] = useState<number | null>(null)`.
- **Precedencia** — reescribir `objectiveState`:
  ```ts
  const objectiveState = (index: number): ObjectiveState => {
    const override = overrides?.[index] ?? null
    if (override !== null) {
      return override.met ? 'met' : 'unmet'   // manual > todo
    }
    if (results !== null) {
      return results[index]?.met === true ? 'met' : 'unmet'  // evaluación > vivo
    }
    return liveMet.includes(index) ? 'met' : 'pending'
  }
  ```
- **Fila del objetivo**: contenido del `li` = `icono + <div flex-1> + botón lápiz`:
  - Botón: `<Button variant="ghost" size="icon" aria-label="Editar cumplimiento del objetivo"
    data-testid="objective-override-button" onClick={() => setOverrideIndex(index)}><Pencil /></Button>`.
    Siempre habilitado — **sin gate por clave** (el camino sin clave es funcional). Visible en
    todos los breakpoints (§9.2).
  - Bajo el texto, en orden y solo las líneas que apliquen:
    ```tsx
    {results !== null && results[index] !== undefined && (
      <p
        className={cn('text-sm text-muted-foreground', override !== null && 'line-through')}
        data-testid="objective-reason"
        data-overridden={override !== null ? 'true' : undefined}
      >
        {results[index].reason}
      </p>
    )}
    {override !== null && (
      <p className="text-sm text-muted-foreground" data-testid="objective-override-text">
        {override.text}
      </p>
    )}
    ```
- **Diálogo** (render al final de la sección):
  ```tsx
  {overrideIndex !== null && (
    <ObjectiveOverrideDialog
      open
      onOpenChange={(open) => { if (!open) setOverrideIndex(null) }}
      objectiveText={objectives[overrideIndex]}
      initialMet={
        overrides?.[overrideIndex] != null
          ? overrides[overrideIndex]!.met                       // marca vigente
          : objectiveState(overrideIndex) !== 'met'             // contrario al mostrado
      }
      initialComment={overrides?.[overrideIndex]?.comment ?? ''}
      onSubmit={handleOverrideSubmit(overrideIndex)}
    />
  )}
  ```
- **Submit handler**:
  ```ts
  const handleOverrideSubmit = (index: number) => async (met: boolean, comment: string): Promise<boolean> => {
    const result = await window.api.llm.overrideObjective(interviewId, index, met, comment)
    if (result.ok) {
      onInterviewUpdatedRef.current(result.data)
      toast('Objetivo actualizado')
      return true
    }
    toast.error('No se pudo actualizar el objetivo')
    return false   // el diálogo permanece abierto
  }
  ```
  El envelope nunca rechaza: no hace falta try/catch. Reutiliza el `onInterviewUpdatedRef`
  existente.
- Actualizar el docstring del componente (la nota "Sin tachado…" de SPEC-025 queda matizada: el
  tachado ahora existe como historial del override, con `data-overridden` como canal no visual).

## 6. Riesgos y gotchas

1. **El envelope nunca rechaza**: los fallos llegan como `{ ok: false, error }`; no envolver el
   invoke en try/catch ni asumir rejections.
2. **Patrón set-state-in-effect**: no sincronizar el estado del formulario con effects; usar el
   remontaje de `DialogContent` (patrón `InterviewFormDialog`). Nunca `setState` síncrono en un
   `useEffect`.
3. **Atomicidad marca+texto vs coste**: `recordInterviewUsage` y `setInterviewObjectiveOverride`
   son dos `mutate` distintos; mismo trade-off aceptado en SPEC-025 — mantener el orden
   coste→persistencia y el comentario que lo justifica.
4. **Invariante con condiciones independientes**: anular `objectiveOverrides` aunque
   `objectiveResults` ya sea null. No fusionar en un solo `if`.
5. **Desalineación del array**: rebase a `objectives.length` en cada escritura; en el renderer,
   leer siempre con `overrides?.[index] ?? null`.
6. **Tooltip sobre disabled**: no aplica aquí (el lápiz nunca se deshabilita).
7. **Modelo**: jamás `temperature`/`top_p`/`top_k`/`budget_tokens` con `claude-opus-4-8`.
   Mantener `thinking adaptive` + filtrado del bloque thinking + check de `stop_reason`.
8. **`radix-ui` unificado**: los componentes nuevos importan de `'radix-ui'` (1.6.1 ya
   instalado), **no** de `@radix-ui/react-*`. Copiar el estilo de `dialog.tsx` (funciones con
   `data-slot`, sin forwardRef).
9. **`cn` para el tachado condicional**: importar `cn` de `@/lib/utils` en `ObjectivesSection`.
10. **mockApi de tests**: `tests/helpers/mockApi.ts` deberá ganar `llm.overrideObjective` cuando
    `/somo-qa-dev` genere los tests — solo mencionarlo; los tests NO son parte de esta
    implementación.
11. **`updatedAt` intacto**: `setInterviewObjectiveOverride` no toca `updatedAt` (patrón
    `setInterviewObjectiveResults`/`addInterviewAiUsage`: no reordena el listado de capturas).
12. **Botón "Evaluar objetivos" y overrides**: si hay overrides sin evaluación y el usuario
    evalúa, los overrides prevalecen visualmente y **se conservan** — la precedencia del renderer
    ya lo garantiza; no añadir limpieza de overrides en `setInterviewObjectiveResults`.
