# SPEC-019 — Aviso de consentimiento de grabación

> Requisitos origen: NFR §4.6 (aviso/registro de consentimiento, Must) · Riesgo #8 (privacidad/legalidad de grabar conversaciones) · Hito H7
> Relacionados: SPEC-015 (RecordingSection, donde se inicia la grabación real), SPEC-002/016 (transcript.json donde se registra)
> Naturaleza: feature de producto con UI.

## Descripción

Antes de iniciar la grabación de una entrevista, la app recuerda al usuario su responsabilidad legal de informar al interlocutor de que la conversación se graba y transcribe. El usuario confirma para arrancar, puede desactivar el aviso para futuras grabaciones, y el reconocimiento queda registrado con marca de tiempo junto a la transcripción para trazabilidad.

## Alcance de implementación

- Esta spec define **únicamente el código de producción** que debe entregarse: UI (componentes, páginas, estados), datos (queries, mutations, schema si aplica) y lógica de negocio asociada.
- **Los tests automatizados están fuera del alcance del implementador.** No se deben escribir tests unitarios (Vitest / Testing Library) ni tests end-to-end (Playwright) como parte de esta entrega. Los tests los genera la skill `/somo-qa-dev` y los ejecuta `/somo-qa-tester` contra el código ya pusheado, en un paso posterior del pipeline de QA de SOMO. Cualquier test que el implementador entregue será descartado o reemplazado.
- Si la spec requiere algún ajuste de schema, migración Supabase o cambio de RLS, se indica explícitamente en "Notas técnicas". Si no se indica, no hay cambios de infraestructura. **Sin Supabase.**
- **Matices:** la página `/capture` (spike técnico) queda fuera del alcance — su DOM es contractual y no es el flujo real de entrevistas. La reactivación del aviso una vez desactivado queda fuera del MVP (limitación documentada; candidata a opción de Ajustes futura).

## Criterios de aceptación

### Aviso antes de grabar

- GIVEN el aviso no desactivado WHEN el usuario pulsa "Iniciar grabación" en una entrevista THEN se muestra el diálogo "Aviso de grabación" con el recordatorio legal y la grabación NO se inicia todavía.
- GIVEN el diálogo abierto WHEN el usuario pulsa "Entendido, iniciar grabación" THEN el diálogo se cierra y la grabación arranca con el flujo normal (mismo comportamiento que SPEC-015).
- GIVEN el diálogo abierto WHEN el usuario pulsa "Cancelar" (o Escape) THEN el diálogo se cierra, la grabación no se inicia y no se persiste ninguna preferencia.

### Desactivar el aviso

- GIVEN el diálogo abierto con la casilla "No volver a mostrar este aviso" marcada WHEN el usuario confirma THEN la preferencia queda persistida y la grabación arranca.
- GIVEN la preferencia de no mostrar activa WHEN el usuario pulsa "Iniciar grabación" THEN la grabación arranca directamente sin diálogo.
- GIVEN la preferencia de no mostrar activa WHEN se cierra y reabre la app THEN la preferencia sigue activa.
- GIVEN el diálogo confirmado con la casilla sin marcar WHEN el usuario inicia otra grabación después THEN el aviso vuelve a aparecer.
- GIVEN el diálogo cancelado con la casilla marcada WHEN el usuario vuelve a pulsar "Iniciar grabación" THEN el aviso aparece de nuevo (cancelar no persiste la casilla).

### Registro de trazabilidad

- GIVEN una grabación iniciada tras confirmar el aviso (o con el aviso desactivado) WHEN se detiene y se persiste la transcripción THEN el archivo de transcripción incluye el registro de consentimiento con la marca de tiempo del inicio.
- GIVEN una grabación desde la página del spike (`/capture`) WHEN se persiste la transcripción THEN el registro de consentimiento queda vacío (null) sin error.

## UX Design

### Wireframe textual

1. **Diálogo "Aviso de grabación"** (AlertDialog, se abre al pulsar "Iniciar grabación" en la sección Grabación del detalle de entrevista):
   - Título: "Aviso de grabación".
   - Descripción: "Vas a grabar y transcribir esta conversación. Es tu responsabilidad informar a tu interlocutor y contar con su consentimiento antes de empezar."
   - Debajo de la descripción: Checkbox con label "No volver a mostrar este aviso".
   - Botones: "Cancelar" (variant outline, foco inicial) + "Entendido, iniciar grabación" (variant default — no es destructiva, es una confirmación informada).
2. **Sección Grabación** (SPEC-015): sin cambios visibles fuera del diálogo; el botón "Iniciar grabación" conserva textos, estados y bloqueo por permisos.

### Componentes shadcn utilizados

`AlertDialog`, `Checkbox`, `Button`.

**Componente adicional necesario:** `Checkbox` **no está instalado** en el scaffold (primitivo del paquete `radix-ui` ya presente; sin dependencias npm nuevas).

### Patrón de interacción

- **AlertDialog** (regla 6.3): acción con consecuencia legal que requiere confirmación explícita antes de ejecutarse; Escape/click fuera = Cancelar, nunca inicia la grabación.
- **Botón de confirmación con verbo** ("Entendido, iniciar grabación"), variant `default` y no `destructive`: iniciar una grabación no es destructivo — excepción deliberada al par Cancelar/destructive de la regla 6.3, documentada.
- **Foco inicial en "Cancelar"** (regla 11.1).
- **Sin Toast** al confirmar: el feedback es la propia grabación arrancando (estado Grabando de SPEC-015).
- Decisión no cubierta por el design system: **persistencia de la preferencia en localStorage** (precedente en el proyecto: estado del sidebar). El registro de trazabilidad va con la transcripción, no en localStorage.

### Comportamiento responsive

- **Desktop (lg+):** como el wireframe. **Tablet/Mobile:** no aplican (app de escritorio macOS; excepción documentada desde SPEC-001).

## Notas técnicas

- **Preferencia** "no volver a mostrar": clave de localStorage propia (booleana). Cancelar nunca escribe la preferencia, aunque la casilla esté marcada.
- **Registro**: el archivo de transcripción (transcript.json) gana el campo `consent: { acknowledgedAt: string } | null` (ISO 8601, momento del inicio de la grabación de la entrevista con el aviso confirmado o previamente desactivado). Grabaciones del spike (`/capture`) → `null`. Cambio de forma menor del transcript: los lectores existentes ignoran el campo; QA adapta los tests del writer si asertan la forma completa.
- **Flujo**: el reconocimiento se decide en el renderer (diálogo o preferencia activa) y viaja a main con el inicio de la grabación; main lo asocia a la sesión y lo persiste al detener, junto a `lines`/`latency`/`assistant`.
- **Regresión presupuestada en tests**: mock del bridge si cambia la firma de inicio de grabación; tests del writer del transcript (campo nuevo); tests de RecordingSection que pulsan "Iniciar grabación" y esperan arranque directo (ahora pasa por el diálogo salvo preferencia activa) — QA adapta.
- **Divergencia de stack:** igual que specs previas.
