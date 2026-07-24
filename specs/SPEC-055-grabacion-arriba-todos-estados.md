# SPEC-055 — Todo el bloque de grabación arriba, en todos los estados y en ambas páginas

> Requisito origen: petición directa del humano (2026-07-25, capturas anotadas en rojo del detalle de entrevista). Extiende **SPEC-034** (controles de preparación de la captura reubicados) a **todos los estados** (Preparación, Grabando, Grabada) y a la **entrevista clásica**, además de la captura. Traza a **RF-AUDIO-001** (iniciar/detener) y **RF-AUDIO-005** (permisos y dispositivos). Relacionadas: SPEC-015 (RecordingSection y sus estados), SPEC-034 (reubicación en la captura, TopBarPortal), SPEC-041 (panel del asistente arriba, useRecordingController izado a las páginas), SPEC-049 (permisos visibles: OpenSettingsButton + PermissionErrorAlert), SPEC-030 (Grabación al final — se DEROGA posicionalmente), SPEC-035 (transcripción en vivo — ya retirada de la entrevista durante la grabación en el trabajo previo de esta rama).

## Descripción

Toda la UI de grabación deja de vivir en la sección «Grabación» del final de la página y sube a la parte superior, **en los tres estados** y en **ambas** páginas de detalle (entrevista clásica `/discoveries/…/interviews/:id` y captura directa `/captures/:id`), replicando el patrón de la top bar de la captura:

- **Preparación**: en la top bar, badges de permisos + botón «Abrir Ajustes del Sistema» (SPEC-049, solo con algún permiso no concedido) + selector de micrófono compacto; en la cabecera, el botón «Iniciar grabación» (variant default). En la captura sin empresa, «Asignar empresa» sigue a su lado.
- **Grabando**: en la top bar, la sesión en vivo compacta — cronómetro, «Detener», badge de estado de transcripción y medidores de nivel.
- **Grabada**: en la top bar, la etiqueta «Grabada» (con la duración cuando está disponible) + los botones «Mostrar en Finder» y «Nueva grabación»; **bajo la cabecera** (antes de «Objetivos») un bloque fino con la ruta del WAV, la ruta del transcript y la fila de latencia (detalle de archivo).

La sección «Grabación» del final **desaparece por completo** en los tres estados. Los avisos que hoy viven en esa sección (error de captura/transcripción, modo degradado, «Falta la key de Deepgram») se reubican **bajo la cabecera**, junto al `PermissionErrorAlert` que ya vive ahí (SPEC-049). Los diálogos del flujo (aviso de consentimiento, close-guard, «Preguntas descartadas», «Sobrescribir grabación») siguen montados y operativos.

Es un cambio de reubicación del renderer: el flujo de grabación (hooks, consentimiento, canales `recording:*`, `useRecordingController`) no cambia de mecanismo.

## Alcance de implementación

- Esta spec define **únicamente el código de producción** a entregar: componentes, páginas y estados del renderer. Los tests unitarios (Vitest) se generan en el paso de QA posterior.
- **Sin cambios de datos, IPC ni persistencia.** No hay migración ni nuevos canales; se reutiliza `useRecordingController` (SPEC-034/041) y los canales `recording:*` existentes.
- La transcripción en vivo del detalle de entrevista durante la grabación **ya se retiró** en el trabajo previo de esta rama (paridad total con la captura, SPEC-035) y no se restaura aquí.

## Derogaciones

- **SPEC-034 · «El detalle de entrevista clásico no cambia»** y **AC-08** (resumen de Grabada en la sección del final): la entrevista clásica ahora también sube todos los controles, y el resumen de Grabada se reparte entre top bar (acciones) y bloque bajo la cabecera (rutas + latencia), en ambas páginas.
- **SPEC-034 · AC-10/AC-11** (la entrevista conserva los controles de preparación dentro de la sección): pasan a la top bar + cabecera, igual que la captura.
- **SPEC-030** (Grabación al final): posicionalmente derogada — ya no hay sección «Grabación» al final; su contenido sube.
- **SPEC-049 · AC-02** (OpenSettingsButton en la fila de badges dentro de la sección de la entrevista): el botón vive ahora en la top bar (misma fila que los badges), como en la captura.

## Criterios de aceptación

Los ACs aplican por igual a la **entrevista clásica** y a la **captura** salvo donde se indique.

### Preparación — top bar y cabecera

