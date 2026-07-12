# SPEC-035 — Limpieza de UI de la Captura

> Requisito origen: petición directa del humano (2026-07-11), sección «Mejoras en las capturas»
> (mensaje de Nota y transcripción en tiempo real) de `docs/drafts/improvements-20260711.md`
> (checklist H9, ítem 8). Relacionadas: SPEC-017 (mensaje «Graba la entrevista…», que se
> deroga), SPEC-027 (disposición NoteScriptSections), SPEC-015 (área de transcripción en vivo),
> SPEC-034 (variantes capture/interview de RecordingSection), SPEC-020 («misma experiencia» del
> detalle de captura, que se matiza).

## Descripción

Dos limpiezas en la experiencia de captura: (1) desaparece el bloque «Nota / Graba la entrevista
para poder generar la nota.» — cuando no hay nota ni transcripción, la sección Nota simplemente
no se muestra (en captura y en entrevista, misma disposición); (2) durante la grabación de una
captura ya no se muestra el componente de transcripción en tiempo real — el foco durante la
llamada son el asistente y los objetivos, y la transcripción sigue grabándose y persistiéndose
igual, solo deja de pintarse en vivo. El detalle de entrevista clásico conserva su transcripción
en vivo.

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
- Sin cambios de datos ni IPC. La captura de audio, la transcripción (WAV + transcript.json) y el
  asistente no cambian de mecanismo: solo se retira UI.

## Criterios de aceptación

### Mensaje de Nota eliminado

- GIVEN una captura o entrevista con guión pero sin nota y sin transcripción WHEN se muestra su detalle THEN no aparece ninguna sección «Nota» ni el mensaje «Graba la entrevista para poder generar la nota.» (solo la sección Guión).
- GIVEN una captura o entrevista sin guión, sin nota y sin transcripción WHEN se muestra su detalle THEN la disposición actual no cambia (solo la sección Guión) y el mensaje tampoco existe.
- GIVEN una transcripción disponible y sin nota WHEN se muestra el detalle THEN los controles de generación de la nota (select de note-template + «Generar nota») aparecen como hasta ahora.
- GIVEN una nota existente WHEN se muestra el detalle THEN la sección Nota completa aparece como hasta ahora (editor, Exportar, Ver transcripción, Regenerar).

### Transcripción en tiempo real fuera de la captura

- GIVEN una grabación en curso en el detalle de una CAPTURA WHEN se muestra la sección «Grabación» THEN no se renderiza el área de transcripción en tiempo real; el cronómetro, «Detener», el badge de estado de transcripción, el panel del asistente y los medidores de nivel siguen presentes.
- GIVEN una grabación en curso en una captura sin clave de Deepgram WHEN se muestra la sección THEN el aviso de falta de clave (NoKeyAlert) sigue mostrándose.
- GIVEN una grabación de captura detenida WHEN se guarda THEN el transcript.json se persiste igual que siempre y el resumen (latencia, rutas) aparece en la sección — la retirada del área en vivo no afecta a la captura ni a la persistencia.
- GIVEN una grabación en curso en el detalle de ENTREVISTA clásico WHEN se muestra la sección «Grabación» THEN el área de transcripción en vivo sigue mostrándose como hasta ahora, sin cambios.
- GIVEN el asistente en vivo durante la grabación de una captura WHEN produce sugerencias THEN funciona exactamente igual (analiza la transcripción aunque no se pinte).

> Derogaciones:
>
> - El AC de SPEC-017 «GIVEN una entrevista sin grabación ni nota WHEN se abre su detalle THEN la
>   sección "Nota" muestra el estado vacío "Graba la entrevista para poder generar la nota."» y
>   su estado del wireframe quedan obsoletos y deben entenderse derogados: sin transcripción y
>   sin nota, la sección Nota no se muestra.
> - La disposición de SPEC-027 queda ajustada en un caso: «sin nota pero con guión (y sin
>   transcripción) → Guión + controles de generación de la nota, apilados» queda obsoleto y debe
>   entenderse derogado — pasa a «solo Guión». El caso «sin nota pero con transcripción» no
>   cambia (Guión/estado + controles de generación).
> - El AC de SPEC-020 «GIVEN el detalle de una captura WHEN se renderiza THEN aparecen las mismas
>   secciones y en el mismo orden que en el detalle de entrevista…» queda matizado (parcialmente
>   derogado): tras SPEC-034 y esta spec, la captura difiere del detalle de entrevista en los
>   controles de grabación (top bar/cabecera) y en la ausencia del área de transcripción en vivo.
> - El AC de SPEC-015 sobre la transcripción en vivo visible durante la llamada NO se deroga en
>   el detalle de entrevista (sigue vigente allí); en la captura lo sustituyen los ACs de esta
>   spec (RF-AUDIO-003 sigue cubierto: la transcripción en tiempo real existe y alimenta al
>   asistente; deja de pintarse en la captura por decisión del humano).

