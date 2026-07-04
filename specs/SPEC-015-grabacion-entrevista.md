# SPEC-015 — Grabación y transcripción en vivo integradas en la entrevista

> Requisitos origen: RF-AUDIO-001 (Must) + RF-AUDIO-002 (Must) + RF-AUDIO-003 (Must) + RF-AUDIO-005 (Must) + RF-AUDIO-004 (Should) · Hito H4 ítems 1-5 · Checklist: "Botón iniciar/detener", "Integrar captura mic+altavoces del spike", "Transcripción en vivo visible", "Flujo de permisos y dispositivos", "Atribución de hablante"
> Relacionados: SPEC-001..004 (todo el motor de captura/transcripción/latencia/diarización ya existe y se reutiliza), SPEC-013/014 (detalle de entrevista con guión), SPEC-006 (Interview.wavPath/transcriptPath/status), H6 (la nota se generará desde esta transcripción)
> Naturaleza: feature de producto con UI. El ítem 6 de H4 (sesión ≥60 min) es verificación manual del humano.

## Descripción

Lleva el motor del spike al flujo real: desde el detalle de una entrevista, el usuario inicia la grabación (micrófono + audio del sistema), ve la transcripción en vivo con atribución de fuente y hablante mientras consulta su guión, y al detener la grabación el audio y la transcripción quedan asociados a la entrevista, que pasa a estado "Grabada". Los permisos y la selección de micrófono se gestionan en la propia sección antes de empezar.

## Alcance de implementación

- Esta spec define **únicamente el código de producción** que debe entregarse: UI (componentes, páginas, estados), datos (queries, mutations, schema si aplica) y lógica de negocio asociada.
- **Los tests automatizados están fuera del alcance del implementador.** No se deben escribir tests unitarios (Vitest / Testing Library) ni tests end-to-end (Playwright) como parte de esta entrega. Los tests los genera la skill `/somo-qa-dev` y los ejecuta `/somo-qa-tester` contra el código ya pusheado, en un paso posterior del pipeline de QA de SOMO. Cualquier test que el implementador entregue será descartado o reemplazado.
- Si la spec requiere algún ajuste de schema, migración Supabase o cambio de RLS, se indica explícitamente en "Notas técnicas". Si no se indica, no hay cambios de infraestructura. **Sin Supabase**; Interview.wavPath/transcriptPath/status ya existen (SPEC-006).
- **Matices:** la página `/capture` (harness del spike) **se mantiene intacta** como herramienta de diagnóstico — cero cambios en ella ni en sus tests; la asistencia proactiva durante la llamada es H5; la nota/resumen es H6; la sesión sostenida de 60 min es el ítem 6 (manual).

## Criterios de aceptación

### Preparación (permisos y dispositivo)

- GIVEN el detalle de una entrevista sin grabación WHEN se muestra la sección Grabación THEN presenta el estado de los permisos (Badges "Micrófono" y "Audio del sistema": "Concedido"/"No concedido"), el selector de micrófono y el botón "Iniciar grabación".
- GIVEN algún permiso no concedido WHEN el usuario pulsa "Iniciar grabación" THEN no arranca y se muestra el Alert destructive correspondiente con la instrucción de Ajustes del Sistema (mismos literales que el spike).
- GIVEN la grabación en curso WHEN se muestra el selector de micrófono THEN está deshabilitado con Tooltip.

### Grabación (iniciar/detener)

- GIVEN permisos concedidos WHEN el usuario pulsa "Iniciar grabación" THEN comienza la captura (mic + sistema), aparecen el cronómetro mm:ss y los dos medidores de nivel, y el botón pasa a "Detener" (variant destructive).
- GIVEN la grabación en curso WHEN el usuario pulsa "Detener" THEN la grabación finaliza, el WAV y la transcripción se asocian a la entrevista (wavPath/transcriptPath), la entrevista pasa al Badge "Grabada" y aparece el Toast "Grabación guardada".
- GIVEN la grabación en curso WHEN el usuario navega fuera del detalle (Volver, sidebar) THEN la grabación se detiene y se guarda automáticamente con el mismo efecto que Detener (sin diálogo bloqueante).
- GIVEN la grabación en curso WHEN el usuario intenta cerrar la app THEN aplica el close guard existente del spike (AlertDialog "Detener captura").
- GIVEN el micrófono se desconecta durante la grabación WHEN ocurre THEN la grabación se detiene de forma controlada conservando lo grabado, se asocia a la entrevista y se muestra el Alert de causa (comportamiento del spike).

### Transcripción en vivo

- GIVEN la grabación en curso y la clave de Deepgram configurada WHEN llega audio THEN la transcripción aparece en vivo en la sección (parciales distinguibles y líneas finales con Badge de fuente Micrófono/Sistema y etiqueta de hablante cuando exista), con el Badge de estado ("Transcribiendo"/"Desconectado"/"Sin key").
- GIVEN sin clave de Deepgram WHEN se graba THEN la grabación funciona sin transcripción con el Alert informativo (patrón SPEC-002).

### Después de grabar

- GIVEN una entrevista con grabación WHEN se muestra la sección Grabación THEN presenta el resumen: duración, la fila "Latencia STT" si hubo transcripción (patrón SPEC-003), la ruta de los archivos y el botón "Mostrar en Finder"; además el botón "Nueva grabación".
- GIVEN una entrevista con grabación WHEN el usuario pulsa "Nueva grabación" THEN AlertDialog "Sobrescribir grabación" ("La grabación y transcripción actuales se sustituirán."); confirmar vuelve al estado de preparación.
- GIVEN la entrevista grabada WHEN se recarga la app THEN wavPath/transcriptPath persisten y el resumen sigue disponible (los archivos viven en userData).

