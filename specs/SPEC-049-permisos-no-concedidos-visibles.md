# SPEC-049 — Permisos no concedidos visibles: acción en la top bar y aviso arriba

> Origen: petición humana directa (2026-07-23, vídeo transcrito; precedente SPEC-020/SPEC-025 — no
> proviene del checklist). Traza a **RF-AUDIO-005** (Aviso de permisos y dispositivos, Must).

## Descripción

Cuando el permiso de micrófono o de audio del sistema no está concedido, hoy el usuario ve el badge
rojo «No concedido» pero no tiene ninguna acción a mano para corregirlo, y si inicia una grabación
el aviso de error aparece en la sección Grabación al final de la página, fuera del viewport, por lo
que no se entera de que no está grabando. Esta spec añade el botón «Abrir Ajustes del Sistema»
junto a los badges de permisos (top bar de la captura y bloque Preparación de la entrevista) y hace
que los errores de permiso al iniciar una grabación se muestren arriba de la página, inmediatamente
bajo la cabecera, donde se ven sin hacer scroll.

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
- Esta spec no toca main ni preload: el canal `permissions:open-settings` y el servicio
  `openPrivacySettings(target)` ya existen (SPEC-001) y se reutilizan tal cual.

## Criterios de aceptación

### Botón «Abrir Ajustes del Sistema» junto a los permisos (estado Preparación)

- GIVEN una captura en estado Preparación con el permiso de audio del sistema «No concedido» WHEN se muestran los controles de la top bar THEN entre los badges de permisos y el selector de micrófono aparece un botón «Abrir Ajustes del Sistema».
- GIVEN el detalle de entrevista en estado Preparación con algún permiso «No concedido» WHEN se muestra la sección Grabación THEN el botón «Abrir Ajustes del Sistema» aparece en la misma fila que los badges de permisos, a su derecha.
- GIVEN ambos permisos en estado «Concedido» WHEN se muestran los badges de permisos THEN el botón «Abrir Ajustes del Sistema» no se muestra.
- GIVEN el permiso de micrófono «No concedido» WHEN el usuario pulsa «Abrir Ajustes del Sistema» THEN se abre el pane de Ajustes del Sistema del micrófono.
- GIVEN el micrófono «Concedido» y el audio del sistema «No concedido» WHEN el usuario pulsa «Abrir Ajustes del Sistema» THEN se abre el pane de Ajustes del Sistema de grabación de pantalla y audio del sistema.
- GIVEN ambos permisos «No concedido» WHEN el usuario pulsa «Abrir Ajustes del Sistema» THEN se abre el pane del micrófono (tiene prioridad por ser el primer paso del flujo).
- GIVEN el snapshot de permisos aún no cargado WHEN se muestran los badges (que en ese caso pintan «No concedido») THEN el botón se muestra con el mismo criterio que los badges.
- GIVEN el botón visible por un permiso no concedido WHEN el permiso pasa a «Concedido» y el snapshot se refresca THEN el botón desaparece.

### Aviso de permiso arriba de la página al iniciar grabación

- GIVEN una captura con el audio del sistema «No concedido» WHEN el usuario inicia la grabación, confirma el consentimiento y la captura falla por permiso de audio del sistema THEN el Alert «Permiso de audio del sistema no concedido» se muestra inmediatamente debajo de la cabecera de la página, antes de la sección Objetivos.
- GIVEN una captura con el micrófono «No concedido» WHEN el usuario inicia la grabación, confirma el consentimiento y la captura falla por permiso de micrófono THEN el Alert «Permiso de micrófono no concedido» se muestra inmediatamente debajo de la cabecera de la página, antes de la sección Objetivos.
- GIVEN el Alert de error de permiso visible arriba THEN incluye el mensaje del error y el botón «Abrir Ajustes del Sistema» que abre el pane correspondiente al permiso que falló.
- GIVEN el Alert de error de permiso visible arriba WHEN se muestra la sección Grabación del final de la página THEN el mismo error de permiso no se muestra duplicado en ella.
- GIVEN un error de captura que no es de permisos (p. ej. error de escritura o de conexión con Deepgram) WHEN ocurre THEN se sigue mostrando en la sección Grabación y no aparece arriba de la página.
- GIVEN el Alert de error de permiso visible arriba WHEN el usuario inicia una nueva grabación y la captura arranca correctamente THEN el Alert desaparece.
- GIVEN el detalle de entrevista con un permiso «No concedido» WHEN el usuario inicia la grabación y la captura falla por permiso THEN el Alert de error de permiso se muestra igualmente debajo de la cabecera de la página, antes de la sección Objetivos.

## UX Design

### Wireframe textual

**Top bar de la captura, estado Preparación (Layout 2 — Página de detalle; controles portalados al
slot de la top bar, SPEC-034):**

```
[Micrófono (Badge verde «Concedido»)] [Audio del sistema (Badge destructive «No concedido»)]
[Button (variant outline, size sm) «Abrir Ajustes del Sistema»] [MicSelect compact]
```

- El botón va después de los dos badges y antes del selector de micrófono, en la misma fila
  (contenedor flex existente con `flex-wrap`).
- Solo se renderiza si al menos un permiso no está en estado `granted`.

**Bloque Preparación del detalle de entrevista (sección Grabación, final de la página):**

