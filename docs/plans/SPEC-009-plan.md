# Plan de implementación — SPEC-009: layout de navegación principal

> Generado por subagente Plan y aprobado por el orquestador (2026-07-04). Contrato: specs/SPEC-009-layout-navegacion.md. Sin deps nuevas (sidebar a mano; NO el componente sidebar de shadcn).

## 1. Nuevos
- `hooks/useSidebarCollapsed.ts`: lazy init (localStorage `maurya:sidebar-collapsed`; primer arranque: innerWidth<1024); toggle persiste; try/catch defensivo.
- `components/layout/Sidebar.tsx`: nav role=navigation aria-label "Navegación principal"; w-60/w-16; marca Maurya/"M"; items NavLink (Discoveries FolderSearch, Plantillas FileText, Captura Mic, Ajustes Settings) — activo bg-accent + font-medium; prefijo marca /settings/*; Tooltip side=right SOLO colapsado; pie Button ghost icon PanelLeftClose/Open aria-label "Colapsar/Expandir navegación".
- `components/layout/TopBar.tsx`: header role=banner h-14; h1 con `sectionTitleFor(pathname)` (mapa por prefijo: /settings→Ajustes primero; fallback "Página no encontrada").
- `components/layout/Layout.tsx`: flex h-screen; Sidebar + (TopBar + main role=main flex-1 overflow-y-auto con Outlet). El landmark main SUBE aquí.
- `pages/{DiscoveriesPage,TemplatesHubPage,NotFoundPage}.tsx`: empty state "Aún no hay discoveries"+secundario; hub con 2 Cards (entrevista "Disponible próximamente" deshabilitada; notas → Link /settings?tab=note-templates accesible); 404 "Página no encontrada" + Link "Ir a Captura".

## 2. Rutas (App.tsx)
Layout padre; index → Navigate /capture replace; /capture, /discoveries, /templates, /settings, /settings/note-templates/{new,:id}, * → NotFound (dentro del Layout). HarnessRoute DESAPARECE.

## 3. Páginas existentes
- SettingsPage: fuera "Volver" + h1; tabs al inicio; root main→div sin min-h-screen; nada más.
- SpikeAudioCapturePage: retirar prop onOpenSettings ENTERA + engranaje + h1; main→div; resto intacto (sigue sin Router).
- NoteTemplateEditorPage: íntegra; solo main→div (evitar main anidado).

## 4. AC→cambio
14 ACs mapeados (tabla del plan §4).

## 5. Breakage presupuestado (para QA)
- tests/unit/settings/SpikeAudioCapturePage.settings.test.tsx: archivo ENTERO obsoleto (rompe TS por la prop) → eliminar y remapear SPEC-007 AC-01 como derogado por SPEC-009.
- tests/unit/settings/SettingsPage.test.tsx: 2/7 rompen — test "Volver" (derogado, regla 2.3) y ancla `heading Ajustes` del test de skeletons (sustituir por `tab Claves de IA`).
- tests/unit/note-templates/NoteTemplatesTab.test.tsx: 1 assert `heading Ajustes` (montar bajo Layout o sustituir prueba de no-recarga).
- Resto (editor, spike-audio, spike-transcription, diarization, latency, persistence, packaging): 0 breakage.
- Nota jsdom: innerWidth=1024 por defecto → sidebar expandido en tests; default colapsado testeable con innerWidth=800.

## 6. Orden, validación, riesgos
Orden: hook → Sidebar/TopBar/Layout → páginas nuevas → rutas → harness → settings → editor → literales. Validación: typecheck && lint verdes; test con EXACTAMENTE los 4 fallos presupuestados y ni uno más; humo dev (navegación, colapso+persistencia, tooltips, harness intacto, 404).
Riesgos: URL harness pasa a /capture (probes de QA); doble main (mitigado); TooltipTrigger asChild sobre NavLink (RR7 acepta ref); sticky bar del editor se pega al nuevo scroll container; no tocar literales no derogados.