## UX Design

### Wireframe textual

**Disposición Nota/Guión (ambos detalles)** — la tabla de casos de SPEC-027 queda:

| Estado | Disposición |
|---|---|
| Sin guión, sin nota, sin transcripción | Solo sección Guión (sin cambios) |
| Con guión, sin nota, **sin transcripción** | **Solo sección Guión** (antes: Guión + bloque Nota con el mensaje) |
| Sin nota, **con transcripción** | Guión (si hay/estado) + controles de generación de nota (sin cambios) |
| Con nota y sin guión / con ambos | Sin cambios (apilado / pestañas) |

**Sección «Grabación» de la captura, estado Grabando** (variante capture de SPEC-034):
cronómetro + «Detener» + badge de estado de transcripción → panel del asistente → medidores de
nivel (Micrófono/Sistema) → *(sin área de transcripción en vivo)* → NoKeyAlert si aplica →
selector de micrófono deshabilitado. El detalle de entrevista clásico conserva el área.

### Componentes shadcn utilizados

Sin componentes nuevos; se retira el uso de TranscriptArea en la variante capture (el componente
sigue existiendo para la entrevista).

### data-testid

Sin data-testid adicionales: la ausencia del mensaje y del área en vivo se aserta por texto/rol;
la variante capture ya es distinguible por la página que la monta.

### Patrón de interacción

- **No mostrar secciones vacías sin acción posible** (§7.5 espíritu: un empty state debe tener
  CTA; el mensaje derogado no ofrecía ninguna acción): sin transcripción no hay nada que hacer
  con la Nota, así que la sección no aparece.
- **Feedback del tamaño justo durante la llamada** (RF-ASIS-004): en la captura, quitar el
  chorro de texto en vivo reduce la carga cognitiva; el estado de la transcripción sigue
  comunicado por el badge (funcionando/degradada/error) y los errores por sus Alerts.
- La retirada es solo visual: persistencia y asistente intactos (principio de degradabilidad no
  aplica — no hay degradación, solo menos UI).

### Comportamiento responsive

Sin cambios respecto al comportamiento actual de las páginas implicadas.

## Notas técnicas

- **Mensaje de Nota**: en `NoteScriptSections`, la condición de mostrar la sección Nota pasa de
  `hasNote || hasTranscript || hasScript` a `hasNote || hasTranscript`; la rama del mensaje en
  `NoteSection` (note null y sin transcripción) queda muerta y se elimina. `onNoteChange` y el
  resto de la disposición no cambian.
- **Transcripción en vivo**: en `RecordingSectionView` (SPEC-034), el `TranscriptArea` del bloque
  Grabando se renderiza solo con `variant === 'interview'`. El `NoKeyAlert`
  (`transcriptionStatus === 'no-key'`) y el `TranscriptionStatusBadge` se conservan en ambas
  variantes. `useTranscription` sigue montado igual (alimenta badge, asistente y persistencia).

## Decisiones asumidas

- El mensaje de Nota desaparece en AMBOS detalles (no solo captura) → asumido: la disposición
  NoteScriptSections es compartida y un mensaje sin acción posible tampoco aporta en la
  entrevista; mantener dos disposiciones divergiría sin valor. Alternativa: limitar a captura.
- La transcripción en vivo se retira SOLO de la captura → asumido por el literal («Mejoras en
  las capturas») y porque RF-AUDIO-003 (transcripción en vivo visible) sigue vigente en el
  detalle de entrevista. Alternativa: retirarla también allí (pediría derogar RF-AUDIO-003, fuera
  del alcance de una petición de capturas).
- El badge de estado de transcripción y el NoKeyAlert se conservan en la captura → asumido: son
  señal de salud del pipeline (y de por qué el asistente/nota no funcionarán), no «el componente
  donde aparece la transcripción». Alternativa: retirarlos también.
