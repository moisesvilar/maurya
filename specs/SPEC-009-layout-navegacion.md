# SPEC-009 — Layout de navegación principal y UI base

> Requisito origen: NFR §4.3 (UI en español) + patrones de navegación del design system · Hito H1 ítem 6 · Checklist: "UI base en español y layout de navegación principal"
> Relacionados: SPEC-007/008 (Ajustes pasa a vivir bajo el layout), H2 (Discoveries y Plantillas de entrevista rellenarán sus secciones), RF-APP-005 (búsqueda en top bar queda para H7)
> Naturaleza: feature de producto con UI. Cierra el shell de la app (H1).

## Descripción

Da a Maurya su estructura definitiva de navegación: un sidebar persistente con las secciones de la app (Discoveries, Plantillas de entrevista, Captura y Ajustes), un top bar con el título de la sección activa, y el contenido de cada sección dentro de ese marco. Captura (el harness actual) y Ajustes quedan plenamente funcionales; Discoveries y Plantillas de entrevista muestran páginas preparadas con su empty state a la espera de H2. Toda la UI del shell está en español.

## Alcance de implementación

- Esta spec define **únicamente el código de producción** que debe entregarse: UI (componentes, páginas, estados), datos (queries, mutations, schema si aplica) y lógica de negocio asociada.
- **Los tests automatizados están fuera del alcance del implementador.** No se deben escribir tests unitarios (Vitest / Testing Library) ni tests end-to-end (Playwright) como parte de esta entrega. Los tests los genera la skill `/somo-qa-dev` y los ejecuta `/somo-qa-tester` contra el código ya pusheado, en un paso posterior del pipeline de QA de SOMO. Cualquier test que el implementador entregue será descartado o reemplazado.
- Si la spec requiere algún ajuste de schema, migración Supabase o cambio de RLS, se indica explícitamente en "Notas técnicas". Si no se indica, no hay cambios de infraestructura. **Sin Supabase.**
- **Matiz:** sin búsqueda en top bar (RF-APP-005, H7), sin drawer mobile (app desktop-only), sin avatar/cuenta (app monousuario local). Los CRUD de Discoveries/Plantillas de entrevista son H2: aquí solo sus páginas contenedoras con empty state.

## Criterios de aceptación

### Sidebar

- GIVEN cualquier sección de la app WHEN se muestra THEN el sidebar está presente a la izquierda con los items "Discoveries", "Plantillas", "Captura" y "Ajustes", cada uno con su icono, y `role="navigation"` con `aria-label "Navegación principal"`.
- GIVEN el sidebar WHEN el usuario pulsa un item THEN navega a esa sección y el item queda visualmente marcado como activo (indicador no basado solo en color: fondo + peso tipográfico).
- GIVEN el sidebar expandido WHEN el usuario pulsa el botón de colapso (aria-label "Colapsar navegación") THEN el sidebar se reduce a solo iconos y el estado persiste tras recargar la app (localStorage).
- GIVEN el sidebar colapsado WHEN el usuario pulsa el botón de expansión THEN vuelve a mostrarse con etiquetas.
- GIVEN el sidebar colapsado WHEN el usuario hace hover sobre un item THEN un Tooltip muestra el nombre de la sección.

### Top bar

- GIVEN cualquier sección WHEN se muestra THEN el top bar presenta el título de la sección activa ("Discoveries", "Plantillas", "Captura" o "Ajustes").

### Rutas y secciones

- GIVEN la app recién abierta WHEN carga THEN muestra la sección Captura (home provisional hasta H2).
- GIVEN la sección Discoveries WHEN se muestra THEN presenta el empty state "Aún no hay discoveries" con el texto secundario "La gestión de discoveries llegará en la siguiente fase" (sin CTA funcional todavía).
- GIVEN la sección Plantillas WHEN se muestra THEN presenta la página con dos accesos: "Plantillas de entrevista" (empty state "Disponible próximamente") y un enlace "Plantillas de notas" que lleva a la pestaña correspondiente de Ajustes.
- GIVEN la sección Ajustes bajo el layout WHEN se muestra THEN conserva sus pestañas y funcionalidad de SPEC-007/008, y **ya no muestra el back button "Volver"** (la navegación la da el sidebar).
- GIVEN el editor de plantilla de notas WHEN se muestra THEN conserva su back button "Volver" (es una página de detalle/flujo) y se renderiza también bajo el layout.
- GIVEN la pantalla de Captura bajo el layout WHEN se muestra THEN el harness funciona igual que hasta ahora y **ya no muestra su botón de engranaje** (Ajustes se alcanza por el sidebar).

### Idioma

- GIVEN el shell completo (sidebar, top bar, títulos, empty states) WHEN se muestra THEN todos los textos están en español.

