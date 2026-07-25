# SPEC-055-iter-1 — Criterio de estilo de la Topbar de grabación

> Iteración de SPEC-055 tras challenge del humano sobre el diseño implementado (2026-07-25). Diseño acordado en el artifact v2: https://claude.ai/code/artifact/74498c34-bc2b-47b9-ab2d-0ad04599cac4 (ver `specs/SPEC-055-...md` §Diseño). No cambia el mecanismo de grabación (hooks/IPC/persistencia): es refinamiento visual y de disposición del renderer.

## Cambios respecto a SPEC-055

La Topbar pasa a tener una **estructura fija en los tres estados**: `[sección] │ permisos │ [Abrir Ajustes si falta] │ <controles por estado> │ ⟶ Buscar · Modo`. Los badges de permiso y «Abrir Ajustes» son **persistentes** (antes desaparecían al grabar/grabada). Concretamente:

1. **Badges de permiso compactos.** «Micrófono»/«Audio del sistema» dejan de mostrar el pill de texto «Concedido»/«No concedido»: pasan a un **chip compacto** (verde con ✓ / rojo con ✗). El literal «Concedido»/«No concedido» se conserva como texto accesible (`sr-only`) para a11y (regla 11.4) y como nombre accesible.
2. **«Abrir Ajustes del Sistema» → destructive (rojo).** Antes `variant="outline"`; el criterio acordado es danger. Sigue apareciendo solo si algún permiso ≠ granted (misma lógica SPEC-049), en **todos los estados**.
3. **Selector de micrófono en la barra en los tres estados**, junto al botón de arranque. **Enabled solo con permisos concedidos** (Preparación y Grabada) y **disabled durante la grabación** (no se cambia de dispositivo en caliente). El tooltip de disabled distingue el motivo (permisos vs grabación en curso).
4. **«Iniciar grabación» se mueve de la cabecera a la Topbar** (bloque de Preparación), a la derecha del selector. **Disabled cuando falta algún permiso** (antes: siempre enabled, bloqueaba al pulsar). Se retira de la cabecera de la página (la captura conserva «Asignar empresa»).
5. **«Detener» pasa a icon-only** (destructive, `aria-label`/tooltip «Detener»). Se **elimina el badge de estado de transcripción** («Transcribiendo») del bloque Grabando: quedan cronómetro + Detener + medidores + selector (disabled).
6. **Estado Grabada:** la etiqueta pasa a «Grabada» **sin duración**; «Mostrar en Finder» y «Nueva grabación» pasan a **icon-only** (`aria-label`/tooltip). «Nueva grabación» **disabled sin permisos**. El selector de micrófono va entre «Mostrar en Finder» y «Nueva grabación».
7. **Responsive (Q5):** cuando la barra no cabe, **«Buscar» y «Modo» saltan a la segunda fila** (el bloque de grabación se queda en la primera). Antes era el bloque de grabación el que bajaba.

## Derogaciones (de SPEC-055)

- **AC-03** (Iniciar en la cabecera) → ahora en la Topbar (bloque Preparación), disabled sin permisos.
- **AC-06** (Grabando con badge de estado de transcripción) → sin badge «Transcribiendo»; Detener icon-only; se añaden badges persistentes + selector disabled.
- **AC-09** (Grabada: «Grabada · duración» + botones con texto) → «Grabada» sin duración; botones icon-only; + selector + badges persistentes.
- **AC-13** (click en Iniciar con permisos denegados → Alert) → el botón está **disabled**; ya no se pulsa. El `PermissionErrorAlert` bajo la cabecera queda como red de seguridad para la denegación **en runtime** (snapshot obsoleto). Se derogan asimismo, por el mismo motivo, **SPEC-049 · AC-15** y **SPEC-034 · AC-12** (bloqueo-por-click).
- **SPEC-049 · AC-01/AC-02** (posición/estilo de «Abrir Ajustes») → botón destructive; badges compactos; ambos en la Topbar en todos los estados.

## Criterios de aceptación

Aplican a la entrevista clásica y a la captura salvo indicación. La Topbar es `RecordingTopBarControls` portalada al slot del Layout.

### Permisos y «Abrir Ajustes» (persistentes)

- AC-01: GIVEN cualquier estado (Preparación/Grabando/Grabada) WHEN se muestra el detalle THEN la Topbar presenta los badges de permiso compactos («Micrófono»/«Audio del sistema» con chip ✓ verde o ✗ rojo) con su texto accesible «Concedido»/«No concedido».
- AC-02: GIVEN algún permiso ≠ granted WHEN se muestra THEN aparece «Abrir Ajustes del Sistema» con estilo **destructive** (data-variant destructive), en la Topbar, en cualquier estado; con ambos concedidos, no aparece.

### Preparación

- AC-03: GIVEN Preparación con permisos concedidos WHEN se muestra THEN la Topbar presenta el selector de micrófono (enabled) y «Iniciar grabación» (enabled), y NO hay «Iniciar grabación» en la cabecera de la página.
- AC-04: GIVEN Preparación con algún permiso no concedido WHEN se muestra THEN «Iniciar grabación» está **disabled** y el selector de micrófono está **disabled**.
- AC-05: GIVEN «Iniciar grabación» de la Topbar (con permisos) WHEN se pulsa THEN el flujo es el actual (consentimiento SPEC-019 y arranque con el micrófono seleccionado).

### Grabando

- AC-06: GIVEN grabación en curso WHEN se muestra THEN la Topbar presenta cronómetro, «Detener» **icon-only** (accessible name «Detener», destructive) y dos medidores; **NO** hay badge «Transcribiendo»; el selector de micrófono está presente y **disabled**.

### Grabada

- AC-07: GIVEN estado Grabada WHEN se muestra THEN la Topbar presenta la etiqueta «Grabada» **sin duración**, «Mostrar en Finder» y «Nueva grabación» **icon-only** (accessible names respectivos) y el selector de micrófono.
- AC-08: GIVEN estado Grabada con permisos concedidos WHEN se muestra THEN «Nueva grabación» y el selector están enabled; GIVEN algún permiso no concedido THEN «Nueva grabación» y el selector están **disabled**.
- AC-09: GIVEN «Mostrar en Finder» icon-only WHEN se pulsa THEN abre la carpeta del WAV (igual que hasta ahora); GIVEN «Nueva grabación» (con permisos) WHEN se confirma «Sobrescribir grabación» THEN vuelve a Preparación.

### Accesibilidad e integridad

- AC-10: GIVEN los botones icon-only (Detener, Mostrar en Finder, Nueva grabación) WHEN se inspeccionan THEN cada uno tiene un nombre accesible (aria-label) igual a su acción y muestra tooltip al hover.
- AC-11: GIVEN el detalle de archivo de Grabada (rutas WAV/transcript + latencia) WHEN estado Grabada THEN sigue en la superficie bajo la cabecera (sin cambios respecto a SPEC-055).

## Decisiones asumidas

- «Permisos concedidos» = micrófono **y** audio del sistema en `granted` (mismo criterio que la visibilidad de «Abrir Ajustes»). Con snapshot null se considera no concedido (botón/selector disabled), consistente con SPEC-049.
- El selector se mantiene visible pero disabled durante la grabación (no desaparece) para que el layout no salte entre estados (confirmado por el humano, 2026-07-25).
- Orden del selector en Grabada: **antes** de «Nueva grabación» (unificado; en las notas variaba), consistente con Preparación.
- El indicador «Transcribiendo» desaparece de la Topbar sin sustituto (decisión del humano); el aviso «Falta la key» y el modo degradado siguen en la superficie bajo la cabecera.
