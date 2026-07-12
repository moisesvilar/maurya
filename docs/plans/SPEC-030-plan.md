# Plan de implementación — SPEC-030: Sección «Grabación» al final del detalle

> Autorado directamente por el orquestador (2026-07-12) con ambas páginas leídas completas:
> el cambio es una reordenación pura de JSX en dos ficheros, sin estado ni datos implicados.

## Pasos

1. **`src/renderer/src/pages/InterviewDetailPage.tsx`**
   - Mover el bloque `<RecordingSection interview={...} onInterviewUpdated={...} />` (hoy entre
     `<ObjectivesSection/>` y `<NoteScriptSections/>`) a después de `<NoteScriptSections/>`.
   - Mover con él el comentario de SPEC-025 si procede y actualizar el JSDoc del componente: hoy
     dice "la sección Grabación … arriba para que durante la llamada el estado quede visible" —
     reescribir para reflejar SPEC-030 (Grabación al final, §8.3: material de archivo).
2. **`src/renderer/src/pages/CaptureDetailPage.tsx`**
   - Mover `<RecordingSection …/>` a después de `<NoteScriptSections …/>` (antes de
     `<AssignCompanySheet …/>`, cuya posición es irrelevante por ser un Sheet controlado, pero se
     mantiene al final del fragmento como está).
   - Actualizar el JSDoc (orden de secciones).
3. `npm run typecheck` + `npm run lint` + prettier sobre los dos ficheros.

## Sin tocar

RecordingSection, NoteScriptSections, ObjectivesSection, main/preload/tipos, ningún otro fichero.

## Gotchas

- `handleInterviewUpdated` es el mismo callback compartido; el orden de los hijos no afecta al
  refresco (estado en la página). Nada más que verificar.
- Tests existentes que asertan orden implícito: probablemente ninguno aserta posición relativa de
  Grabación; si alguno rompe, es de QA Dev adaptarlo (derogación documentada en la spec).
