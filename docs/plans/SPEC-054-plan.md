# SPEC-054 — Plan de implementación

> Plan autorado por el orquestador a partir de la spec `specs/SPEC-054-modo-compacto-always-on-top.md`. **Estado: EN ESPERA** — no se implementa ahora; se versiona junto a la spec para retomarlo cuando el feedback de más usuarios lo justifique (decisión humana 2026-07-24). Origen y análisis de alternativas (transparencia descartada) documentados en la cabecera de la spec.

## Contexto

Feedback de usuario: necesita ver la cara del entrevistado (ventana de videollamada) mientras Maurya le asiste. La solución acordada es un modo compacto always-on-top durante la grabación de una entrevista: panel flotante con la salida del asistente (cola de preguntas + alarmas Mom Test) y la salud de captura (cronómetro + estado de transcripción), sin transcripción. La ventana se restaura al salir, al detener o al cerrar.

Restricción arquitectónica que gobierna todo el plan: la captura (AudioWorklet, tee a Deepgram) vive en el renderer de la página de entrevista, así que el modo compacto **es un estado de layout, no una ruta**: el `RecordingController` permanece montado y solo cambia lo que se renderiza a su alrededor.

## Pendiente antes de entrar al pipeline

1. **Validación de producto:** confirmar con más usuarios que el modo compacto resuelve el problema (la propuesta original era otra: transparencia).
2. **PRD:** decidir (humano) si se añade un RF propio o basta la traza a RF-ASIS-002/003/004/006, y si entra en `docs/checklist.md` como fila nueva. Esta spec sigue el precedente SPEC-049 (petición directa, fuera del checklist).
3. **Spike manual del riesgo nativo (½ día, antes de implementar la UI):** verificar en macOS que una ventana con `setAlwaysOnTop` de nivel elevado + `setVisibleOnAllWorkspaces(..., { visibleOnFullScreen: true })` flota sobre Zoom/Meet a pantalla completa en su propio Space. Si el nivel elegido no basta, ajustar solo main; si es inviable, la spec pierde la mitad de su valor y hay que reabrir la conversación de producto.

## Cambios por fichero

### 1. `src/main/index.ts` (o módulo nuevo `src/main/compactWindowHandler.ts` si supera ~40 líneas)

Registro de dos canales fire-and-forget de la familia `window:*` (precedente `window:set-theme`, sin envelope — no pueden fallar de forma que el renderer deba distinguir):

- `window:enter-compact`: guarda `getBounds()` y `getMinimumSize()` actuales en variables del closure; aplica `setMinimumSize(320, 400)` (antes que `setSize` — los mínimos actuales 720×640 bloquearían el resize), `setSize(380, 560)`, `setAlwaysOnTop(true, <nivel elevado>)` y `setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })`. El nivel concreto (`'floating'` vs `'screen-saver'`) lo fija el spike del riesgo nativo.
- `window:exit-compact`: restaura mínimos y bounds guardados, `setAlwaysOnTop(false)`, `setVisibleOnAllWorkspaces(false)`. Idempotente: si no hay estado guardado, no hace nada.
- Interacción con el close-guard existente (`window:close-requested`): sin cambios en main; es el renderer quien sale del modo compacto al recibir el evento (ver §5).

### 2. `src/preload/index.ts`

Dos métodos nuevos en `window.api.window`: `enterCompact()` y `exitCompact()`, delegando en `ipcRenderer.send` de los canales anteriores (mismo patrón que `setTheme`).

### 3. `src/renderer/src/types/` (contrato del bridge)

Añadir `enterCompact` / `exitCompact` al tipo del dominio `window` de `window.api`. El typecheck (`npm run typecheck`) garantiza la coherencia main/preload/renderer.

### 4. `src/renderer/src/hooks/useCompactMode.ts` (NUEVO)

Hook dueño del estado `compact: boolean` y de la coreografía:

