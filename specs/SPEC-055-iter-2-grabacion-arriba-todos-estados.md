# SPEC-055-iter-2 — Estados TCC ternarios y desbloqueo de la primera grabación

> Iteración de cambio de comportamiento sobre la implementación de SPEC-055. Challenge del humano (2026-07-26) tras detectar el interbloqueo de primera ejecución; diseño acordado en el artifact: https://claude.ai/code/artifact/b6bf412a-4878-48d1-863c-3cff9173d3c3 (sección «Diseño / mockups» de la cadena SPEC-055). Las 5 preguntas abiertas del artifact quedaron respondidas por el humano: chip pendiente ámbar con «?», tooltip sin hint visible, el workaround resetea también ScreenCapture, sin botón «Solicitar permisos», y formalización como iteración de SPEC-055.

## Descripción

Iteración de cambio de comportamiento sobre la implementación de SPEC-055 (y su iter-1). La desencadena un defecto de diseño detectado por el humano en la primera ejecución real tras un reset TCC: la UI colapsa los estados TCC `not-determined` (permiso aún no pedido) y `denied` (permiso denegado) en un único «no concedido». Con el permiso sin pedir, «Iniciar grabación» queda disabled y el prompt de macOS —que solo se dispara al iniciar una grabación— no puede llegar a mostrarse jamás: interbloqueo. Además, en ese estado «Abrir Ajustes del Sistema» no lleva a ninguna parte (macOS solo lista en Ajustes las apps que ya pidieron el permiso).

El cambio: la fila de permisos de la Topbar pasa a un **semáforo ternario** (✓ verde `granted` · «?» ámbar `not-determined` · ✕ rojo `denied`/`restricted`), los botones correctivos («Abrir Ajustes del Sistema» y «Workaround permisos micrófono») aparecen **solo con denegación dura**, y el gating de las acciones (Iniciar grabación, selector de micrófono, Nueva grabación) pasa de «ambos permisos en granted» a «deshabilitar solo si algún permiso está en denied/restricted». Con permisos pendientes, el primer clic en «Iniciar grabación» dispara los prompts TCC de macOS, que es el patrón canónico de la plataforma. Adicionalmente, el comando del workaround resetea también la entrada de ScreenCapture (audio del sistema), no solo la de Microphone.

No cambia: la estructura fija de la Topbar de iter-1 (badges persistentes, posiciones, icon-only, responsive), el flujo de arranque de `useAudioCapture` (ya dispara los prompts cuando el estado es `not-determined`), el refresh del snapshot al recuperar el foco, el `PermissionErrorAlert` como red de seguridad en runtime, ni la página `/capture` del spike.

Nota de trazabilidad: el botón «Workaround permisos micrófono» se introdujo fuera del pipeline como bugfix directo (commit `7b95729`, 2026-07-26, v0.6.1); esta iteración formaliza por primera vez su criterio de visibilidad y su comando.

## Alcance de implementación

- Esta iteración define **únicamente el código de producción** del delta: un ajuste de comportamiento y semántica de estados en la fila de permisos de la Topbar (renderer) y un ajuste del comando del workaround (main).
- **Los tests automatizados están fuera del alcance del implementador.** No se deben escribir tests
  unitarios (Vitest / Testing Library) ni tests end-to-end (Playwright) como parte de esta entrega.
  Los tests los genera la skill `/somo-qa-dev` y los ejecuta `/somo-qa-tester` contra el código ya
  commiteado, en un paso posterior del pipeline de QA de SOMO. Cualquier test que el implementador
  entregue será descartado o reemplazado.
- No hay cambios de esquema de datos, persistencia ni canales IPC nuevos: se modifica el comando que ejecuta el canal existente `permissions:reset-microphone` (main) y la lógica de presentación del renderer.
- **Fuera de alcance (delta):** `useAudioCapture` (el flujo de arranque y sus prompts quedan intactos), el hook `usePermissions` y su refresh on-focus, `PermissionErrorAlert`, la página `/capture` del spike, y cualquier cambio en la firma del bundle o `scripts/setup-signing.sh`.

## Criterio de aceptación modificado

Terminología TCC usada en los ACs: **pendiente** = `not-determined` o snapshot aún null; **denegado** = `denied` o `restricted`; **concedido** = `granted`.

### ACs nuevos (iter-2)

