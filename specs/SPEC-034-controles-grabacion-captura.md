# SPEC-034 — Controles de grabación reubicados en la Captura

> Requisito origen: petición directa del humano (2026-07-11), sección «Mejoras en las capturas»
> (bloque de opciones y botón) de `docs/drafts/improvements-20260711.md` (checklist H9, ítem 7).
> Relacionadas: SPEC-015 (RecordingSection y sus estados), SPEC-020 (detalle de captura +
> «Asignar empresa»), SPEC-019 (aviso de consentimiento), SPEC-030 (Grabación al final),
> SPEC-009/018 (TopBar con «Buscar»).

## Descripción

En el detalle de una captura, los controles de preparación de la grabación cambian de sitio: el
estado de permisos (Micrófono / Audio del sistema) y el selector de micrófono pasan a la top bar
— en pequeño y en horizontal, junto al botón «Buscar» — y el botón «Iniciar grabación» (estilo
primario) pasa a la cabecera de la página, al lado de «Asignar empresa» (estilo secundario). Así
la parte superior de la captura queda dedicada a operar la grabación sin desplazarse hasta la
sección «Grabación» del final. El detalle de entrevista clásico no cambia.

## Alcance de implementación

- Esta spec define **únicamente el código de producción** que debe entregarse: UI (componentes,
  páginas, estados), datos (queries, mutations, schema si aplica) y lógica de negocio asociada.
- **Los tests automatizados están fuera del alcance del implementador.** No se deben escribir tests
  unitarios (Vitest / Testing Library) ni tests end-to-end (Playwright) como parte de esta entrega.
  Los tests los genera la skill `/somo-qa-dev` y los ejecuta `/somo-qa-tester` contra el código ya
  commiteado, en un paso posterior del pipeline de QA de SOMO. Cualquier test que el implementador
  entregue será descartado o reemplazado.
- Si la spec requiere algún ajuste de schema, migración Supabase o cambio de RLS, se indica
  explícitamente en "Notas técnicas". Si no se indica, no hay cambios de infraestructura.
- Sin cambios de datos ni IPC: es una reubicación de controles del renderer. El flujo de
  grabación (hooks, consentimiento, canales `recording:*`) no cambia de mecanismo.

## Criterios de aceptación

### Top bar en la captura (estado Preparación)

- GIVEN una captura sin grabación en curso ni grabación asociada WHEN se muestra su detalle THEN la top bar presenta, en horizontal y tamaño compacto junto al botón «Buscar»: el estado de permisos «Micrófono» y «Audio del sistema» (Badge Concedido verde / No concedido destructive) y el selector de micrófono.
- GIVEN el selector de micrófono de la top bar WHEN el usuario elige un dispositivo THEN esa selección es la que usa «Iniciar grabación» (misma semántica que tenía el selector dentro de la sección).
- GIVEN cualquier otra página (Discoveries, Ajustes, listado de capturas, detalle de entrevista) WHEN se muestra THEN la top bar no presenta controles de grabación (solo su contenido actual).

### Botón «Iniciar grabación» en la cabecera

- GIVEN una captura sin empresa asignada y en estado Preparación WHEN se muestra la cabecera THEN aparecen «Iniciar grabación» (Button variant default, icono Mic) y a su lado «Asignar empresa» (variant outline), ambos en la zona derecha de la cabecera.
- GIVEN una captura con empresa asignada y en estado Preparación WHEN se muestra la cabecera THEN aparece «Iniciar grabación» sin «Asignar empresa».
- GIVEN el botón «Iniciar grabación» de la cabecera WHEN el usuario lo pulsa THEN el flujo es exactamente el actual: aviso de consentimiento (SPEC-019) salvo preferencia activa, y arranque de la captura con el micrófono seleccionado.

### Estados Grabando y Grabada

- GIVEN la grabación en curso WHEN se muestra el detalle de la captura THEN la top bar deja de mostrar los controles de preparación y la cabecera no muestra «Iniciar grabación»; la sección «Grabación» del final presenta la sesión en curso como hasta ahora (cronómetro, Detener, asistente, medidores, transcripción, selector deshabilitado).
- GIVEN una captura con grabación asociada (estado Grabada) WHEN se muestra el detalle THEN ni la top bar ni la cabecera muestran controles de grabación; la sección «Grabación» conserva su resumen y el botón «Nueva grabación».
- GIVEN el estado Grabada WHEN el usuario confirma «Nueva grabación» THEN la captura vuelve al estado Preparación y los controles reaparecen en la top bar y la cabecera.

### Sección «Grabación» de la captura (sin duplicados)

- GIVEN una captura en estado Preparación WHEN se muestra la sección «Grabación» del final THEN ya no presenta los Badges de permisos, ni el selector de micrófono, ni el botón «Iniciar grabación» (viven arriba); los Alerts de error de captura/transcripción siguen mostrándose en la sección.
- GIVEN el detalle de entrevista clásico (/discoveries/…/interviews/:id) WHEN se muestra en estado Preparación THEN la sección «Grabación» conserva sus controles actuales (Badges, selector y botón dentro de la sección), sin cambios.

### Sin regresiones de flujo

- GIVEN los permisos no concedidos WHEN el usuario pulsa «Iniciar grabación» en la cabecera THEN el bloqueo y el Alert destructive actuales se comportan igual (el Alert aparece en la sección «Grabación»).
- GIVEN la navegación fuera del detalle con grabación en curso WHEN ocurre THEN el auto-guardado al desmontar funciona como hasta ahora.

