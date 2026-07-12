# Plan de implementación — SPEC-034: Controles de grabación reubicados en la Captura

> Generado por el subagente planner (2026-07-12) a partir de
> `specs/SPEC-034-controles-grabacion-captura.md`. Hechos verificados: no existe ningún
> createContext/createPortal previo en el renderer; los tests montan las páginas SIN Layout;
> useAudioDevices registra `devicechange` y usePermissions consulta TCC al montar; useCloseGuard
> se suscribe a onCloseRequested — **ninguno de esos hooks puede montarse dos veces**;
> SelectTrigger de shadcn soporta size="sm"; MicSelect lo comparte el spike (retrocompatible).

## 0. Decisiones de arquitectura

### D1 — Estado: extraer `useRecordingController` + prop opcional `controller` en RecordingSection
(a) izar 20 props → doble contrato, descartada. (b) render-props/onControlsState → setState-en-
efecto padre←hijo, patrón vetado, descartada. (c) elegida en forma mínima: hook compuesto
`useRecordingController(interview, onInterviewUpdated)`; en modo entrevista lo crea la propia
sección (comportamiento idéntico, InterviewDetailPage no cambia NI UNA LÍNEA); en modo captura
lo crea el ready-branch de CaptureDetailPage y lo pasa por prop a cabecera, top bar y
`RecordingSection controller={...}`. Sin Context para el controller (prop-drilling de un nivel);
el Context se reserva para el nodo del slot (D2).

**Regla anti doble-montaje**: RecordingSection NO puede llamar al hook y descartarlo cuando llega
controller externo (duplicaría devicechange, onCloseRequested → dos StopOnCloseDialog, consulta
TCC y cleanup de auto-stop). Se garantiza estructuralmente con el split del §7.

### D2 — Top bar: **portal a un nodo provisto por contexto** (callback ref en Layout)
- setContent(ReactNode) en estado de Layout → bucle de renders (elemento nuevo cada render) +
  set-state-in-effect. Descartado.
- getElementById en render → lectura del DOM en render + crash en tests sin Layout. Descartado.
- Elegido: Layout guarda `useState<HTMLElement | null>` alimentado por **callback ref** de un
  contenedor vacío en TopBar; el nodo se publica por `TopBarSlotContext`; la página portala solo
  si el nodo existe → **en tests sin Layout el contexto es null y el portal es no-op**. Mobile:
  mismo nodo — `header` pasa a `min-h-14 flex-wrap gap-y-2 py-2` y el wrapper portalado lleva
  `max-md:order-last max-md:basis-full` (fila propia bajo la fila título/Buscar, mismo header).

### D3 — Sección Grabación (captura, Preparación): los Alerts ya viven FUERA de los bloques de
estado → la variante captura solo omite el bloque «Estado 1 — Preparación»; Grabando/Grabada se
comparten sin duplicar JSX (un boolean `variant`).

### D4 — Ciclo de vida idéntico por construcción: el cleanup de auto-guardado y el close guard se
mueven dentro del controller; en captura se monta en `CaptureDetailContent` (ready-branch), mismo
ciclo que tenía la sección en esa página. InterviewDetailPage intocada.

### D5 — ConsentDialog/StopOnCloseDialog: estado en el controller, render en RecordingSection
(ambas variantes) — Radix portala a body, instancia única; el botón de cabecera llama
`controller.handleStart` y el diálogo se abre igual.

## 1. NUEVO `src/renderer/src/hooks/useRecordingController.ts`

Extracción LITERAL (cortar-pegar, mismo orden de hooks, comentarios y setTimeout(0) intactos) de
las líneas 64–233 de RecordingSection. Contrato `RecordingController`:

```ts
export interface RecordingController {
  permissions: PermissionsSnapshot | null
  devices: AudioInputDevice[]
  selectedDeviceId: string
  setSelectedDeviceId: (deviceId: string) => void
  handleStart: () => void                    // consentimiento SPEC-019 o arranque
  capturing: boolean
  recorded: boolean
  status: CaptureStatus
  elapsedSeconds: number
  levels: AudioLevels
  error: CaptureError | null
  result: StopResult | null
  stop: () => Promise<StopResult | null>
  displayLatency: LatencyStats | null
  requestNewRecording: () => void            // setNewRecordingRequested(true)
  handleShowInFinder: () => void
  transcription: { status; lines; partials; error; degraded }
  assistant: { state; suggestion; error; vote; usage; pauseLimitUsd; sendFeedback; resume }
  consentDialogOpen: boolean
  handleConsentCancel: () => void
  handleConsentConfirm: (dontShowAgain: boolean) => void
  closeDialogOpen: boolean
  cancelClose: () => void
  confirmClose: () => Promise<void>
}
export function useRecordingController(interview, onInterviewUpdated): RecordingController
```

`confirmOverwrite` se queda en la sección (UI local del bloque Grabada);
`resetTranscription`/`resetAssistant`/`clearError` privados del controller (solo startCapture).
El `refresh()` post-TCC usa el usePermissions del propio controller (misma instancia que los
badges de la top bar).

## 2. NUEVO `src/renderer/src/components/layout/TopBarSlot.tsx`

