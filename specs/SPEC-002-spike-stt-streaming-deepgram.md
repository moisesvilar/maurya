# SPEC-002 — Spike: transcripción STT streaming con Deepgram sobre la captura dual

> Requisito origen: RF-AUDIO-003 (Must) · Hito H0 ítem 3 · Checklist: "Integración de STT streaming con Deepgram transcribiendo en vivo con baja latencia"
> Relacionados: RF-AUDIO-002/SPEC-001 (fuente del audio), RF-AUDIO-004 (la transcripción por canal sienta la base de la atribución de hablante), NFR §4.1 (latencia), Riesgo #3
> Naturaleza: **SPIKE** que extiende el harness de SPEC-001. Código de validación técnica, no feature de producto final.

## Descripción

Añade al harness de captura de SPEC-001 la transcripción en vivo: mientras la captura está activa, el audio de ambas fuentes se envía en streaming a Deepgram y los resultados (parciales y finales) se muestran en pantalla a medida que llegan. Cada línea final queda atribuida a su fuente (Micrófono o Sistema) gracias a la separación por canal. Al detener, la transcripción completa se persiste junto al WAV. Sirve para validar el segundo pilar técnico de H0: que el pipeline audio→texto funciona en vivo y con latencia utilizable.

## Alcance de implementación

- Esta spec define **únicamente el código de producción** que debe entregarse: UI (componentes, páginas, estados), datos (queries, mutations, schema si aplica) y lógica de negocio asociada.
- **Los tests automatizados están fuera del alcance del implementador.** No se deben escribir tests unitarios (Vitest / Testing Library) ni tests end-to-end (Playwright) como parte de esta entrega. Los tests los genera la skill `/somo-qa-dev` y los ejecuta `/somo-qa-tester` contra el código ya pusheado, en un paso posterior del pipeline de QA de SOMO. Cualquier test que el implementador entregue será descartado o reemplazado.
- Si la spec requiere algún ajuste de schema, migración Supabase o cambio de RLS, se indica explícitamente en "Notas técnicas". Si no se indica, no hay cambios de infraestructura. **En esta spec no hay Supabase**: harness 100% local (Electron).
- **Matiz de spike:** extiende el harness desechable de SPEC-001 (misma pantalla única). La medición formal de latencia extremo a extremo es el ítem 4 de H0 (spec aparte); aquí solo se instrumentan los timestamps que ese ítem consumirá.

## Criterios de aceptación

### Transcripción en vivo (happy path)

- GIVEN la API key de Deepgram está configurada y la captura está en curso WHEN el usuario habla al micrófono THEN aparecen resultados parciales de transcripción en pantalla mientras habla y se consolidan como línea final al terminar la frase.
- GIVEN la captura está en curso WHEN suena audio del sistema con voz THEN sus frases se transcriben igualmente y cada línea final queda etiquetada con su fuente ("Micrófono" o "Sistema").
- GIVEN la transcripción está activa WHEN llegan resultados THEN la línea parcial en curso se distingue visualmente de las líneas finales (texto atenuado/itálica) y el área hace scroll automático al último resultado.
- GIVEN la conexión con Deepgram está establecida WHEN el usuario observa la sección Transcripción THEN un Badge muestra el estado "Transcribiendo".
- GIVEN la captura está en curso WHEN el usuario pulsa "Detener" THEN el stream con Deepgram se cierra de forma limpia y la transcripción completa (líneas finales con fuente y timestamps) se guarda como archivo junto al WAV.
- GIVEN una grabación finalizada con transcripción WHEN se muestra la sección Resultado THEN incluye la ruta del archivo de transcripción además de la del WAV.

### Configuración de la key (validación)

- GIVEN no hay API key configurada WHEN el usuario pulsa "Iniciar captura" THEN la captura arranca igualmente sin transcripción y se muestra un Alert (no destructive) indicando que falta la key de Deepgram y dónde configurarla (`.env.local`, variable `DEEPGRAM_API_KEY`).
- GIVEN hay API key configurada WHEN se inicia la captura THEN la transcripción se activa automáticamente, sin pasos adicionales.

### Empty state

- GIVEN la transcripción está activa WHEN todavía no se ha detectado habla THEN el área de transcripción muestra el placeholder "Esperando audio…".

### Error states

- GIVEN la API key es inválida WHEN se intenta abrir el stream THEN se muestra un Alert destructive "No se pudo conectar con Deepgram: clave inválida" y la captura de audio continúa sin transcripción.
- GIVEN la transcripción está activa WHEN la conexión con Deepgram se pierde THEN el Badge pasa a "Desconectado", se muestra un Alert destructive con la causa, se intenta una reconexión automática (1 reintento) y, si falla, la captura continúa sin transcripción conservando las líneas ya recibidas.

### Edge cases

- GIVEN la transcripción está activa WHEN el usuario cierra la ventana y confirma "Detener y guardar" THEN la transcripción parcial recibida hasta ese momento se persiste junto al WAV.
- GIVEN la captura se detiene por desconexión del micrófono (edge de SPEC-001) WHEN se conserva lo grabado THEN también se conservan y persisten las líneas de transcripción recibidas.

