# Plan de implementación — SPEC-033: Autogeneración del guión al crear la captura

> Generado por el subagente planner (2026-07-12) a partir de
> `specs/SPEC-033-autogeneracion-guion-captura.md`.

## Resumen de la solución

Se replica el patrón de SPEC-025 (`objectiveEvaluationService`) para el guión: módulo nuevo en
main con `autoGenerateInterviewScript(interviewId)` (síncrona, fire-and-forget) con guards
silenciosos, que reutiliza `generateInterviewScript` de `llmService.ts` sin duplicar nada y
emite eventos tipados por `llm:script-generation` a TODAS las ventanas
(`BrowserWindow.getAllWindows()`, como `emitEvaluationEvent`). El disparo lo hace
`CapturesPage.handleCreate` tras crear la captura, sin await, por el canal
`llm:auto-generate-script`. `ScriptSection` se suscribe (patrón `ObjectivesSection`: filtro por
`interview.id` + ref del callback) y combina `autoGenerating` (eventos) con `generating`
(manual) para el indicador «Generando guión…».

## Decisiones de diseño

1. **Fichero propio** `src/main/scriptAutoGenerationService.ts` (no llmService): consistencia con
   SPEC-025, llmService intocado (cero riesgo sobre SPEC-014/020), módulo pequeño (~70 líneas).
2. **Canal de disparo** `llm:auto-generate-script` con `handleLlm` (envelope `LlmResult<void>`).
   La función es síncrona y devuelve void (patrón `maybeEvaluateAfterRecording`): guards
   síncronos y, si pasan, emite `generating` y suelta la promesa con .then/.catch que emiten
   done/error. El handler resuelve `{ ok: true }` inmediato — nunca espera a la generación.
3. **Guard in-flight propio (`Set<string>`)** además del `inFlight` de llmService: el interno
   deduplica la llamada al LLM pero emitiría eventos duplicados; el Set propio hace el segundo
   disparo silencioso. Una manual en vuelo se adhiere vía el inFlight de llmService — inocuo.
4. **Payload de error `{ interviewId, status: 'error', message }`** (string, literal de la spec;
   divergencia documentada respecto a ObjectiveEvaluationEvent que lleva LlmError): `message` =
   `toLlmError(error).message`.
5. **Sin guard de template en el renderer**: `handleCreate` llama SIEMPRE; main es la única
   autoridad de los guards (una invocación IPC ok-sin-acción es despreciable).
6. **Carrera evento vs. montaje del detalle** (aceptada y documentada): `done` antes del mount →
   el getInterview inicial trae el guión, sin spinner residual (autoGenerating arranca false).
   Mount entre `generating` y `done` → el spinner no aparece en esa ventana de ms, pero
   done/error llegan y refrescan/avisan; jamás queda spinner colgado. Si QA lo señalara, la
   iteración sería un canal pull `llm:get-script-generation-status` (fuera de alcance).

## Cambios fichero a fichero

### 1. `src/main/scriptAutoGenerationService.ts` — NUEVO

Espejo de la parte automática de `objectiveEvaluationService.ts`:
- `emitScriptGenerationEvent(event)`: loop `BrowserWindow.getAllWindows()`, skip
  `webContents.isDestroyed()`, `send('llm:script-generation', event)`.
- `const autoInFlight = new Set<string>()`.
- `export function autoGenerateInterviewScript(interviewId: string): void`:
  1. in-flight → return silencioso.
  2. `repository.getInterview` en try/catch → inexistente = silencioso.
  3. `templateId === null` → silencioso.
  4. `scriptMarkdown !== null` → silencioso (nunca sobrescribir).
  5. `getAnthropicKey() === null` → silencioso.
  6. Sin guard de límite de coste (comentario: captura recién creada = aiUsage cero, decisión de
     la spec).
  7. `autoInFlight.add`; emit `generating`; `generateInterviewScript(interviewId)`
     `.then(updated => emit {status:'done', interview: updated})`
     `.catch(error => emit {status:'error', message: toLlmError(error).message})`
     `.finally(() => autoInFlight.delete(interviewId))`.

### 2. `src/renderer/src/types/llm.ts`

