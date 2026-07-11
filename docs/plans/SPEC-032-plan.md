# Plan de implementación — SPEC-032: Nombre por defecto de captura con fecha y hora

> Autorado por el orquestador (2026-07-12) con `NewCaptureDialog.tsx` leído completo: el cambio
> vive en un único fichero del renderer.

## Pasos

1. **`src/renderer/src/components/captures/NewCaptureDialog.tsx`**
   - Sustituir `defaultTitlePlaceholder()` por un formateador `defaultCaptureTitle(date: Date)`
     que devuelva `Captura ${dd}-${mes}-${yyyy} ${hh}:${mm}`:
     - `dd`/`hh`/`mm` con cero inicial (`String(...).padStart(2, '0')`).
     - `mes` = `date.toLocaleDateString('es-ES', { month: 'long' })` (minúsculas nativas es-ES).
     - Hora local 24 h (`getHours()`/`getMinutes()`).
   - Placeholder del Input: `defaultCaptureTitle(new Date())` (mismo formateador; sustituye al
     «Captura dd/mm/aaaa» actual).
   - `handleSubmit`: eliminar `titleMissing`/`setShowTitleError` y el error inline del Título;
     `const finalTitle = trimmedTitle === '' ? defaultCaptureTitle(new Date()) : trimmedTitle` y
     enviar `title: finalTitle`. La validación del Discovery se mantiene intacta.
   - Retirar el estado `showTitleError`, el `aria-invalid` del Input y el `<p>` de error del
     Título (ya no hay caso que lo dispare). Actualizar docstrings (SPEC-032).
2. **NO tocar**: `EditCaptureDialog.tsx` (título sigue requerido — decisión asumida),
   `useCaptures`, repositorio, main.
3. `npm run typecheck` + `npm run lint` + prettier.

## Gotchas

- El repositorio de main sigue validando título no vacío: correcto, el renderer ya nunca envía
  vacío.
- Tests de SPEC-020 que asertan «Campo requerido» bajo el Título romperán → los adapta QA Dev
  citando la derogación.
- No usar `toLocaleDateString` para la fecha completa (es-ES produce «12 de julio de 2026»);
  componer manualmente con el mes extraído.
