# SPEC-032 — Nombre por defecto de captura con fecha y hora

> Requisito origen: petición directa del humano (2026-07-11), primera viñeta de la sección
> «Mejoras en las capturas» de `docs/drafts/improvements-20260711.md` (checklist H9, ítem 5).
> Relacionada: SPEC-020 (Dialog «Nueva captura»; deroga la obligatoriedad de su Título).

## Descripción

Al crear una captura, el título deja de ser obligatorio: si el usuario lo deja vacío, la captura
se crea con el nombre «Captura dd-mmmm-yyyy hh:mm» usando la fecha y hora locales del momento de
creación (inicio de la captura), con el mes en español. Escribir un título sigue funcionando
exactamente igual.

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
- Sin cambios de datos ni IPC: el título por defecto se calcula en el renderer al enviar el
  formulario y viaja por el flujo de creación existente.

## Criterios de aceptación

### Creación con nombre por defecto

- GIVEN el Dialog «Nueva captura» con el Título vacío y un discovery seleccionado WHEN el usuario pulsa «Crear» THEN la captura se crea sin error con el título «Captura dd-mmmm-yyyy hh:mm» correspondiente al momento de la creación (p. ej. «Captura 12-julio-2026 09:41»).
- GIVEN el Título con solo espacios en blanco WHEN el usuario pulsa «Crear» THEN se comporta igual que vacío (nombre por defecto, sin error).
- GIVEN el nombre por defecto generado WHEN se examina su formato THEN el día y la hora llevan cero inicial (dd, hh), el mes es su nombre completo en español en minúsculas (enero…diciembre) y la hora es local en formato 24 h separada por «:».

### Comportamiento intacto

- GIVEN el Dialog con un Título escrito WHEN el usuario pulsa «Crear» THEN la captura se crea con ese título literal (recortado de espacios), como hasta ahora.
- GIVEN el Dialog sin discovery seleccionado WHEN el usuario pulsa «Crear» THEN se muestra el error inline «Campo requerido» bajo Discovery y no se crea nada (el título vacío ya no bloquea, pero el discovery sí).
- GIVEN el campo Título WHEN se muestra el Dialog THEN su placeholder anuncia el formato del nombre por defecto con la fecha/hora actuales (p. ej. «Captura 12-julio-2026 09:41»).
- GIVEN el Dialog «Editar» de una captura WHEN se deja el Título vacío y se guarda THEN el comportamiento actual no cambia (error «Campo requerido»): el default aplica solo a la creación.

> Derogación — los ACs de SPEC-020 «GIVEN el listado de capturas WHEN se pulsa "Nueva captura"
> THEN se abre un Dialog con los campos: Título (Input, requerido)…» y «GIVEN el Dialog de nueva
> captura con título vacío WHEN se pulsa "Crear" THEN se muestra el error inline "Campo
> requerido" bajo el Título y no se crea nada» quedan obsoletos y deben entenderse derogados en
> lo relativo al Título: pasa a ser opcional con nombre por defecto. La obligatoriedad del
> Discovery y el resto del Dialog no cambian.

## UX Design

### Wireframe textual

**Dialog «Nueva captura»** (sin cambios estructurales): Título (Input, ahora opcional, con
placeholder «Captura dd-mmmm-yyyy hh:mm» calculado con la fecha/hora actuales) · Discovery
(Select, requerido) · Plantilla (Select opcional) · pie Cancelar/Crear. Desaparece el error
inline bajo el Título (ya no hay caso que lo dispare en creación).

### Componentes shadcn utilizados

Los ya presentes (Dialog, Input, Select, Button). Sin componentes adicionales.

### data-testid

Sin data-testid adicionales: el Dialog (`new-capture-dialog`), el Input (label «Título») y los
títulos creados son localizables por testid existente/label/text.

### Patrón de interacción

- **Opcional con default útil en vez de requerido**: elimina un paso de fricción del flujo
  capture-first (SPEC-020) — el usuario que abre una captura al vuelo durante una llamada no
  quiere teclear un nombre. El placeholder comunica exactamente qué nombre se aplicará (§5.1:
  mensajes descriptivos).
- El error inline del Discovery se conserva (§5.1, validación on submit).

### Comportamiento responsive

Sin cambios respecto al Dialog actual (mobile: ancho completo con margen shadcn; desktop: ancho
estándar).

## Notas técnicas

- El nombre por defecto se genera en el Dialog al hacer submit con título vacío/blanco:
  `Captura ${dd}-${mes}-${yyyy} ${hh}:${mm}` con fecha local (`Date` del momento de creación) y
  nombre de mes en español (p. ej. vía `toLocaleDateString('es-ES', { month: 'long' })` o tabla
  local). El placeholder reutiliza el mismo formateador (sustituye al actual «Captura
  dd/mm/aaaa»).
- Nada cambia en `useCaptures.createCapture`, el repositorio ni la validación de main (que sigue
  exigiendo título no vacío — el renderer ya nunca envía vacío).

## Decisiones asumidas

- «Inicio de la captura» = momento de creación (submit del Dialog) → asumido: es el único
  instante disponible al nombrar; la grabación puede empezar mucho después o nunca. Alternativa:
  renombrar la captura al iniciar la primera grabación — cambio de comportamiento no pedido.
- Mes en minúsculas y formato 24 h → asumido por convención es-ES (los nombres de mes en español
  van en minúscula; la app es macOS-local). Alternativa: capitalizar el mes.
- El Dialog «Editar captura» conserva el título requerido → asumido: vaciar un nombre existente
  es más probablemente un error que una petición de renombrado automático, y el requisito habla
  del nombre al crear («con la fecha y la hora de inicio»). Alternativa: aplicar también el
  default al editar.
- El error inline del Título desaparece del Dialog de creación (ya no hay caso) → consecuencia
  directa de la derogación.