```tsx
export const TopBarSlotContext = React.createContext<HTMLElement | null>(null)
export function TopBarPortal({ children }): React.ReactElement | null {
  const node = React.useContext(TopBarSlotContext)
  if (node === null) return null
  return createPortal(children, node)
}
```

## 3. `Layout.tsx`
`useState<HTMLElement | null>` + Provider envolviendo TopBar+main; `<TopBar slotRef={setNode} />`.

## 4. `TopBar.tsx`
Prop opcional `slotRef?: (node: HTMLDivElement | null) => void`. `header`: `h-14` →
`min-h-14 flex-wrap gap-y-2 py-2` (conserva items-center justify-between border-b px-6). Insertar
ANTES del botón Buscar: `<div ref={slotRef} className="contents" />` (display:contents → el
wrapper portalado participa como flex item directo del header, sin gap fantasma). h1, búsqueda,
⌘K y GlobalSearchDialog sin cambios.

## 5. NUEVO `src/renderer/src/components/recording/CaptureTopBarControls.tsx`
`{ controller: RecordingController }` → `<div data-testid="topbar-capture-controls"
className="flex flex-wrap items-center gap-4 max-md:order-last max-md:basis-full">` con
`<PermissionBadges permissions={...} />` (reutilizado tal cual) y `<MicSelect compact ... />`.

## 6. `MicSelect.tsx`
Prop opcional `compact?: boolean` (default false → cero cambios para spike y sección). Con
compact: sin el span de label apilado (SelectTrigger ya lleva aria-label «Micrófono»),
`size="sm"`, ancho `w-48` en vez de w-full, sin wrapper space-y-1.5.

## 7. `RecordingSection.tsx` — split en tres componentes del mismo fichero

```tsx
export function RecordingSection(props) {
  if (props.controller !== undefined)
    return <RecordingSectionView controller={props.controller} interview={props.interview} variant="capture" />
  return <SelfControlledRecordingSection {...props} />
}
function SelfControlledRecordingSection({ interview, onInterviewUpdated }) {
  const controller = useRecordingController(interview, onInterviewUpdated)
  return <RecordingSectionView controller={controller} interview={interview} variant="interview" />
}
function RecordingSectionView({ controller, interview, variant }) { /* JSX actual */ }
```

(Branch legal: los hooks viven en los hijos; el prop nunca alterna definido↔undefined en vida del
componente.) RecordingSectionView = JSX actual con lecturas desde controller; `confirmOverwrite`
y su AlertDialog aquí (onClick → `controller.requestNewRecording()`); **único condicional
nuevo**: bloque Preparación solo si `variant === 'interview'`. Consent/StopOnClose/Sobrescribir
en ambas variantes.

## 8. `CaptureDetailPage.tsx`
Extraer el ready-branch a `CaptureDetailContent` (privado, mismo fichero; props: interview,
discovery, company, contact, templateLabel, onInterviewUpdated, onAssigned; `assignOpen` se muda
aquí). Dentro:
- `const controller = useRecordingController(interview, onInterviewUpdated)`
- `const preparation = !controller.capturing && !controller.recorded`
- `{preparation && (<TopBarPortal><CaptureTopBarControls controller={controller} /></TopBarPortal>)}`
  (condición FUERA del portal → el testid desaparece del DOM fuera de Preparación).
- Cabecera zona derecha en `div flex flex-wrap items-center gap-2`:
  `{preparation && <Button data-testid="capture-start-button" onClick={controller.handleStart}><Mic /> Iniciar grabación</Button>}`
  (default, a la IZQUIERDA) + botón «Asignar empresa» actual sin cambios.
- `<RecordingSection ... controller={controller} />`.

## 9. NO se tocan
InterviewDetailPage, PermissionBadges, usePermissions, useAudioDevices, useAudioCapture,
useCloseGuard, useConsentPreference, ConsentDialog, StopOnCloseDialog, ConfigSection (spike),
App.tsx, main/preload (sin IPC nuevo).

## 10. Secuencia
1. useRecordingController + split de RecordingSection → typecheck + tests de recording en verde
   (refactor sin cambio observable en modo entrevista).
2. TopBarSlot + Layout + TopBar (slot sin consumidor).
3. MicSelect compact + CaptureTopBarControls.
4. CaptureDetailPage.
5. `npm run typecheck && npm run lint && npm test`.

## 11. Gotchas
- Doble montaje de hooks: garantizado estructuralmente por el split (§7). NUNCA hook-y-descarte.
- Bucle de renders del slot: no usar setContent(ReactNode); portal al nodo por contexto.
- display:contents necesario para el wrap mobile y evitar gap fantasma.
- Efecto `result`: mantener setTimeout(0) + onInterviewUpdatedRef al mover; el reset de
  newRecordingRequested/persistedLatency sigue en ese único efecto.
- El MicSelect deshabilitado del bloque Grabando sigue en la sección; nunca dos selects operables.
- Permisos no concedidos desde cabecera: el Alert destructive aparece en la sección del final
  (aceptado por la spec); sin scroll automático ni alert duplicado.
- Tests que se moverán (adapta QA Dev): CaptureDetailPage.test (botón en cabecera; top bar
  requiere montar Layout), layout tests (clases/prop nuevos), RecordingSection.test vía
  InterviewDetailPage NO debería cambiar.