```
Grabación (h3)
[PermissionBadges]  [Button (variant outline, size sm) «Abrir Ajustes del Sistema»]
[MicSelect]
[Button (variant default, icono Mic) «Iniciar grabación»]
```

- El botón comparte fila con los badges (a su derecha, mismo contenedor flex con wrap); el selector
  y el CTA quedan como están.

**Alert de error de permiso arriba de la página (ambas páginas — CaptureDetailPage e
InterviewDetailPage):**

```
[← Volver]
[Cabecera: título, badges, acciones]
[Alert (variant destructive, icono AlertCircle)]
  Título: «Permiso de audio del sistema no concedido» | «Permiso de micrófono no concedido»
  Descripción: mensaje del error
  [Button (variant outline, size sm) «Abrir Ajustes del Sistema»]
[Objetivos]
[... resto de secciones ...]
[Grabación]   ← ya sin el Alert de permisos (los demás errores siguen aquí)
```

### Componentes shadcn utilizados

Componentes: Badge, Button, Alert. Todos instalados; sin componentes adicionales.

### data-testid

- `open-settings-button` — el botón «Abrir Ajustes del Sistema» junto a los badges de permisos
  (solo se renderiza una superficie a la vez: top bar en la captura, bloque Preparación en la
  entrevista).
- `permission-error-alert` — el contenedor del Alert de error de permiso arriba de la página.

El resto de elementos son localizables por role/name (botón por su texto, Alert por su título).

### Patrón de interacción

- **Alert destructive persistente para el error de página** (design system §5.4 y §6.1: los errores
  no van en Toast; un error que impide la tarea principal se muestra como Alert persistente hasta
  que se corrige). El Alert desaparece cuando una nueva grabación arranca correctamente, no por
  auto-dismiss.
- **Acción secundaria como Button variant outline size sm** dentro del Alert y junto a los badges
  (§5.3: la acción primaria de la página sigue siendo «Iniciar grabación»; abrir Ajustes es una
  acción correctiva secundaria).
- **Un solo botón junto a los badges, no uno por permiso**: decisión no cubierta por el design
  system. Se resuelve con un único botón cuyo destino es el primer permiso no concedido (micrófono
  antes que audio del sistema) porque duplica menos UI en una top bar compacta y el flujo de
  concesión es secuencial en la práctica.
- **Sin cambio de comportamiento de los badges** (SPEC-015): siguen siendo no-solo-color (§11.4).

### Comportamiento responsive

- **Mobile (< md):** los controles de la top bar de la captura ya saltan a una fila propia bajo el
  header (comportamiento SPEC-034, `max-md:order-last max-md:basis-full`); el botón participa del
  mismo `flex-wrap` y puede envolver a una segunda línea. El Alert superior ocupa el ancho completo
  del contenido.
- **Tablet (md-lg):** interpolado entre mobile y desktop.
- **Desktop (lg+):** layout completo de los wireframes.

## Notas técnicas

- Los errores de permiso son los `CaptureError` con `kind` ∈ {`microphone-permission`,
  `system-audio-permission`} y solo se originan en el arranque de la captura (`controller.error`);
  los errores de transcripción (`transcription.error`) nunca son de permisos y no cambian de sitio.
- Apertura de Ajustes: reutilizar `openPrivacySettings(target)` de
  `src/renderer/src/services/permissionsService.ts` (targets `microphone` | `systemAudio`), como ya
  hace `CaptureErrorAlert`.
- El estado de permisos llega por `controller.permissions` (`PermissionsSnapshot | null`); el
  criterio de visibilidad del botón debe ser el mismo que usa `PermissionBadges` para pintar
  «No concedido» (estado distinto de `granted`, incluido snapshot null).
- Las dos páginas ya izan el `RecordingController` (SPEC-034/SPEC-041), por lo que el error está
  disponible en el nivel de página para pintar el Alert bajo la cabecera sin ningún canal nuevo.
- Sin cambios de schema ni de infraestructura.

## Decisiones asumidas

- [¿Un botón por permiso o uno solo?] → asumido un único botón «Abrir Ajustes del Sistema» con
  destino el primer permiso no concedido, micrófono con prioridad (alternativa: un botón por badge).
  Regla: decisión no cubierta por el design system, documentada en Patrón de interacción.
- [¿El Alert de permiso se duplica arriba y abajo?] → asumido que se muestra SOLO arriba y se retira
  de la sección Grabación (alternativa: duplicarlo en ambas posiciones). Criterio: un mismo error en
  dos puntos de la página es ruido y el humano pidió visibilidad, no duplicación.
- [¿Dónde es exactamente «arriba»?] → asumido inmediatamente debajo de la cabecera de la página y
  antes de la sección Objetivos, en ambas páginas (alternativa: dentro de la top bar). Criterio:
  §8.3 — la zona superior del detalle es la de identidad y avisos siempre visibles; la top bar no
  admite un Alert persistente.
- [¿Aplica también al detalle de entrevista?] → asumido que sí, en sus dos cambios (alternativa:
  solo la captura, que es donde se grabó el vídeo). Criterio: consistencia entre superficies
  (precedente SPEC-030).
- [¿Snapshot de permisos null muestra el botón?] → asumido que sí, mismo criterio que los badges
  actuales, que pintan «No concedido» con snapshot null (alternativa: ocultarlo hasta cargar).
  Criterio: coherencia badge↔acción; el estado se refresca enseguida.