```ts
export type ScriptGenerationEvent =
  | { interviewId: string; status: 'generating' }
  | { interviewId: string; status: 'done'; interview: Interview }
  | { interviewId: string; status: 'error'; message: string }
```
En `LlmApi`: `autoGenerateScript: (interviewId: string) => Promise<LlmResult<void>>` y
`onScriptGeneration: (callback: (event: ScriptGenerationEvent) => void) => () => void`.

### 3. `src/main/ipc.ts`

Tras `llm:evaluate-objectives`:
```ts
// Autogeneración del guión al crear la captura (SPEC-033): fire-and-forget,
// el handler resuelve tras los guards síncronos y jamás espera al LLM.
handleLlm('llm:auto-generate-script', (interviewId: string) => {
  autoGenerateInterviewScript(interviewId)
})
```

### 4. `src/preload/index.ts`

`autoGenerateScript` (invoke) + `onScriptGeneration` (on/removeListener, patrón
`onObjectiveEvaluation`), import type-only de `ScriptGenerationEvent`.

### 5. `tests/helpers/mockApi.ts` — coherencia de tipos (NO es escribir tests)

`createMockLlmApi` implementa `LlmApi` → añadir `autoGenerateScript` (vi.fn resolved ok),
`onScriptGeneration` con registro/cleanup (copia de onObjectiveEvaluation) y
`emitScriptGeneration` en el handle. Sin esto el typecheck de toda la suite rompe.

### 6. `src/renderer/src/components/interviews/ScriptSection.tsx` (quirúrgico)

- `const [autoGenerating, setAutoGenerating] = useState(false)` + `onInterviewUpdatedRef`
  (patrón ObjectivesSection; solo el efecto de eventos usa la ref).
- Suscripción con `const interviewId = interview.id`:
  ```ts
  useEffect(() => {
    return window.api.llm.onScriptGeneration((event) => {
      if (event.interviewId !== interviewId) return
      if (event.status === 'generating') { setAutoGenerating(true); return }
      setAutoGenerating(false)
      if (event.status === 'done') { onInterviewUpdatedRef.current(event.interview); return }
      toast.error(event.message)
    })
  }, [interviewId])
  ```
  En `done` NO tocar `editorResetKey` ni drafts (solo hay done automático sin guión previo →
  editor no montado, drafts prístinos). Sin Toast de éxito. Comentario de la carrera aceptada.
- `const isGenerating = generating || autoGenerating`; sustituir `generating` por `isGenerating`
  en `canGenerate`, `generateButton` (Loader2/«Generando guión…»), la rama de cabecera con guión,
  y el **empty state**: si `isGenerating` → Button disabled Loader2 «Generando guión…» (sustituye
  al botón); si no, botón «Generar guión» actual con `canGenerate`.
- NO alterar testids (`script-regenerate-button`, `script-editor-actions`,
  `script-markdown-editor`), ni el flujo manual, ni el dirty-check de SPEC-029.

### 7. `src/renderer/src/pages/CapturesPage.tsx`

En `handleCreate`, entre `createCapture` y `navigate`:
```ts
// SPEC-033: disparo fire-and-forget de la autogeneración del guión. Main
// aplica los guards (sin plantilla / sin clave / guión presente) en silencio;
// el renderer llama siempre y nunca espera (la navegación no se bloquea).
void window.api.llm.autoGenerateScript(interview.id)
```

## Secuencia

types/llm.ts → scriptAutoGenerationService.ts → ipc.ts → preload → mockApi.ts → ScriptSection →
CapturesPage. Validación: `npm run typecheck && npm run lint && npm test` (suites existentes en
verde sin tocarlas).

## Riesgos y gotchas

- Eventos a TODAS las ventanas, no al sender (AC «navega fuera durante la generación»).
- Eventos duplicados cubiertos por el Set propio.
- No se toca la llamada al SDK (reglas del modelo no aplican).
- AC de coste cubierto gratis (`generateInterviewScript` ya registra usage).
- Flujo empresa (RF-GUION-001) intocado: solo CapturesPage dispara.
- Tests nuevos y extensión de suites: los genera /somo-qa-dev (ScriptSection eventos,
  CapturesPage disparo, servicio main con guards en `@vitest-environment node`).
