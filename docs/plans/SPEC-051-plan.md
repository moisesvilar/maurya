# SPEC-051 — Plan de implementación · Unificar gestión de plantillas en Ajustes

> Plan autorado por el orquestador (reorganización 100 % de renderer, ~10 ficheros de src, sin IPC ni persistencia; precedente de rutas legadas SPEC-020/SPEC-044). Petición humana directa (2026-07-24), traza a RF-APP-005 (mismo RF que la reorganización de navegación de SPEC-048). Deroga el hub de Plantillas de SPEC-009 y la ubicación del listado de SPEC-012.

## Contexto y estado final

Hoy hay dos caminos para gestionar plantillas: la sección **Plantillas** del sidebar (`/templates`, hub con dos cards → `/templates/interview` para entrevistas y `/settings?tab=note-templates` para notas) y **Ajustes > Plantillas de notas**. Se unifica todo en Ajustes:

- Desaparece la sección **Plantillas** del sidebar y el hub `TemplatesHubPage`.
- **Ajustes** pasa a 4 pestañas: `Claves de IA | Plantillas de notas | Plantillas de entrevistas | Prompts personalizados`. Valor de tab nuevo: `interview-templates`.
- Las plantillas de entrevista se gestionan en su pestaña con la **misma UI/UX que la de notas** (`NoteTemplatesTab` es el patrón de referencia): descripción + botón «Nueva plantilla», List con acciones inline, empty/loading/error states, AlertDialog de borrado.
- El editor de plantillas de entrevista (página completa) cuelga de `/settings/interview-templates/new` y `/settings/interview-templates/:id`, en paralelo al de notas (`/settings/note-templates/*`).
- Las rutas legadas `/templates*` redirigen con `Navigate replace` (no 404).

## Decisiones cerradas

1. **Acciones inline en el listado de entrevistas**, no menú «⋯»: Editar (`Pencil`), Duplicar (`Copy`), Eliminar (`Trash2`), como en `NoteTemplatesTab` (que solo tiene 2). Se conserva la funcionalidad de Duplicar de SPEC-012 (inmediata, con Toast, sin diálogo). Al desaparecer el DropdownMenu, **se elimina el mitigador `setTimeout(0)`** de apertura del AlertDialog (existía solo por el incidente Radix dropdown → dialog, SPEC-010): `setPendingDelete(template)` directo.
2. **Redirects de rutas legadas** (`Navigate replace`, precedente SPEC-020/SPEC-044): `/templates` → `/settings?tab=interview-templates` · `/templates/interview` → `/settings?tab=interview-templates` · `/templates/interview/new` → `/settings/interview-templates/new` · `/templates/interview/:id` → `/settings/interview-templates/:id`.
3. **Se conservan** el `Badge` de fase (`PHASE_LABELS`) y el resumen «N bloques · M preguntas» (`formatSummary`) por ítem: la unificación es de patrón, no de contenido.
4. El listado vive en el contenedor `max-w-[640px]` de Ajustes. El editor de entrevistas mantiene su página propia `max-w-768px`. `NoteTemplatesTab` **no se toca**.

## Cambios por fichero

### 1. `src/renderer/src/components/settings/InterviewTemplatesTab.tsx` (NUEVO)

Adaptación de `InterviewTemplatesPage` (se borra, ver §5) al patrón exacto de `NoteTemplatesTab`:

- Sin botón «Volver» (la navegación la dan las tabs) y sin wrapper `p-6` (el padding lo pone `TabsContent` + el contenedor de la página): raíz `div.flex.flex-col.gap-6`.
- Cabecera: `<p>` descriptivo («Cuestionarios base para tus entrevistas: bloques ordenados de preguntas con notas de guía») + Button «Nueva plantilla» → `navigate('/settings/interview-templates/new')`.
- Estados loading (3 Skeleton h-12), error (AlertTriangle + mensaje + «Reintentar» → `reload`) y empty (ClipboardList + «Aún no hay plantillas de entrevista» + «Crear primera plantilla»), copiados tal cual de la página actual.
- Listado `ul.divide-y.rounded-md.border`: por ítem, nombre + Badge de fase (si `phase !== null`) + resumen `formatSummary`; a la derecha, 3 Button `variant="ghost" size="icon"` con `aria-label`: «Editar plantilla» → `navigate('/settings/interview-templates/${id}')`, «Duplicar plantilla» → `void duplicateTemplate(template)`, «Eliminar plantilla» (`className="text-destructive hover:text-destructive"`) → `setPendingDelete(template)`.
- AlertDialog de eliminación idéntico al actual (título «Eliminar plantilla», descripción con el nombre en «», acción destructive).
- El helper `formatSummary` migra aquí desde `InterviewTemplatesPage`. Hooks reutilizados sin cambios: `useInterviewTemplates`, `PHASE_LABELS`.

### 2. `src/renderer/src/pages/SettingsPage.tsx`

- `type SettingsTab` gana `'interview-templates'`; el guard del `?tab=` lo acepta (default sigue siendo `api-keys`).
- Nuevo `TabsTrigger value="interview-templates"` con texto «Plantillas de entrevistas», **entre** «Plantillas de notas» y «Prompts personalizados», y su `TabsContent className="pt-4"` con `<InterviewTemplatesTab />` (sin `forceMount`, como las demás: la pestaña inactiva se desmonta y no dispara cargas).
- Actualizar el comentario de cabecera (SPEC-051: entra la pestaña de plantillas de entrevista, derogando el hub de SPEC-009/012).

