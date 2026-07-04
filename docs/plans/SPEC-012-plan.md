# Plan de implementación — SPEC-012: templates de entrevista

> Generado por subagente Plan y aprobado por el orquestador (2026-07-04). Contrato: specs/SPEC-012-templates-entrevista.md. getInterviewTemplate EXISTE en el bridge. Nota de contrato: guidance es `?: string` (no null) → persistir OMITIENDO la clave si vacía; hidratar con `?? ''`.

## 1. Hub
Card de entrevistas → Link a /templates/interview (estructura calcada de la card de notas), descripción "Cuestionarios base para tus entrevistas", fuera opacity-60 y "Disponible próximamente".

## 2. Listado
useInterviewTemplates (clon useNoteTemplates) + duplicateTemplate: create con `${name} (copia)` + phase + blocks tal cual → append + toast "Plantilla duplicada". InterviewTemplatesPage: Volver → /templates; "Nueva plantilla"; List con nombre + Badge outline de fase (solo si phase, PHASE_LABELS: Exploratoria/Problema/Solución) + "N bloques · M preguntas" (singular/plural) + DropdownMenu Editar/Duplicar/sep/Eliminar; empty ClipboardList "Aún no hay plantillas de entrevista"+"Crear primera plantilla"; skeletons; error+Reintentar; AlertDialog "Eliminar plantilla" «nombre».

## 3. Editor de dos niveles
- useInterviewTemplateEditor: EditorQuestion{uid,text,guidance} / EditorBlock{uid,title,guidance,questions} / form{name,phase,blocks}. **Errores en mapas PLANOS por uid** (name, blockTitles, questionTexts) — los UUIDs no colisionan entre niveles. **Un solo pendingFocusUid** para ambos niveles (callback-ref + consumeFocus, nunca autoFocus). addBlock (nace con 1 pregunta, foco al TÍTULO), addQuestion(blockUid) (foco al texto), move acotado POR NIVEL, remove no-op si length<=1 (+limpiar errores anidados). Carga con getInterviewTemplate; hidratación defensiva; snapshot serializado sin uids; save() valida name/títulos/textos → "Campo requerido", pela uids, omite guidance vacía, phase SIEMPRE en el payload (para poder volver a null); toasts "Plantilla creada"/"Cambios guardados".
- Componentes en components/templates/: DisabledTooltip extraído, InterviewTemplateQuestionRow (texto+guía+acciones "Subir/Bajar/Eliminar pregunta"; tooltips "Ya es la primera/última pregunta" / "El bloque necesita al menos una pregunta"), InterviewTemplateBlockCard (cabecera "Bloque N"+acciones bloque con tooltips "Ya es el primer/último bloque" / "La plantilla necesita al menos un bloque"; Título+error; Guía Textarea rows=2; QuestionRows; "Añadir pregunta"). Ids por uid.
- InterviewTemplateEditorPage: clon NoteTemplateEditorPage, LIST_URL /templates/interview, max-w-768; Select de Fase con sentinel 'none' (Radix no admite ''); ayuda muted "Marco metodológico del cuestionario (The Mom Test / Running Lean)"; sticky bar.

## 4. Rutas
templates/interview, /new, /:id (new antes de :id). TopBar ya cubre el prefijo.

## 5. AC→cambio
20 ACs mapeados (tabla del plan).

## 6. Breakage presupuestado
EXACTAMENTE 1: tests/unit/layout/sections.test.tsx it de la card deshabilitada del hub (SPEC-009 AC-09, líneas 96-116: "Disponible próximamente" + closest('a') null). Nadie más referencia esos literales (grep verificado).

## 7. Orden, validación, riesgos
Orden: phaseLabels+DisabledTooltip → hook listado+página → hook editor → QuestionRow → BlockCard → EditorPage → rutas → hub AL FINAL → literales. Validación: typecheck && lint && test (1 rojo exacto) + humo replicando interview-sample.md.
Riesgos: errores planos por uid (no anidar); límites move por nivel (count del bloque para preguntas); foco anidado con un solo pendingFocusUid; guidance omitida vs ''; sentinel 'none'; phase siempre en update; keys por uid; no tocar literales ajenos.