- AC-01: GIVEN algún permiso en estado pendiente y ninguno denegado WHEN se muestra la Topbar (cualquier estado de grabación) THEN ese badge presenta un chip **ámbar con «?»** y nombre accesible «Pendiente», y NO aparecen «Abrir Ajustes del Sistema» ni «Workaround permisos micrófono».
- AC-02: GIVEN Preparación con todos los permisos en concedido o pendiente WHEN se muestra THEN «Iniciar grabación» y el selector de micrófono están **enabled**; WHEN se pulsa «Iniciar grabación» THEN el flujo vigente (consentimiento SPEC-019 + arranque) procede y, con permisos pendientes, macOS muestra sus prompts TCC.
- AC-03: GIVEN algún permiso denegado WHEN se muestra THEN ese badge presenta el chip rojo ✕ («No concedido»), aparece «Abrir Ajustes del Sistema» (destructive) y, si el denegado es el micrófono, también «Workaround permisos micrófono»; «Iniciar grabación», el selector y «Nueva grabación» están **disabled** con su tooltip explicativo.
- AC-04: GIVEN un badge en estado pendiente WHEN hover/focus THEN muestra el tooltip «macOS pedirá los permisos al iniciar la grabación». No se añade ningún hint visible permanente en la Topbar.
- AC-05: GIVEN «Workaround permisos micrófono» WHEN se pulsa THEN el comando lanzado en Terminal resetea **Microphone y ScreenCapture** de `com.maurya.app`, y el diálogo de instrucciones posterior (relanzar Maurya e iniciar una grabación) menciona ambos permisos.
- AC-06: GIVEN todos los permisos concedidos WHEN se muestra THEN el comportamiento es el vigente: chips verdes ✓, sin botones correctivos, acciones enabled.

### ACs de la base/iter-1 que se mantienen (citas de los confundibles)

- iter-1 · AC-01 se mantiene en su estructura: «la Topbar presenta los badges de permiso compactos (…) con su texto accesible» — cambia únicamente la semántica de estados (ternaria) definida arriba.
- iter-1 · AC-06 se mantiene íntegro: durante la grabación el selector sigue presente y **disabled** (motivo «grabación en curso»), con independencia del estado de permisos.
- iter-1 · AC-10 (nombres accesibles y tooltips de los icon-only) se mantiene y se extiende al tooltip del AC-04.

### ACs derogados

- El criterio iter-1 · AC-02 «GIVEN algún permiso ≠ granted WHEN se muestra THEN aparece "Abrir Ajustes del Sistema" con estilo destructive (…); con ambos concedidos, no aparece» **queda obsoleto y debe entenderse derogado** por esta iteración. El comportamiento esperado del implementador y de la suite QA es el del AC-01/AC-03 nuevos: el botón aparece solo con algún permiso denegado.
- El criterio iter-1 · AC-04 «GIVEN Preparación con algún permiso no concedido WHEN se muestra THEN "Iniciar grabación" está disabled y el selector de micrófono está disabled» **queda obsoleto y debe entenderse derogado** por esta iteración. El comportamiento esperado es el de los AC-02/AC-03 nuevos: disabled solo con denegación dura.
- Del criterio iter-1 · AC-08, la segunda mitad «GIVEN algún permiso no concedido THEN "Nueva grabación" y el selector están disabled» **queda obsoleto y debe entenderse derogado** por esta iteración; aplica el mismo criterio de denegación dura (AC-03). La primera mitad (enabled con permisos concedidos) se mantiene.
- La decisión asumida de iter-1 «"Permisos concedidos" = micrófono y audio del sistema en granted (…). Con snapshot null se considera no concedido (botón/selector disabled)» **queda obsoleta y debe entenderse derogada** por esta iteración: el snapshot null y `not-determined` son estado pendiente (acciones enabled, sin botones correctivos).

## UX Design — ajuste puntual

La sección de permisos del UX Design de SPEC-055/iter-1 se ajusta solo en la semántica de estados de la fila de permisos y mantiene todo lo demás (estructura fija, posiciones, responsive, icon-only). Queda así:

### Wireframe textual (parte afectada)

```
Estado pendiente (primera ejecución / tras reset TCC):
[ Micrófono (?) ] [ Audio del sistema (?) ] │ [Selector ▾ enabled] [🎙 Iniciar grabación enabled]
  └ tooltip en cada chip (?): «macOS pedirá los permisos al iniciar la grabación»

Estado denegado (p. ej. micrófono denied):
[ Micrófono (✕) ] [ Audio del sistema (✓) ] [Abrir Ajustes del Sistema] [Workaround permisos micrófono]
  │ [Selector ▾ disabled] [🎙 Iniciar grabación disabled]

Estado concedido: sin cambios respecto a iter-1.
```