### Edge case

- GIVEN una ruta inexistente WHEN se navega a ella THEN se muestra una página 404 en español ("Página no encontrada") con enlace "Ir a Captura".

## UX Design

### Wireframe textual

**Layout global** (todas las rutas): sidebar izquierdo fijo + top bar + área de contenido (`role="main"`).

1. **Sidebar** (ancho ~240px expandido / ~64px colapsado):
   - Cabecera: marca "Maurya" (texto semibold; solo "M" al colapsar).
   - Items (icono Lucide + label): "Discoveries" (FolderSearch), "Plantillas" (FileText), "Captura" (Mic), "Ajustes" (Settings). Item activo: fondo `accent` + texto `font-medium`.
   - Pie: Button ghost icon (PanelLeftClose/PanelLeftOpen, aria-label "Colapsar navegación"/"Expandir navegación").
2. **Top bar** (`role="banner"`, altura ~56px, borde inferior): título de la sección (`h1`, text-lg font-semibold). Sin más elementos en esta spec.
3. **Contenido**: cada página conserva su layout interno actual (Captura y editor: centrado max-width 640; Ajustes: sus tabs; nuevas secciones: contenedor estándar con padding p-6).

**Página Discoveries**: empty state centrado (icono FolderSearch, "Aún no hay discoveries", secundario muted "La gestión de discoveries llegará en la siguiente fase").

**Página Plantillas**: dos Cards una junto a otra: "Plantillas de entrevista" (icono ClipboardList, texto "Disponible próximamente", Card con apariencia deshabilitada) y "Plantillas de notas" (icono FileText, descripción corta, click → `/settings?tab=note-templates`; Card clicable con hover).

**Página 404**: centrado, "Página no encontrada", Button link "Ir a Captura".

**Cambios en páginas existentes**: SettingsPage pierde el back button "Volver" y su `h1` "Ajustes" (el título lo da el top bar; las tabs suben al inicio del contenido). SpikeAudioCapturePage pierde el botón engranaje y su `h1` (título en top bar). NoteTemplateEditorPage se mantiene íntegra (incluido su "Volver" y su `h1` propio, por ser flujo de detalle) pero renderizada bajo el layout.

### Componentes shadcn utilizados

Ya instalados: `Button`, `Tooltip`, `Card`, `Badge`, `Tabs`, resto del catálogo previo. **No se requieren componentes nuevos** (el sidebar se construye con primitivas + Tailwind; no usar el componente `sidebar` de shadcn, sobredimensionado para 4 items fijos — decisión documentada).

### Patrón de interacción

- **Sidebar siempre presente** (app con 4 secciones — regla de navegación 2.1), colapsable a iconos con persistencia en localStorage (regla 9.3).
- **Sin back button en secciones raíz** (Ajustes, Captura): la navegación la da el sidebar; back button solo en detalle (editor de plantilla) — regla 2.3.
- **Tooltip en items colapsados** (los iconos deben ser autoexplicativos, regla 10; el tooltip refuerza).
- **Item activo con fondo + peso** (nunca solo color — regla 11.4). Determinado por la ruta (prefijo: `/settings/*` marca Ajustes).
- **404 con salida** (nunca callejón sin salida).
- **Sin drawer mobile**: excepción desktop-only documentada en SPEC-001.

### Comportamiento responsive

- **Desktop (lg+):** layout completo. La ventana Electron mínima (720×640) convive con el sidebar colapsado si hace falta; por debajo de `lg` el sidebar arranca colapsado por defecto (regla 9.3 adaptada a ventana estrecha).
- **Tablet/Mobile:** no aplican (excepción documentada).

## Notas técnicas

- **Estructura:** componente `Layout` (sidebar + top bar + `<Outlet/>`) como ruta padre en `App.tsx`; todas las rutas actuales pasan a hijas. `HarnessRoute` desaparece (ya no hay prop `onOpenSettings`; el botón engranaje se elimina — la prop opcional puede quedar sin uso o retirarse).
- **Título del top bar:** derivado de la ruta activa (mapa ruta→título; `/settings/note-templates/*` muestra "Ajustes").
- **Persistencia del colapso:** `localStorage` clave `maurya:sidebar-collapsed`; default expandido (colapsado si `window.innerWidth < 1024` al primer arranque).
- **Regresión de contrato esperada en tests** (para QA, no para el dev): SettingsPage sin "Volver"/h1 y harness sin engranaje romperán asserts de SPEC-007/008 (montajes y textos); el editor ahora podría requerir el layout en el montaje si se testea vía rutas reales. QA los adaptará como regresión de contrato documentada.
- **Divergencia de stack:** igual que specs previas.
