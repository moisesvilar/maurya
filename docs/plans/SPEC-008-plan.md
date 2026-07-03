# Plan de implementación — SPEC-008: editor de note-templates

> Generado por subagente Plan y aprobado por el orquestador (2026-07-04). Contrato: specs/SPEC-008-editor-note-templates.md. Sin cambios en main/preload/esquema: todo sobre api.db.*NoteTemplate de SPEC-006.

## 0. Deps
`npx shadcn@latest add tabs textarea card`. Riesgo: la CLI puede importar `@radix-ui/react-tabs` (no instalado) → ajustar a `import { Tabs as TabsPrimitive } from 'radix-ui'` (paquete unificado ya presente, patrón tooltip.tsx). textarea/card sin dependencia Radix (fallback manual trivial).

## 1. Navegación de pestañas: `?tab=` (no sub-ruta)
`/settings?tab=note-templates` con useSearchParams + Tabs controladas (default `api-keys` si falta/ inválido; replace:true). Funciona en MemoryRouter (tests) y HashRouter (empaquetado, search dentro del hash). Volver/Cancelar del editor y post-guardar → `LIST_URL='/settings?tab=note-templates'`.
**Breakage SPEC-007 estimado: 0/7** con tres condiciones: (a) tab default api-keys, (b) SIN forceMount (tab inactiva desmontada → assert de skeletons ===2 sobrevive; listNoteTemplates solo se llama al activar), (c) no renombrar textos/aria-labels de SPEC-007.

## 2. SettingsPage
Mantener Volver/h1; añadir Tabs bajo el h1; TabsContent api-keys = sección actual movida SIN editar; TabsContent note-templates = <NoteTemplatesTab/>. useSecrets se queda en la página.

## 3. Nuevos
- `hooks/useNoteTemplates.ts`: estado loading|error|ready, reload() para Reintentar, removeTemplate → filtra + toast "Plantilla eliminada" / toast.error.
- `components/settings/NoteTemplatesTab.tsx`: descripción muted + "Nueva plantilla" (Plus); List (no Table) con nombre + "N sección(es)" + acciones inline Pencil "Editar plantilla" / Trash2 text-destructive "Eliminar plantilla"; empty (FileText, "Aún no hay plantillas de notas", "Crear primera plantilla"); Skeletons; error (AlertTriangle + Reintentar); AlertDialog "Eliminar plantilla" con «nombre» y Cancelar/Eliminar (pendingDelete controlado).
- `hooks/useNoteTemplateEditor.ts`: EditorSection con `uid` cliente (randomUUID, keys estables, foco direccionable; se pelan al persistir); modos new (form con [blankSection()], snapshot=inicial) / edit (getNoteTemplate → hidratar form+snapshot; error → estado error con Reintentar); isDirty = JSON.stringify sin uids vs snapshot; addSection (+pendingFocusUid), moveSection(uid,±1), removeSection (solo length>1), consumeFocus; validación on submit (nombre y títulos de sección "Campo requerido"; contexto y descripciones opcionales; errores se limpian al teclear); save → create/update con orden visual → toast "Plantilla creada"/"Cambios guardados" → true; ok:false → toast.error → false.
- `components/settings/NoteTemplateSectionCard.tsx`: Card ligera; acciones ChevronUp "Subir sección" / ChevronDown "Bajar sección" / Trash2 "Eliminar sección"; disabled+Tooltip con wrapper span tabIndex=0 (patrón ApiKeyRow): primera/última/única ("La plantilla necesita al menos una sección" literal); Título Input + error inline; Descripción Textarea rows=3.
- `pages/NoteTemplateEditorPage.tsx`: Layout 3 centrado; Volver con guard isDirty → AlertDialog "Descartar cambios" (Cancelar/Descartar destructive); h1 "Nueva plantilla"/"Editar plantilla"; Nombre, Contexto (rows=6 + ayuda "Opcional…"); h3 Secciones + cards; "Añadir sección" outline Plus; sticky bottom bar (Cancelar izq con guard / Guardar der, siempre habilitado) → si save() true, navigate(LIST_URL).

## 4. Rutas
`/settings/note-templates/new` y `/:id` en App.tsx (useNavigate/useParams en la página; siempre bajo Router).

## 5. AC→cambio
22 ACs mapeados (tabla del plan): tabs default, listado/empty/skeleton/error, crear+toast+volver, editar precargado+“Cambios guardados”, añadir con foco (pendingFocusUid + callback ref, NO autoFocus DOM), mover/deshabilitados con tooltip, eliminar sección sin confirmación, validaciones "Campo requerido", contexto opcional, guard descartar/directo, AlertDialog eliminar + toast.

## 6. Orden, validación, riesgos
Orden: shadcn → useNoteTemplates+Tab → SettingsPage Tabs (correr suite SPEC-007 aquí) → editor hook → SectionCard → EditorPage → rutas → pulido de literales. Validación: typecheck && lint && test (todas verdes, sin tests nuevos) + humo dev replicando note-template-sample (6 secciones, reorden, guard, persistencia tras relanzar).
Riesgos: import radix del tabs.tsx; forceMount prohibido; keys por uid (no índice); guard solo en Volver/Cancelar; bridge nunca lanza (DbResult); no tocar textos SPEC-007.