### Componentes shadcn utilizados

Los vigentes (`Badge`-chip propio, `Button`, `Tooltip`, `AlertDialog`); sin componentes nuevos. El chip pendiente reutiliza el chip circular de iter-1 cambiando color de fondo (ámbar, escala `amber`/`warning` de Tailwind) y glifo «?».

### data-testid

- `permission-badge-microphone` y `permission-badge-system` en los chips de permiso, con atributo `data-state="granted" | "pending" | "denied"` (nuevos; QA localiza el estado sin depender del color).
- Se mantienen: `open-settings-button`, `mic-workaround-button`, `topbar-start-button`.

### Patrón de interacción

- Chip pendiente: trigger de `Tooltip` (patrón span-wrapper ya usado para botones disabled). Regla del design system: todo disabled lleva tooltip explicativo — sin cambios; solo cambia cuándo hay disabled.

### Accesibilidad

- Nombre accesible del chip por estado: «Concedido» / «Pendiente» / «No concedido» (`sr-only`), glifo `aria-hidden`. Regla 11.4 (no solo color): verde+✓, ámbar+«?», rojo+✕.

### Comportamiento responsive

Sin cambios respecto a iter-1 (con menos botones en pendiente, la barra cabe con más holgura).

## Notas técnicas

- **Renderer:** `src/renderer/src/components/recording/PermissionBadges.tsx` (chip ternario + tooltip + data-testid), `OpenSettingsButton.tsx` (visibilidad: algún permiso denegado; destino: primer denegado, micrófono con prioridad), `MicWorkaroundButton.tsx` (visibilidad: micrófono denegado; textos del diálogo mencionando ambos permisos), `RecordingTopBarControls.tsx` (el predicado `permsGranted` se sustituye por «sin denegación dura», aplicado a Iniciar/selector/Nueva grabación).
- **Main:** `src/main/permissionService.ts` — el comando del workaround pasa de `tccutil reset Microphone com.maurya.app` a resetear también `ScreenCapture` (mismo `do script` de Terminal, comandos encadenados). El canal IPC `permissions:reset-microphone` y el método `resetMicrophone` del bridge **conservan su nombre** (sin cambio de contrato preload/tipos).
- Sin impacto en datos/esquema/persistencia; sin canales IPC nuevos; sin cambios en `package.json`.
- **Retrocompatibilidad explícita:** con permisos `granted` o `denied` la UI es visualmente la vigente (los chips verde/rojo no cambian); el único estado con presentación nueva es `not-determined`. `useAudioCapture` no se toca: su rama `not-determined → requestMicrophoneAccess` es la que hace funcionar el AC-02.
- **Dependencias:** SPEC-055 (base), SPEC-055-iter-1 (estructura de Topbar), SPEC-049 (lógica de destino de «Abrir Ajustes»), SPEC-019 (consentimiento en el arranque), bugfix v0.6.1 (`7b95729`: botón workaround, refresh on-focus, firma estable).
- **Verificación manual sugerida:** (1) `tccutil reset Microphone com.maurya.app && tccutil reset ScreenCapture com.maurya.app`; (2) abrir Maurya → detalle de entrevista: chips ámbar «?», sin botones correctivos, Iniciar enabled; (3) pulsar Iniciar → prompts de macOS → conceder → chips en verde y grabación en curso; (4) denegar el prompt de micrófono en una segunda prueba → chip rojo, botones correctivos visibles, Iniciar disabled.

## Decisiones asumidas

- Snapshot `null` (aún sin respuesta del main) se presenta como **pendiente**, no como denegado: evita el parpadeo rojo en el primer render. Alternativa descartada: mantener el criterio de iter-1 (null = no concedido), que reintroduce el interbloqueo visual.
- El canal IPC y el método del bridge conservan el nombre `resetMicrophone` aunque el comando resetee también ScreenCapture; renombrarlos obligaría a tocar preload/tipos sin beneficio funcional. El literal del botón no cambia («Workaround permisos micrófono»).
- Los `data-testid` de los chips (`permission-badge-*` con `data-state`) se añaden como parte del delta para que QA correlacione estados sin heurísticas de color/emoji.