## UX Design

### Wireframe textual

**Top bar (solo en /captures/:id, estado Preparación)** — zona derecha, antes del botón «Buscar»:

`Micrófono [Badge] · Audio del sistema [Badge] · [Select micrófono compacto] | [Buscar ⌘K]`

- Badges con los literales actuales («Concedido» verde / «No concedido» destructive), etiqueta en
  `text-sm`; conjunto en una sola línea horizontal con separación compacta (`gap`), sin envolver
  la top bar a dos alturas en desktop.
- Selector de micrófono: el Select actual en tamaño compacto (`size="sm"` del SelectTrigger o
  ancho reducido ~w-48), `aria-label` «Micrófono».

**Cabecera del detalle de captura** (zona derecha, donde hoy vive «Asignar empresa»):

- Estado Preparación: `[Iniciar grabación (default, icono Mic)] [Asignar empresa (outline, solo
  sin empresa)]`.
- Estados Grabando/Grabada: solo «Asignar empresa» (si aplica), como hoy.

**Sección «Grabación» del final (captura)**: estado Preparación queda reducido a los Alerts de
error si los hay (sin Badges/selector/botón); estados Grabando y Grabada sin cambios.

**Detalle de entrevista clásico**: sin cambios en ninguna zona.

### Componentes shadcn utilizados

Los ya presentes: Badge, Select, Button, Alert, AlertDialog, Toast. Sin componentes adicionales.
Iconos Lucide: Mic, Search (existentes).

### data-testid

- `topbar-capture-controls` — el contenedor de los controles compactos de la top bar.
- `capture-start-button` — el botón «Iniciar grabación» de la cabecera.
- (existentes) `assign-company-button`, y los locators por role/text de Badges y Select.

### Patrón de interacción

- **Acciones globales de la página a la top bar** (§2 regla 4: la top bar contiene acciones
  globales a la derecha): el estado de permisos y el micrófono son configuración transversal de
  la captura, no contenido de una sección; en pequeño y horizontal por petición literal del
  humano. Excepción justificada al design system: la top bar gana contenido específico de una
  ruta — se acota a /captures/:id y se documenta (la alternativa, dejarlos en la sección,
  contradice el requisito).
- **Acción primaria en la cabecera**: «Iniciar grabación» es LA acción de una captura recién
  creada; primario junto al secundario «Asignar empresa» (§5.3, primario/secundario visualmente
  distintos).
- **Los controles siguen el estado de la grabación** (visibles solo en Preparación): mismos
  estados derivados de SPEC-015; evita duplicar un selector deshabilitado en dos sitios durante
  la grabación (el de la sesión en curso ya aparece en la sección, como hoy).
- Consentimiento, errores y toasts: mecanismos existentes sin cambios (SPEC-019/015).

### Comportamiento responsive

- **Mobile (< md):** la top bar no puede alojar los controles sin romper su altura → los
  controles compactos se muestran en una fila propia bajo la top bar (mismo contenedor visual,
  wrap), manteniendo «Iniciar grabación» visible en la cabecera (nunca se oculta la acción
  primaria, §9.2).
- **Tablet (md-lg):** interpolado; si caben en la top bar, en línea.
- **Desktop (lg+):** layout completo del wireframe (todo en línea en la top bar).

## Notas técnicas

- **Mecanismo de inyección en la top bar**: decisión del plan (slot por contexto de layout o
  portal a un contenedor de la TopBar). Restricciones: el estado (permisos, dispositivos,
  selección, start/consentimiento) debe tener una única fuente de verdad compartida entre top
  bar, cabecera y RecordingSection de la captura — hoy vive dentro de RecordingSection
  (usePermissions/useAudioDevices/useAudioCapture…), así que habrá que izarlo a
  CaptureDetailPage o exponerlo por contexto. El detalle de entrevista clásico debe seguir
  funcionando con el estado interno actual (variante/prop de RecordingSection o composición).
- El refresh de permisos tras el intento de arranque (prompts TCC) y el timestamp de
  consentimiento se conservan tal cual (SPEC-015/019).
- Los tests existentes de RecordingSection montan la sección vía las páginas de detalle; la
  variante de captura moverá locators (los adapta QA Dev).

## Decisiones asumidas

- Solo la página de captura (/captures/:id): el detalle de entrevista clásico conserva los
  controles dentro de la sección → asumido por el literal («Las opciones en la página de
  Captura»). Alternativa: unificar ambas páginas.
- Los controles de la top bar solo en estado Preparación → asumido: durante la grabación el
  selector no es operable (hoy se muestra deshabilitado dentro de la sesión) y en Grabada no hay
  nada que configurar; mantenerlos siempre añadiría controles muertos a la top bar. Alternativa:
  mostrarlos siempre con disabled.
- En mobile los controles bajan a una fila bajo la top bar → asumido (§9.2 y altura fija h-14 de
  la top bar). Alternativa: DropdownMenu compacto.
- «Iniciar grabación» a la IZQUIERDA de «Asignar empresa» → asumido por §5.3 (primario a la
  derecha aplica a formularios/sticky bars; en cabecera se listan por prominencia — el orden del
  requisito «al lado del botón asignar empresa» no fija lado, se elige primario primero).
  Alternativa: primario a la derecha.