### Guión visible durante la grabación

- GIVEN una entrevista con guión WHEN la grabación está en curso THEN la sección Guión sigue visible y legible en la misma página (sin cambios de la sección; solo se verifica la coexistencia).

## UX Design

### Wireframe textual

**Detalle de entrevista** (extiende SPEC-013/014): nueva sección **Grabación** (heading `h3`) colocada ENTRE la cabecera (título/Badge/refs) y la sección Guión — durante la llamada el entrevistador ve arriba el estado de grabación/transcripción y debajo su guión.

**Estado 1 — Preparación** (sin grabación asociada):
1. Fila de permisos compacta: dos Badges con label ("Micrófono", "Audio del sistema") verde "Concedido" / rojo "No concedido".
2. Select de micrófono (mismo comportamiento que el spike; deshabilitado durante grabación con Tooltip).
3. Button (default, icono Mic) "Iniciar grabación".
4. Zona de errores: Alert destructive (permisos/dispositivo) — literales del spike.

**Estado 2 — Grabando**:
1. Fila superior: cronómetro mm:ss (texto grande) + Button (destructive, icono Square) "Detener" + Badge de transcripción ("Transcribiendo"/"Desconectado"/"Sin key").
2. Dos medidores de nivel etiquetados ("Micrófono"/"Sistema", Progress).
3. Área de transcripción en vivo (reutiliza el componente del spike: líneas finales con Badge de fuente + "Hablante N", parcial en itálica, autoscroll, empty "Esperando audio…").
4. Alert informativo si falta la key de Deepgram.

**Estado 3 — Grabada** (wavPath presente):
1. Resumen en filas: "Duración" · "Latencia STT" con Badge OK/Lenta (si hubo transcripción) · rutas (texto mono) + Button outline (FolderOpen) "Mostrar en Finder".
2. Button outline (icono Mic) "Nueva grabación" → AlertDialog de sobrescritura.

### Componentes shadcn utilizados

Ya instalados todos (el spike ya los usa). Sin instalaciones nuevas. Se reutilizan los componentes del spike donde encajen (LevelMeter, TranscriptLine, área de transcripción) — extraer a compartido si hace falta, sin romper `/capture`.

### Patrón de interacción

- **Un solo botón Iniciar/Detener** con cambio de variante (patrón spike).
- **Auto-guardado al navegar fuera** (no diálogo): perder una grabación por navegación accidental es inaceptable; detener-y-guardar es la acción segura y reversible ("Nueva grabación" permite repetir). Decisión no cubierta por el design system, documentada aquí. El close guard de app se mantiene con diálogo (cierre = intención más fuerte).
- **Toast "Grabación guardada"** al asociar (regla 6.1); **AlertDialog** para sobrescribir (regla 6.3).
- **Badges no-solo-color** en permisos/estado de transcripción (regla 11.4).
- **La grabación pertenece a la página del detalle**: no hay grabación en segundo plano entre páginas en el MVP (H7 podría añadir un indicador global).

### Comportamiento responsive

- **Desktop (lg+):** completo. **Tablet/Mobile:** no aplican (excepción SPEC-001).

## Notas técnicas

- **Reutilización, no duplicación:** los hooks del spike (`useAudioCapture`, `useTranscription`, `usePermissions`, `useAudioDevices`) y los componentes reutilizables se comparten entre `/capture` y la sección nueva. Si algún componente del spike está acoplado a su página, extraer la parte común a `components/recording/` SIN cambiar el comportamiento ni los textos de `/capture` (sus tests deben seguir verdes).
- **Asociación a la entrevista (main):** `recording:start` acepta un `interviewId` opcional; al detener (o al finalizar por desconexión/cierre), si hay `interviewId`, main hace `repository.updateInterview(interviewId, { wavPath, transcriptPath, status: 'recorded' })` tras persistir los archivos. El renderer recibe la Interview actualizada en el StopResult o la refetchea.
- **Nueva grabación:** no borra los archivos antiguos del disco en el MVP (quedan huérfanos en recordings/ — aceptable y documentado); solo sustituye las referencias al detener la nueva.
- **Auto-guardado al desmontar:** el cleanup del hook en la página detiene y guarda si hay grabación activa (la persistencia y la asociación ocurren en main, que no depende del renderer montado).
- **Duración:** derivable del transcript (latencia/mm:ss ya calculados) o del propio WAV; persistir la duración en el resumen leyéndola del StopResult existente (RecordingResult.durationMs ya existe) — guardarla no requiere schema nuevo si se muestra desde el transcript/stat; si hace falta persistirla, va como parte del resumen en memoria de la página tras grabar y, tras recarga, se muestra solo lo persistible (rutas, latencia del transcript.json) — la spec acepta mostrar la duración solo cuando se acaba de grabar y omitir la fila tras recargar (documentado).
- **Estado "Grabada":** STATUS_LABELS.recorded pasa a contractual.
- **Regresión presupuestada en tests:** los tests del detalle de entrevista (SPEC-013/014) pueden requerir mocks de permisos/captura al montar la sección nueva (mockApi ya cubre el bridge del spike) — QA adapta.
- **Divergencia de stack:** igual que specs previas. La verificación acústica end-to-end en el flujo real es manual del humano (ítem 6 incluye la sesión ≥60 min).
