# Plan de implementación — SPEC-041 Panel de sugerencias arriba al grabar

> Plan autorado por el orquestador. Spec: `specs/SPEC-041-panel-sugerencias-arriba.md`.
> Solo renderer. Sin cambios en main/preload/tipos IPC. Sin dependencias nuevas.

## 1. `components/recording/RecordingSection.tsx`

- `RecordingSectionProps` gana `variant?: 'interview' | 'capture'`. El router por prop pasa a:
  - `controller` definido → `RecordingSectionView` con `variant={props.variant ?? 'capture'}`
    (compatibilidad: CaptureDetailPage no cambia).
  - sin `controller` → `SelfControlledRecordingSection` (variant 'interview', como hoy).
- `RecordingSectionView`: eliminar el bloque `<AssistantPanel …/>` del estado Grabando (y su
  import). El comentario de SPEC-016 se sustituye por uno que cite SPEC-041 (el panel vive ahora
  en la página). Todo lo demás intacto (Dialog de motivos SPEC-039 incluido).

## 2. Panel compartido — `components/recording/AssistantLiveSection.tsx` (nuevo)

Componente presentacional pequeño para no duplicar el cableado en dos páginas:

```
interface AssistantLiveSectionProps { controller: RecordingController }
```

- Si `!controller.capturing` → `null`.
- Si capturing → `<section data-testid="assistant-live-section">` con el `<AssistantPanel …/>`
  cableado exactamente como estaba en RecordingSectionView (state/queue/error/usage/
  pauseLimitUsd/onSetPinned/onResolveItem/onResume desde `controller.assistant`).

## 3. `pages/InterviewDetailPage.tsx`

- Extraer el branch ready a un componente hijo `InterviewDetailContent` (patrón
  CaptureDetailContent de SPEC-034) que reciba `interview`, `company`, labels y
  `onInterviewUpdated`, y cree `const controller = useRecordingController(interview, onInterviewUpdated)`.
- Orden del JSX: cabecera → `ObjectivesSection` → `<AssistantLiveSection controller={controller}/>`
  → `NoteScriptSections` → `<RecordingSection interview controller={controller} variant="interview" onInterviewUpdated/>`.
- Las funciones `contactLabel`/`templateLabel` pueden quedarse en el padre y pasar los strings
  resueltos, o moverse: lo que menos ruido genere.

## 4. `pages/CaptureDetailPage.tsx`

- Insertar `<AssistantLiveSection controller={controller}/>` justo ANTES de
  `<NoteScriptSections …/>` (el controller ya existe, SPEC-034). Nada más cambia.

## Invariantes a preservar

- El Dialog de motivos (SPEC-039) sigue en RecordingSectionView y funciona igual.
- Transcripción en vivo solo en variant 'interview' dentro de Grabación (SPEC-035).
- El comportamiento del hook useRecordingController no cambia (solo se iza su creación en la
  página de entrevista, exactamente como ya hace la captura).
- Typecheck + lint verdes.