## UX Design

### Wireframe textual

**Pantalla única — Harness de captura (extensión de SPEC-001)**

Se mantiene el layout de SPEC-001 (ventana única, contenido centrado max-width 640px, excepción al design system ya documentada). Se añade una sección entre "Captura" y "Resultado":

5bis. **Sección Transcripción** (heading `h3` "Transcripción"):
   - A la derecha del heading: Badge de estado — gris "Inactiva" / verde "Transcribiendo" / rojo "Desconectado" / ámbar "Sin key".
   - Debajo: **área de transcript** (contenedor con altura fija ~200px, `overflow-y: auto`, scroll automático al final): lista de líneas finales, cada una con Badge pequeño de fuente ("Micrófono" outline / "Sistema" secondary) + texto + timestamp mm:ss atenuado. La línea parcial en curso se muestra al final en texto `muted` itálica.
   - Empty state dentro del área: "Esperando audio…" centrado y atenuado (solo cuando activa y sin resultados).
   - Cuando la transcripción está inactiva por falta de key: Alert informativo (variant default) encima del área con el texto de configuración.

6 (Resultado, modificada). Añade una fila: ruta del archivo de transcripción (texto mono) con su propio "Mostrar en Finder" reutilizando el mismo botón/acción si ambos archivos comparten carpeta (un solo botón para la carpeta).

Los errores de Deepgram usan la **zona de errores** existente (Alert destructive bajo el título).

### Componentes shadcn utilizados

Componentes ya instalados y suficientes: `Button`, `Select`, `Badge`, `Tooltip`, `AlertDialog`, `Toast/sonner`, `Alert`, `Progress`. **No se requieren componentes nuevos.**

### Patrón de interacción

- **Transcripción acoplada a la captura** (sin botón propio): en un spike, un solo gesto ("Iniciar captura") ejercita todo el pipeline; un toggle separado añadiría estados combinatorios sin valor de validación. Decisión no cubierta por el design system, documentada aquí.
- **Falta de key = degradación, no bloqueo** (Alert informativo, no destructive): la captura de SPEC-001 sigue siendo útil sin STT; bloquear contradiría el AC de SPEC-001 de que la captura arranca con permisos concedidos.
- **Errores de conexión como Alert destructive persistente** (regla 6.1: información que requiere lectura y acción externa), nunca Toast.
- **Badge para el estado de conexión** (patrón de estado no-solo-color: el texto del Badge cambia junto al color, regla 11.4).
- **Persistencia al detener → el Toast existente de SPEC-001** pasa a "Grabación y transcripción guardadas · Mostrar en Finder" cuando hay transcript.

### Comportamiento responsive

- **Desktop (lg+):** layout completo; ventana Electron con mínimo 720×640 (la sección nueva alarga el scroll vertical de la página).
- **Tablet/Mobile:** no aplican (excepción justificada en SPEC-001: producto exclusivamente desktop).

## Notas técnicas

- **API key:** el main process la lee de `process.env.DEEPGRAM_API_KEY` cargada desde `.env.local` (dotenv en dev vía electron-vite). Nunca se expone la key al renderer: el **stream con Deepgram vive en el main process**; el renderer envía los chunks PCM ya existentes (mismo flujo IPC de SPEC-001) y recibe eventos de transcripción tipados por el bridge (`api.transcription.onResult(cb)` / estado).
- **Conexión:** WebSocket de Deepgram streaming (`wss://api.deepgram.com/v1/listen`) con `encoding=linear16&sample_rate=16000&channels=2&multichannel=true&interim_results=true&language=es` (idioma por defecto es-ES; parametrizable en código). `multichannel=true` transcribe cada canal por separado → la etiqueta Micrófono/Sistema sale del índice de canal (L=0 mic, R=1 sistema), sin diarización todavía.
- **Reutilización del flujo de audio:** los mismos chunks Int16 interleaved que van al WAV se bifurcan al WebSocket (tee en main). Sin segundo AudioContext ni segunda captura.
- **KeepAlive:** enviar mensaje `KeepAlive` si no hay audio >8 s (Deepgram cierra a los 10-12 s de silencio de datos); al detener, enviar `CloseStream` y esperar el último final antes de cerrar.
- **Persistencia:** `spike-<timestamp>.transcript.json` junto al WAV: array de `{ channel: 'mic' | 'system', text, startMs, endMs, receivedAtMs }`. `receivedAtMs − endMs` es la base de la medición de latencia (ítem 4 de H0, fuera de este alcance).
- **Instrumentación para el ítem 4:** loguear por consola de main cada resultado final con su delta de latencia; no hay UI de métricas en esta spec.
- **Dependencia npm nueva:** ninguna obligatoria (WebSocket nativo de Node/Electron es suficiente); el SDK `@deepgram/sdk` queda permitido si simplifica el manejo de eventos, a criterio del implementador — es la única dependencia autorizada por esta spec.
- **Divergencia de stack:** igual que SPEC-001 (Electron local, no Lovable; e2e contra public link no aplica).