### 3. `src/renderer/src/App.tsx`

- Rutas nuevas del editor: `settings/interview-templates/new` y `settings/interview-templates/:id` → `InterviewTemplateEditorPage` (junto a las de note-templates).
- Eliminar las 4 rutas `/templates*` actuales y los imports de `TemplatesHubPage` e `InterviewTemplatesPage`; en su lugar, los 4 redirects de la decisión 2. Para `/templates/interview/:id` hace falta un mini-componente `LegacyInterviewTemplateRedirect` (mismo patrón que `LegacyCompanyRedirect`, ya en este archivo): `useParams` → `<Navigate to={'/settings/interview-templates/' + id} replace />`.
- Actualizar el comentario de cabecera (SPEC-051 deroga /templates; redirects legados).

### 4. `src/renderer/src/pages/InterviewTemplateEditorPage.tsx`

- `const LIST_URL = '/settings?tab=interview-templates'` (antes `/templates/interview`). Volver/Cancelar/guardar comparten la constante: cambio de un punto.
- Actualizar las rutas citadas en el comentario de cabecera (`/settings/interview-templates/new` y `:id`).

### 5. Borrados

- `src/renderer/src/pages/TemplatesHubPage.tsx` (hub SPEC-009, sin más consumidores que App.tsx y tests).
- `src/renderer/src/pages/InterviewTemplatesPage.tsx` (su contenido migra a `InterviewTemplatesTab`).

### 6. `src/renderer/src/components/layout/Sidebar.tsx`

- Quitar `{ to: '/templates', label: 'Plantillas', icon: FileText }` de `NAV_ITEMS` (quedan 4) y el import de `FileText`.
- Actualizar comentarios: el de `NAV_ITEMS` (SPEC-051: Plantillas se muda a Ajustes) y el del propio Sidebar («5 items fijos» → 4).

### 7. `src/renderer/src/components/layout/TopBar.tsx`

- Quitar `{ prefix: '/templates', title: 'Plantillas' }` de `SECTION_TITLES`. `/settings` ya captura los editores por prefijo (título «Ajustes»), y el `NavLink` sin `end` del sidebar mantiene «Ajustes» activo en `/settings/interview-templates/*` sin tocar nada más. Actualizar el comentario.

## Puntos de atención

- `NoteSection.tsx` enlaza a `/settings?tab=note-templates`: no se toca; confirma que `?tab=` como deep-link es el contrato a respetar.
- Los dialogs que consumen `useInterviewTemplates` para el selector de template (`NewCaptureDialog`, `EditCaptureDialog`, `InterviewFormDialog`, `InterviewGroupFormDialog`) no dependen de rutas: cero impacto.
- Comentarios de cabecera que citan SPECs derogadas: actualizarlos donde se toque el fichero (§2, §3, §4, §6, §7), con nota de derogación al estilo SPEC-020/044 — que no queden mintiendo.

## Tests existentes que rompen (los adapta `/somo-qa-dev`, NO el implementador)

Por la cláusula de alcance de la spec, el implementador entrega solo código de producción y **no toca tests** — la suite quedará en rojo hasta la fase de QA, y eso es lo esperado. Este inventario es para `/somo-qa-dev`:

- `tests/unit/interview-templates/InterviewTemplatesPage.test.tsx`: importa `TemplatesHubPage` y monta `/templates*`. Reescribir contra `SettingsPage` + `?tab=interview-templates` (espejo de `tests/unit/note-templates/NoteTemplatesTab.test.tsx`); las aserciones del menú «⋯» pasan a los 3 botones inline por `aria-label`.
- `tests/unit/interview-templates/InterviewTemplateEditorPage.test.tsx`: rutas montadas → `/settings/interview-templates/*`; el probe de la lista pasa a `/settings` (el editor navega a `/settings?tab=interview-templates` al salir).
- `tests/unit/layout/sections.test.tsx` y `tests/unit/layout/Layout.test.tsx`: importan `TemplatesHubPage` y montan `/templates*`. Quitar la sección Plantillas del set esperado del sidebar/top bar y re-mapear las rutas montadas.
- Cobertura nueva (redirects legados, pestaña nueva visible y funcional, editor cuelga de Ajustes): la genera `/somo-qa-dev`, no este plan.
- Actualizar `tests/spec-test-map.json`: los ACs de SPEC-012 trazan a los tests reubicados.

## Fuera de alcance

- Ningún cambio en main/preload/IPC, persistencia, hooks (`useInterviewTemplates`, `useNoteTemplates`, `useInterviewTemplateEditor`) ni en `NoteTemplatesTab` / `NoteTemplateEditorPage`.
- No se añade «Duplicar» a plantillas de notas (sería inventar requisitos).
- Sin e2e (decisión humana 2026-07-03): verificación end-to-end manual con `./start.sh`.

## Riesgos

- Bajo. Los dos puntos con matices: (a) no olvidar ninguno de los 4 redirects legados (el de `:id` requiere el mini-componente); (b) al quitar el DropdownMenu, retirar también el mitigador `setTimeout(0)` — mantenerlo sin menú sería código muerto que confunde.
