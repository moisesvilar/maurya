# Plan de implementación — SPEC-047 Nota con el template del grupo por defecto

> Plan autorado por el orquestador (spec quirúrgica, patrón SPEC-042).
> Spec: `specs/SPEC-047-nota-template-grupo.md`. Solo renderer: `NoteSection.tsx`.
> Sin cambios en main/preload/tipos/canales. Sin tests (los genera QA).

## 1. `src/renderer/src/components/interviews/NoteSection.tsx`

- Estado nuevo junto a `selectedTemplateId` (línea ~78):
  `const [groupNoteTemplateId, setGroupNoteTemplateId] = useState<string | null>(null)`.
- Efecto nuevo (junto a los efectos existentes, patrón setState-en-callback):

```ts
// SPEC-047: template de notas del grupo como preselección. Sin grupo (p. ej.
// capturas) no hay llamada extra; el reset vía microtask respeta
// react-hooks/set-state-in-effect. Envelope con fallo o grupo borrado → null
// (se degrada al primer template, comportamiento SPEC-017).
useEffect(() => {
  const groupId = interview.interviewGroupId
  if (groupId === null) {
    void Promise.resolve().then(() => setGroupNoteTemplateId(null))
    return
  }
  void window.api.db.getInterviewGroup(groupId).then((result) => {
    setGroupNoteTemplateId(result.ok ? result.data.noteTemplateId : null)
  })
}, [interview.interviewGroupId])
```

- `effectiveTemplateId` (líneas 115-119) pasa a cadena de 3 niveles — elección manual del usuario
  → template del grupo (si resuelve en la lista cargada) → primero de la lista:

```ts
/**
 * Template efectivo: el elegido manualmente; si no hay elección, el template
 * de notas del grupo de la entrevista (SPEC-047) cuando resuelve en la lista;
 * en su defecto, el primero del listado (SPEC-017).
 */
const effectiveTemplateId =
  selectedTemplateId !== '' && templates.some((template) => template.id === selectedTemplateId)
    ? selectedTemplateId
    : groupNoteTemplateId !== null &&
        templates.some((template) => template.id === groupNoteTemplateId)
      ? groupNoteTemplateId
      : (templates[0]?.id ?? '')
```

- Nada más cambia: el Select ya usa `effectiveTemplateId` como value en generar y regenerar; la
  elección manual (`setSelectedTemplateId`) sigue mandando; `handleGenerate` ya envía
  `effectiveTemplateId` por IPC. Actualizar el doc-comment del componente con una línea SPEC-047.

## Invariantes a preservar

1. La elección manual del usuario SIEMPRE gana sobre la preselección del grupo.
2. Cero llamadas extra cuando `interviewGroupId` es null (flujo capturas intacto).
3. Envelope: `getInterviewGroup` con `ok: false` (o id de template no presente en la lista) →
   fallback al primero, sin errores ni estados de error nuevos.
4. Sin cambios en el flujo Generar/Regenerar/AlertDialog ni en `noteService`.
5. Typecheck + lint verdes; sin tocar tests/docs.

## Orden de implementación

1. `NoteSection.tsx` (estado + efecto + `effectiveTemplateId` + doc). 2. `npm run typecheck && npm run lint`.