- AC-01: GIVEN un detalle (entrevista o captura) sin grabación en curso ni asociada WHEN se muestra THEN la top bar presenta, en horizontal y compacto junto a «Buscar»: badges «Micrófono» y «Audio del sistema» (Concedido verde / No concedido destructive), el botón «Abrir Ajustes del Sistema» solo si algún permiso no está concedido (SPEC-049), y el selector de micrófono.
- AC-02: GIVEN el selector de micrófono de la top bar WHEN el usuario elige un dispositivo THEN esa selección es la que usa «Iniciar grabación».
- AC-03: GIVEN un detalle en Preparación WHEN se muestra la cabecera THEN aparece «Iniciar grabación» (Button variant default, icono Mic) en la zona derecha; en la captura sin empresa aparece además «Asignar empresa» (variant outline) a su lado.
- AC-04: GIVEN «Iniciar grabación» de la cabecera WHEN el usuario lo pulsa THEN el flujo es el actual: aviso de consentimiento (SPEC-019) salvo preferencia activa, y arranque con el micrófono seleccionado.
- AC-05: GIVEN un detalle en Preparación WHEN se muestra el cuerpo THEN NO existe una sección «Grabación» con badges de permisos, selector de micrófono ni botón «Iniciar grabación» al final de la página.

### Grabando — top bar

- AC-06: GIVEN una grabación en curso WHEN se muestra el detalle THEN la top bar presenta la sesión en vivo compacta: cronómetro, «Detener» (variant destructive), badge de estado de transcripción y dos medidores de nivel (Micrófono / Sistema); y NO hay heading ni sección «Grabación» en el cuerpo.
- AC-07: GIVEN la grabación en curso WHEN se pulsa «Detener» en la top bar THEN la grabación se detiene y persiste igual que hasta ahora (asociación del WAV/transcript, Toast, Badge «Grabada»).
- AC-08: GIVEN la grabación en curso sin clave de Deepgram WHEN el estado de transcripción es «no-key» THEN el aviso «Falta la key de Deepgram» sigue visible bajo la cabecera (no en la top bar) y la sesión sigue operativa arriba.

### Grabada — top bar y bloque bajo la cabecera

- AC-09: GIVEN un detalle en estado Grabada WHEN se muestra THEN la top bar presenta la etiqueta «Grabada» (con la duración cuando el resultado de la sesión está disponible) y los botones «Mostrar en Finder» y «Nueva grabación».
- AC-10: GIVEN un detalle en estado Grabada WHEN se muestra el cuerpo THEN, bajo la cabecera y antes de «Objetivos», aparece un bloque con la ruta del WAV, la ruta del transcript (si existe) y la fila de latencia (si existe); y NO hay sección «Grabación» al final de la página.
- AC-11: GIVEN el botón «Mostrar en Finder» de la top bar en estado Grabada WHEN se pulsa THEN se abre la carpeta del WAV (misma semántica que hasta ahora).
- AC-12: GIVEN el botón «Nueva grabación» de la top bar WHEN se confirma en el diálogo «Sobrescribir grabación» THEN el detalle vuelve al estado Preparación y los controles reaparecen en la top bar y la cabecera.

### Sin regresiones de flujo

- AC-13: GIVEN los permisos no concedidos WHEN el usuario pulsa «Iniciar grabación» THEN el bloqueo y el Alert de permiso destructive se comportan igual, con el Alert bajo la cabecera (PermissionErrorAlert, SPEC-049).
- AC-14: GIVEN una grabación en curso WHEN el usuario navega fuera del detalle THEN el auto-guardado al desmontar funciona como hasta ahora.
- AC-15: GIVEN una parada con preguntas descartadas WHEN termina la grabación THEN el diálogo «Preguntas descartadas» (SPEC-039) se abre igual que hasta ahora.
- AC-16: GIVEN cualquier otra página (Discoveries, Ajustes, listados) WHEN se muestra THEN la top bar no presenta controles de grabación.

## Decisiones asumidas

- El resumen de Grabada se reparte por espacio: la top bar es estrecha y no admite la ruta completa del WAV, así que las **acciones** («Mostrar en Finder», «Nueva grabación») y la etiqueta «Grabada» van arriba, y el **detalle de archivo** (rutas + latencia) va en un bloque fino bajo la cabecera (decisión humana por AskUserQuestion, 2026-07-25).
- La duración en la etiqueta «Grabada · mm:ss» solo se muestra cuando el resultado de la sesión está en memoria (recién grabada); tras recargar, la etiqueta es «Grabada» sin duración (el resumen no persiste el número de duración fuera del WAV).
- El componente `CaptureTopBarControls` se renombra a `RecordingTopBarControls` por dejar de ser exclusivo de la captura; el prop `variant` de `RecordingSection` desaparece (ambas páginas se comportan igual) y `SelfControlledRecordingSection` queda sin uso.