- `enter()`: set state + `window.api.window.enterCompact()`. `exit()`: simétrico.
- Efecto de auto-salida: cuando `controller.capturing` pasa a `false` (la grabación termina por cualquier vía), si `compact`, ejecutar `exit()` (AC «la grabación termina por cualquier vía»).
- Suscripción a `window:close-requested` ya existente en la página: al recibirse en modo compacto, `exit()` antes de mostrar el AlertDialog del close-guard (AC de cierre de ventana).
- Cleanup en unmount: si `compact`, enviar `exitCompact()` (red de seguridad; en el flujo normal nunca se desmonta en compacto).

### 5. `src/renderer/src/components/recording/CompactModeView.tsx` (NUEVO)

Vista compacta según el wireframe de la spec:

- Franja de salud (`compact-health-strip`): cronómetro (`formatElapsed(controller.elapsedSeconds)`, ya existente en `CaptureTopBarControls`; extraer el formateador a `lib/` si aún es local) + `TranscriptionStatusBadge` (reutilizado) + botones `compact-exit` (Maximize2, ghost) y `compact-stop` (Square, destructive), icon-only con Tooltip y aria-label.
- Cuerpo: `<AssistantPanel …controller.assistant />` con exactamente las mismas props que le pasa `AssistantLiveSection` — cero cambios en `AssistantPanel`.
- `compact-stop` llama a `exit()` y después `controller.stop()` (orden del AC: restaurar primero, flujo de detención después).

### 6. `src/renderer/src/components/recording/CaptureTopBarControls.tsx`

En la rama de grabación (`topbar-recording-controls`), variante entrevista únicamente: botón `compact-mode-toggle` (PictureInPicture2, ghost, icon-sm) a la derecha de «Detener»; deshabilitado con Tooltip explicativo si `controller.assistant.state === 'no-key'`. En la variante captura (`/capture`) no se renderiza.

### 7. `src/renderer/src/pages/InterviewDetailPage.tsx`

Render condicional bajo el mismo montaje del controller: si `compact`, renderizar solo `<CompactModeView …/>`; si no, el layout actual completo. El hook `useCompactMode` vive aquí, junto al `RecordingController`. La sidebar/top bar del layout general quedan fuera del render compacto (verificar dónde corta el layout — si sidebar/top bar vienen de un layout de router por encima de la página, el estado compacto debe izarse o exponerse vía contexto; resolver en implementación con la opción menos invasiva).

## Orden de implementación

1. Spike manual del always-on-top sobre fullscreen Spaces (pendiente §3 — gate del resto).
2. Main + preload + tipos (§1–3): canales y contrato.
3. Hook + vista compacta (§4–5).
4. Integración top bar + página (§6–7).
5. `npm run typecheck && npm run lint && npm test` y verificación manual end-to-end (entrar/salir, detener desde compacto, cerrar ventana desde compacto, Zoom fullscreen).

## Verificación

- Automatizable (Vitest, jsdom, mock de `window.api`): visibilidad/deshabilitado del toggle, render de la vista compacta y sus estados (cola, vacío, pausa, error, badge desconectado), acciones de la cola en compacto, auto-salida al terminar la grabación, orden exit→stop en `compact-stop`.
- `MANUAL` en `tests/spec-test-map.json`: los 4 ACs de «Ventana nativa» (tamaño/mínimos, always-on-top, fullscreen Spaces, restauración de bounds).

## Riesgos

- **Fullscreen Spaces (alto):** cubierto por el spike-gate; es el único riesgo que puede invalidar la feature.
- **Restauración de mínimos/bounds (medio):** un exit sin restaurar dejaría la ventana rota (mínimos 320×400 en modo completo); mitigado con `exit()` idempotente en main + cleanup del hook + auto-salida al terminar la grabación.
- **Desmontaje accidental de la captura (alto, conocido):** el modo compacto jamás navega; cualquier refactor que convierta la vista compacta en ruta rompe la grabación. Documentado en Notas técnicas de la spec.
