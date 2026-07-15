# SPEC-041 — Panel de sugerencias arriba durante la grabación

## Descripción

Durante la grabación, el panel del asistente (cola de preguntas sugeridas en tiempo real) deja
de vivir dentro de la sección «Grabación» (al final de la página desde SPEC-030) y pasa a
mostrarse arriba: en el detalle de entrevista, **entre la sección «Objetivos» y las secciones
Nota/Guión**; en el detalle de captura (sin sección Objetivos), **inmediatamente encima de
Nota/Guión**. Fuera de la grabación el panel no se muestra, como hasta ahora. La sección
«Grabación» conserva cronómetro, botón Detener, medidores y (solo en entrevista) la
transcripción en vivo.

Origen: petición humana directa (2026-07-15), §5 de
`docs/drafts/improvements-preguntas-20260715.md`. Evoluciona RF-ASIS-004 (feedback glanceable:
las sugerencias deben estar donde el entrevistador mira, junto a los objetivos).

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
- Cambio solo de renderer (páginas y componentes de recording); main, preload y tipos IPC
  intactos.

## Criterios de aceptación

### Detalle de entrevista

- GIVEN el detalle de entrevista con una grabación en curso WHEN se renderiza la página THEN el panel del asistente aparece DESPUÉS de la sección «Objetivos» y ANTES de las secciones Nota/Guión (orden en el DOM).
- GIVEN una grabación en curso WHEN se renderiza la sección «Grabación» THEN ya no contiene el panel del asistente (el cronómetro, el botón «Detener», los medidores y la transcripción en vivo permanecen).
- GIVEN el detalle de entrevista SIN grabación en curso (preparación) WHEN se renderiza THEN el panel del asistente no aparece en ninguna parte de la página.
- GIVEN una entrevista ya grabada (estado Grabada) WHEN se renderiza THEN el panel del asistente no aparece.

### Detalle de captura

- GIVEN el detalle de captura con una grabación en curso WHEN se renderiza THEN el panel del asistente aparece ANTES de las secciones Nota/Guión (encima del Guión).
- GIVEN el detalle de captura sin grabación en curso WHEN se renderiza THEN el panel no aparece.

### Comportamiento del panel intacto

- GIVEN el panel en su nueva ubicación WHEN llega un evento del asistente con preguntas en cola THEN se renderizan igual que antes (badges, pregunta, porqué, acciones por pregunta de SPEC-039).
- GIVEN el panel en su nueva ubicación WHEN se pulsa una acción de pregunta (p. ej. «Descartar pregunta») THEN se invoca la misma acción del asistente que antes (el cableado no cambia).

### Regresión

- GIVEN una parada de grabación con preguntas descartadas WHEN llega el resultado THEN el Dialog «Preguntas descartadas» (SPEC-039) se abre exactamente igual que antes.
- GIVEN una grabación en curso en el detalle de entrevista WHEN se renderiza la sección «Grabación» THEN el área de transcripción en vivo sigue presente solo ahí (SPEC-035: la captura sigue sin ella).

## UX Design

### Wireframe textual

**Detalle de entrevista (Layout 2 — Detalle), grabando:**

1. Cabecera (título + Badge + referencias) — sin cambios.
2. Sección «Objetivos» (ObjectivesSection) — sin cambios.
3. **Panel del asistente** (Card existente de SPEC-016/036/039, tal cual, sin heading nuevo:
   la Card con borde primary ya lo distingue) — solo mientras se graba.
4. Secciones Nota/Guión (NoteScriptSections) — sin cambios.
5. Sección «Grabación» al final (SPEC-030) — igual pero sin el panel.

**Detalle de captura, grabando:** igual pero sin la sección «Objetivos»: cabecera → panel →
Nota/Guión → Grabación.

### Componentes shadcn utilizados

Componentes: Card, Badge, Button, Tooltip, Alert (todos los del AssistantPanel existente; sin
componentes nuevos).

### data-testid

- `assistant-live-section` — el contenedor del panel en su nueva ubicación (páginas)

El resto de locators del panel (assistant-queue, assistant-queue-item, assistant-item-*,
assistant-pinned-*) no cambian.

### Patrón de interacción

Sin interacciones nuevas: el panel es el mismo componente con las mismas props. La ubicación
sigue la regla de densidad §8.3 (lo más consultado arriba): durante la llamada, objetivos +
siguiente pregunta son el material de trabajo; la Grabación es instrumentación (SPEC-030).

### Comportamiento responsive

- **Mobile (< md):** sin cambios respecto al panel actual (la Card ocupa el ancho del contenido).
- **Tablet (md–lg):** interpolado.
- **Desktop (lg+):** wireframe completo.

## Notas técnicas

- El estado del asistente vive en `useRecordingController` (`controller.assistant`) y hoy solo lo
  consume `RecordingSectionView`. Para que la página pinte el panel, el detalle de entrevista
  debe **izar el controller** (patrón SPEC-034 de CaptureDetailPage: crearlo en el branch ready,
  en un componente hijo para no condicionar hooks) y pasarlo a `RecordingSection` por la prop
  `controller` existente. Eso obliga a desacoplar la prop `controller` de la variante: la
  variante pasa a ser una prop explícita (`variant`), con el default compatible con los usos
  actuales.
- `AssistantPanel` se elimina del JSX de `RecordingSectionView`; las páginas lo renderizan dentro
  de un contenedor `assistant-live-section` condicionado a `controller.capturing`.
- El Dialog de motivos (SPEC-039) permanece en `RecordingSectionView` (su ancla es el resultado
  de la parada, no el panel).

## Decisiones asumidas

- [captura] → asumido aplicar también al detalle de captura (encima de Nota/Guión) por
  consistencia entre superficies (precedente SPEC-030/034); la captura no tiene sección
  Objetivos, así que «entre objetivos y guión» degrada a «encima del guión».
- [visibilidad fuera de grabación] → asumido conservar el comportamiento actual (el panel solo
  existe mientras se graba); el draft no pide mostrarlo en otros estados.
- [sin heading nuevo] → asumido no añadir heading al panel (la Card primary ya lo distingue y
  añadir «Asistente» duplicaría ruido visual); alternativa: heading h3 «Sugerencias».
