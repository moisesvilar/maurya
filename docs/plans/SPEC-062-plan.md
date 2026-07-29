# SPEC-062 — Plan de implementación

> Plan a partir de `specs/SPEC-062-desacoplar-asistente-guion.md` (issue #38). Toca main, preload, tipos y renderer. Sin cambios de persistencia (`db.json` intacto): las ventanas desacopladas son efímeras por sesión de grabación.

## Resumen

Dos `BrowserWindow` secundarias, espejo y de solo consulta, creadas por main a petición del renderer durante la grabación. La página principal conserva ambos componentes. Tres piezas nuevas de fontanería:

1. **Apertura**: canal fire-and-forget `window:open-detached` (familia `window:*`, precedente `window:set-theme`) + módulo nuevo en main con el ciclo de vida (dedup, título, cierre automático).
2. **Sincronía del asistente**: `assistant:update` deja de ir solo al `sender` de la sesión y se entrega también a las ventanas desacopladas registradas; la ventana que abre a mitad de sesión se hidrata con una consulta puntual `assistant:get-snapshot`.
3. **Sincronía del guión**: evento nuevo de difusión `db:interview-updated` emitido por main cuando la entrevista se persiste por los caminos que tocan el guión (guardado manual y generación manual). La ventana del guión lo escucha; la principal no lo escucha (riesgo de regresión cero).

Las acciones de la cola (`assistant:set-pinned`, `assistant:resolve-item`, `assistant:resume`) ya operan sobre el singleton `session` con independencia del sender: **funcionan desde cualquier ventana sin tocar una línea**.

## Decisiones de diseño

### 1. Ciclo de vida en un módulo propio, con un registro sin dependencia de `electron`

Dos módulos nuevos en main, no uno:

- `src/main/detachedWindowRegistry.ts` — **puro**: `Map<DetachedComponent, BrowserWindow>` con `import type { BrowserWindow, WebContents } from 'electron'` (type-only, se borra al compilar). Expone `getDetachedWindow`, `registerDetachedWindow`, `unregisterDetachedWindow`, `listDetachedWindows`, `listDetachedWebContents` (filtra ventanas y webContents destruidos) y `clearDetachedRegistry`. **Cero llamadas a APIs de Electron.**
- `src/main/detachedWindows.ts` — creación real (`new BrowserWindow`), carga de la ruta, título, cierre; mantiene el registro al día.

El registro separado es lo que permite que `assistantService` sepa a quién difundir **sin importar `BrowserWindow`** (ver decisión 3). Alternativa descartada: un único módulo `detachedWindows.ts` que importe `electron` y que `assistantService` importe entero — arrastraría `electron`/`@electron-toolkit/utils` al grafo de módulos del asistente y obligaría a ampliar el mock de `electron` de **11 suites** de main.

**Opciones de la ventana** (idénticas para ambos componentes): `width: 420, height: 640, minWidth: 360, minHeight: 480`, `show: false` + `ready-to-show → show()` (patrón de la principal), `autoHideMenuBar: true`, `title` calculado, `webPreferences: { preload: join(__dirname, '../preload/index.js'), sandbox: false }`. **Sin `alwaysOnTop`. Sin `parent`**: `parent` cerraría las hijas gratis con la principal, pero las mantendría siempre por encima de ella, que es justo lo contrario del caso de uso en mosaico de la issue (y territorio de SPEC-054). El ciclo de vida se hace explícito a cambio. `setWindowOpenHandler` → `shell.openExternal` + `deny`, igual que la principal (el guión renderizado puede contener enlaces).

**Título** (`«Asistente — {título}»` / `«Guión — {título}»`): se lee con `repository.getInterview(interviewId).title` dentro de `try/catch` (fallback `'Asistente'` / `'Guión'` a secas; una entrevista ilegible nunca impide abrir la ventana). **Trampa que hay que cubrir sí o sí**: `src/renderer/index.html` declara `<title>Maurya</title>`, y Chromium sobrescribe el título de la ventana con el del documento en cuanto carga. Hay que registrar `win.on('page-title-updated', (event) => event.preventDefault())` **antes** de la carga. La ventana principal no sufre esto solo porque su título coincide con el del documento.

**Carga de la ruta** con hash en los dos entornos, usando el helper compartido `detachedWindowHash(component, interviewId)` (ver decisión 6):

- dev: `win.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/#${hash}`)` bajo el mismo guard `is.dev && ELECTRON_RENDERER_URL` de `createWindow()`.
- prod: `win.loadFile(join(__dirname, '../renderer/index.html'), { hash })` — la opción `hash` de `loadFile` es exactamente para esto y evita construir URLs `file://` a mano.

**Deduplicación**: clave del registro = el componente (no el par componente+entrevista). Solo hay una grabación viva a la vez, así que no puede haber dos entrevistas en juego; con una ventana existente y no destruida se hace `restore()` si está minimizada y `focus()`, y se retorna. Alternativa descartada: clave `componente:interviewId`, que permitiría ventanas huérfanas de otra entrevista sin aportar nada.

**`registerLoopbackHandler`: NO se aplica a estas ventanas.** Es un handler de **sesión** (`session.defaultSession`), no de ventana, y ya está registrado por la principal; volver a llamarlo solo reemplazaría el mismo handler por sí mismo. Las ventanas desacopladas no llaman a `getDisplayMedia` jamás.

**Cierre automático**, dos puntos y solo dos:

- `recording:stop` (`src/main/ipc.ts`): `closeDetachedWindows()` **síncrono y al principio**, junto a `stopAssistant()` y antes de los `await` del flush de Deepgram — mismo criterio que el asistente («ni el flush ni la parada del WAV pueden dejar una ventana espejo congelada»). Cubre Detener, auto-stop y cualquier otra vía, porque `recording:stop` es el punto único de parada.
- `mainWindow.on('closed')` (`src/main/index.ts`), junto al `removeListener` que ya vive ahí. Se elige `closed` y **no** `window:confirm-close` porque `closed` domina estrictamente: cubre el cierre confirmado (que acaba llamando a `mainWindow.close()`), el cierre sin grabación en curso, `Cmd+Q` y cualquier camino futuro. Esto es además lo que resuelve el escenario de «app viva solo por ventanas huérfanas»: en macOS `window-all-closed` no cierra la app, y si quedaran ventanas desacopladas abiertas, el guard `BrowserWindow.getAllWindows().length === 0` de `app.on('activate')` nunca volvería a crear la ventana principal — la app quedaría inusable desde el Dock.

**Sin close-guard** en estas ventanas: no participan en la captura (nota técnica de la spec). Su handler `closed` solo hace `unregisterDetachedWindow(component)`.

### 2. Canal de apertura: `window:open-detached`, fire-and-forget con validación en frontera

`ipcMain.on('window:open-detached', (_event, component: unknown, interviewId: unknown) => { … })` registrado en `src/main/ipc.ts` **junto a `window:set-theme`**, con el mismo criterio: un payload inesperado se ignora en silencio. Validación: `isDetachedComponent(component)` y `typeof interviewId === 'string' && interviewId !== ''`.

**Sin envelope**: la invariante del proyecto exige envelope discriminado en los canales **que pueden fallar de forma que el renderer deba distinguir el motivo**; abrir una ventana no tiene fallo accionable para el renderer (precedente exacto `window:set-theme`, y `assistant:set-pinned` / `assistant:resume`, que son `invoke` sin envelope precisamente por ser no-ops silenciosos en main).

**Sin guard de `isRecordingActive()`**: el gate «solo durante la grabación» es una regla de UI (los botones no existen fuera de la grabación) y duplicarla en main no compra nada — una ventana abierta sin grabación se cerraría igualmente con la principal.

### 3. Difusión de `assistant:update`: entrega dirigida al registro de desacopladas, no `getAllWindows()`

En `src/main/assistantService.ts` se sustituye el cuerpo de `emitUpdate` por un despachador único:

```ts
function dispatchAssistantEvent(primary: WebContents, event: AssistantUpdateEvent): void {
  lastEvent = event
  if (!primary.isDestroyed()) primary.send('assistant:update', event)
  for (const wc of listDetachedWebContents()) {
    if (wc !== primary) wc.send('assistant:update', event)
  }
}
```

`emitUpdate(target, event)` pasa a delegar en él, y la rama `no-key` de `startAssistant` (que hoy hace `sender.send` a mano) también, para que **todo** evento del asistente pase por un único punto.

Por qué el registro y no el precedente `BrowserWindow.getAllWindows()` de `scriptAutoGenerationService`:

- **Semántica más precisa**: los eventos del asistente van al dueño de la sesión + sus espejos, no a ventanas arbitrarias.
- **Regresión cero en las 11 suites de main que arrancan el asistente** (`tests/unit/assistant/*` ×7, `latency`, `degradation`, `custom-prompts`, `ai-cost`): todas mockean `electron` sin `BrowserWindow`, así que un `BrowserWindow.getAllWindows()` en el camino de emisión las rompería en bloque con un `TypeError`; con el registro, en tests el `Map` está vacío, `listDetachedWebContents()` devuelve `[]` y el `sender` mockeado sigue recibiendo exactamente los mismos eventos que hoy. **Ninguna de esas 11 suites necesita adaptación.**
- **Observabilidad para QA**: `detachedWindowRegistry.ts` es un módulo puro sin mocks — QA puede registrar dos `WebContents` falsos (`{ isDestroyed: () => false, send: vi.fn() }` dentro de un `BrowserWindow` falso), arrancar el asistente con un `sender` mockeado y asertar que el mismo `assistant:update` llega a los tres. Es un seam de inyección real, no un truco de test.

Alternativa descartada: `BrowserWindow.getAllWindows()` dentro de `assistantService` + añadir `BrowserWindow: { getAllWindows: () => [] }` al mock de `electron` de las 11 suites. Funciona (precedente `scriptAutoGenerationService.test.ts`) pero paga 11 ficheros de churn en suites críticas a cambio de una semántica peor.

### 4. Snapshot inicial: consulta puntual `assistant:get-snapshot`, no re-emisión

`assistantService` guarda `let lastEvent: AssistantUpdateEvent | null = null` a nivel de módulo (lo escribe `dispatchAssistantEvent`, lo limpia `stopAssistant`) y exporta `getAssistantSnapshot(): AssistantUpdateEvent | null`. Se registra `ipcMain.handle('assistant:get-snapshot', () => getAssistantSnapshot())` en `src/main/ipc.ts`, junto al resto de canales `assistant:*`. **Sin envelope**: no puede fallar; sin sesión devuelve `null` (precedente `permissions:get-status` y `recording:get-transcript-stats`, que también son `handle` con retorno plano).

Guardar el último evento emitido —en lugar de recomponerlo desde la sesión— garantiza que el snapshot sea **el mismo estado** que vieron las demás superficies, incluidos `state` (que es derivado por evento y no vive en la sesión), `usage`, `error` y `pauseLimitUsd`. Recomponerlo obligaría a duplicar esa derivación y a mantenerla en sincronía para siempre.

Alternativa descartada: **re-emisión al estar lista la ventana** (`did-finish-load` o un `assistant:ready` desde el renderer). Necesita igualmente un viaje IPC de ida, tiene carrera propia (la re-emisión llega a todas las ventanas y a la principal, que ya lo tenía) y deja el estado inicial dependiendo del momento exacto de un evento de carga; la consulta es determinista y no tiene efectos laterales sobre la ventana principal.

**Consumo en el renderer sin tocar el comportamiento de la página principal**: `useAssistant` gana un parámetro **opcional** `options?: { hydrate?: boolean }`. Con `hydrate: true` (solo la ventana del asistente) el efecto se suscribe **primero** y después llama a `window.api.assistant.getSnapshot()`; el resultado se aplica **solo si aún no ha llegado ningún evento push** (bandera en un `useRef` puesta por el listener), para que la hidratación tardía jamás pise un estado más nuevo. Todas las llamadas actuales `useAssistant()` quedan idénticas. Alternativa descartada: un hook separado `useDetachedAssistant` — duplicaría la máquina de estados del evento (la lógica de `paused`/`error`/`analyzing`) con riesgo permanente de divergencia entre las dos superficies, que es exactamente lo que los ACs prohíben.

### 5. Sincronía del guión: evento nuevo y dedicado `db:interview-updated`

Módulo nuevo `src/main/windowBroadcast.ts`:

- `broadcastToAllWindows(channel: string, payload: unknown): void` — el bucle `BrowserWindow.getAllWindows()` + guard `isDestroyed()` extraído tal cual del precedente.
- `broadcastInterviewUpdated(interview: Interview): void` — `broadcastToAllWindows('db:interview-updated', interview)`.

Se emite desde **dos** puntos, los únicos que persisten el guión por acción del usuario durante la grabación:

- `src/main/db/ipc.ts` línea 67: `handleDb('db:interview:update', …)` pasa de referenciar `repository.updateInterview` a envolverla — `(id, patch) => { const updated = repository.updateInterview(id, patch); broadcastInterviewUpdated(updated); return updated }`. El `try/catch` de `handleDb` sigue gobernando el envelope: si la mutación lanza, no hay difusión. Cubre el **guardado manual** del editor (`ScriptSection.handleSave`).
- `src/main/ipc.ts`: `handleLlm('llm:generate-script', …)` pasa a `async (interviewId) => { const updated = await generateInterviewScript(interviewId); broadcastInterviewUpdated(updated); return updated }`. Cubre **Generar/Regenerar** manual. Cero cambios en `llmService`.

Uniformidad (una línea, riesgo nulo): emitirlo también en la rama `done` de `scriptAutoGenerationService`, y refactorizar su `emitScriptGenerationEvent` para que use `broadcastToAllWindows` (su suite ya mockea `BrowserWindow.getAllWindows`, así que sigue verde).

Por qué una señal nueva y no reutilizar `llm:script-generation`: **`docs/MEMORY.md` (SPEC-058-iter-1) descartó explícitamente emitir `llm:script-generation` desde el camino manual** porque obligaría a `ScriptSection` a deduplicar toasts y a proteger el remontaje del editor (`editorResetKey`) frente a eventos que ella misma provocó. El evento nuevo evita ese acoplamiento por construcción: **la ventana principal no lo escucha en ningún componente**, solo lo hace `ScriptWindowPage`. El riesgo de regresión es literalmente cero — es código muerto para la principal.

Alternativas descartadas:

- **Sondeo periódico** desde la ventana del guión (`db:interview:get` cada N s): cumple el AC pero introduce un timer, latencia visible y lecturas de disco innecesarias durante la llamada.
- **Relé renderer→main→renderer** (la página principal notifica el guión nuevo): acopla la página principal a la existencia de la ventana desacoplada y se rompe si la principal navega o se desmonta.
- **Difundir desde `repository.updateInterview`**: metería `electron` en el repositorio, que hoy es puro y está cubierto por 10 suites de persistencia en entorno node.

Los demás canales que mutan la entrevista (`confirm-objectives`, `hide-onboarding`, `assign-company`, `set-discard-reasons`) **no** emiten: no tocan `scriptMarkdown` y ampliar la superficie sin necesidad solo añade ruido.

### 6. Rutas y vistas: fuera del `Layout`, con un helper de ruta compartido main↔renderer

Fichero nuevo `src/renderer/src/types/detached.ts` (importable por main, precedente: main ya importa tipos de `audio`, `domain`, `llm`, `assistant`):

```ts
export type DetachedComponent = 'assistant' | 'script'
export function isDetachedComponent(value: unknown): value is DetachedComponent
export const DETACHED_ROUTES = { assistant: '/detached/assistant/:interviewId', script: '/detached/script/:interviewId' }
export function detachedWindowHash(component: DetachedComponent, interviewId: string): string  // `/detached/${component}/${interviewId}`
```

Main construye la URL con `detachedWindowHash`, `App.tsx` declara las rutas con `DETACHED_ROUTES`: una sola fuente de verdad, imposible que se desincronicen (que sería un fallo mudo: ventana en blanco o 404).

En `src/renderer/src/App.tsx`, las dos rutas se declaran **hermanas** de `<Route path="/" element={<Layout />}>`, dentro del mismo `<Routes>`. El `<Route path="*" element={<NotFoundPage />}>` que vive dentro del `Layout` no las captura: React Router v6 ordena por especificidad y los segmentos estáticos ganan al splat. Siguen bajo `ThemeProvider`, `TooltipProvider` y `Toaster`, que es lo deseable (el tema se comparte por `localStorage` del mismo origen y los Tooltips de las acciones inline del panel necesitan su provider).

- `src/renderer/src/pages/AssistantWindowPage.tsx` — raíz `<div data-testid="assistant-window-root" className="h-screen overflow-y-auto p-4">`, `useAssistant({ hydrate: true })` y `<AssistantPanel …/>` con exactamente las mismas props que le pasa `AssistantLiveSection`. **Cero cambios en `AssistantPanel`** (los estados de cola vacía, pausa por coste, error y línea de uso ya viven ahí y satisfacen sus ACs por reutilización).
- `src/renderer/src/pages/ScriptWindowPage.tsx` — raíz `<div data-testid="script-window-root" className="h-screen overflow-y-auto p-4">` con unión discriminada `{status:'loading'|'ready'|'error'}` (patrón `InterviewDetailPage`): carga con `window.api.db.getInterview(interviewId)`, `setState` en el callback de la promesa (nunca síncrono en el efecto, regla `react-hooks/set-state-in-effect`), se suscribe a `window.api.db.onInterviewUpdated` filtrando por `interview.id` y **usa el payload del evento directamente** (sin re-consultar). `loading` → `Skeleton` de párrafos; `error` → `data-testid="script-window-error"` con mensaje y `Button variant="outline"` «Reintentar» que reintenta la carga; `ready` con `scriptMarkdown === null` → `data-testid="script-window-empty"` con «Esta entrevista no tiene guión.» sin CTA; `ready` con guión → `<MarkdownView markdown={…} testId="script-window-markdown" />`, que **ya refresca su contenido vía `useEffect` cuando cambia la prop** — el AC de actualización en vivo sale gratis. El error tiene prioridad sobre el vacío.

### 7. Botones de desacople: un componente compartido con el `span` obligatorio

Componente nuevo `src/renderer/src/components/detached/DetachWindowButton.tsx`, props `{ component, interviewId, testId, ariaLabel, tooltip, disabledReason?: string | null }`:

- `Button variant="ghost" size="icon-sm"` (ambos existen en `components/ui/button.tsx`), icono `PictureInPicture2` de lucide, `aria-label` y `data-testid` por prop, `onClick={() => window.api.window.openDetached(component, interviewId)}`.
- **Estructura de Tooltip única e invariable**: `<Tooltip><TooltipTrigger asChild><span tabIndex={0}>{button}</span></TooltipTrigger><TooltipContent>{disabledReason ?? tooltip}</TooltipContent></Tooltip>`. El `span` va **siempre**, esté el botón habilitado o no — lección SPEC-029 registrada en `MEMORY.md` y reaplicada en SPEC-055-iter-1 (`IconAction`): si la envoltura cambia entre `disabled` y `enabled`, React remonta el botón y el primer clic tras habilitarse se pierde. Aquí además el botón del asistente transita `no-key → idle` en la vida real.

Ubicaciones:

- **Asistente** — `src/renderer/src/components/recording/AssistantLiveSection.tsx`: la `<section data-testid="assistant-live-section">` pasa a `className="flex flex-col gap-2"` con una fila de cabecera `<div className="flex items-center justify-end">` **encima** del `AssistantPanel` (wireframe de la spec). `testId="detach-assistant-button"`, `ariaLabel="Abrir asistente en ventana"`, `tooltip="Asistente en una ventana aparte"`, `disabledReason = assistant.state === 'no-key' ? 'Configura tu clave de Anthropic en Ajustes para abrir el asistente en una ventana' : null`. La sección necesita el id de la entrevista, que el controller **no** expone: se añade la prop **requerida** `interviewId: string` (la pasan las dos páginas como `interview.id`). Requerida y no opcional a propósito: un olvido de cableado debe romper el typecheck, no esconder el botón en silencio.
- **Guión** — `src/renderer/src/components/interviews/ScriptSection.tsx`: dentro de la fila de cabecera existente (`<div className="flex flex-wrap items-center justify-between gap-3">`), a la derecha de Generar/Regenerar. Para no romper el `justify-between` con el `<h3>`, los controles de la derecha se agrupan en un `<div className="flex items-center gap-2">` que envuelve el botón de generación existente y el nuevo. `testId="detach-script-button"`, `ariaLabel="Abrir guión en ventana"`, `tooltip="Guión en una ventana aparte"`, sin `disabledReason` (el guión no depende de la clave para consultarse).

**Cómo llega `capturing` a `ScriptSection`**: prop **opcional** `capturing?: boolean` con default `false` en `ScriptSection` y en `NoteScriptSections`, que la reenvía a `ScriptSection` en sus **tres** ramas de composición (Tabs, apilado nota-primero y apilado guión-primero). Al ser opcional con default `false`, las suites que hoy montan `NoteScriptSections` o `ScriptSection` sin la prop siguen compilando y pasando sin tocar una línea: sin `capturing`, el botón no se renderiza — que es exactamente el AC «entrevista sin grabación en curso → el botón no se muestra». Las dos páginas pasan `capturing={controller.capturing}`.

## Cambios por fichero

### Nuevos — main

1. `src/main/detachedWindowRegistry.ts` — registro `Map<DetachedComponent, BrowserWindow>` con imports **type-only** de electron. Sin lógica de UI, sin efectos.
2. `src/main/detachedWindows.ts` — `openDetachedWindow(component, interviewId)` (dedup + foco, creación con las opciones de la decisión 1, `page-title-updated` neutralizado, título desde el repositorio con `try/catch`, carga dev/prod con hash, `setWindowOpenHandler`, `ready-to-show → show`, `closed → unregister`) y `closeDetachedWindows()` (cierra todas y vacía el registro; idempotente y tolerante a ventanas ya destruidas).
3. `src/main/windowBroadcast.ts` — `broadcastToAllWindows(channel, payload)` y `broadcastInterviewUpdated(interview)`.

### Nuevos — renderer

4. `src/renderer/src/types/detached.ts` — `DetachedComponent`, `isDetachedComponent`, `DETACHED_ROUTES`, `detachedWindowHash`.
5. `src/renderer/src/components/detached/DetachWindowButton.tsx` — botón compartido (decisión 7).
6. `src/renderer/src/pages/AssistantWindowPage.tsx` — vista de la ventana del asistente.
7. `src/renderer/src/pages/ScriptWindowPage.tsx` — vista de la ventana del guión con loading / ready / empty / error + «Reintentar».

### Modificados — main y preload

8. `src/main/index.ts` — en `mainWindow.on('closed')`, `closeDetachedWindows()` antes del `removeListener` actual. Nada más (el close-guard queda intacto).
9. `src/main/ipc.ts` — (a) `ipcMain.on('window:open-detached', …)` con validación en frontera, junto a `window:set-theme`; (b) `ipcMain.handle('assistant:get-snapshot', …)` junto a los demás `assistant:*`; (c) `closeDetachedWindows()` al inicio de `recording:stop`, junto a `stopAssistant()`; (d) `handleLlm('llm:generate-script', …)` envuelto para difundir `broadcastInterviewUpdated(updated)`.
10. `src/main/assistantService.ts` — `lastEvent` de módulo, `dispatchAssistantEvent(primary, event)`, `emitUpdate` delegando en él, rama `no-key` de `startAssistant` delegando también, `getAssistantSnapshot()` exportada, `stopAssistant()` limpiando `lastEvent`.
11. `src/main/db/ipc.ts` — `db:interview:update` envuelto para difundir tras la mutación exitosa.
12. `src/main/scriptAutoGenerationService.ts` — usa `broadcastToAllWindows`; difunde también `db:interview-updated` en la rama `done`.
13. `src/preload/index.ts` — `window.openDetached(component, interviewId)` → `ipcRenderer.send('window:open-detached', …)`; `assistant.getSnapshot()` → `ipcRenderer.invoke('assistant:get-snapshot')`; `db.onInterviewUpdated(cb)` → `on/removeListener` de `db:interview-updated` devolviendo el unsubscribe (patrón `onScriptGeneration`).

### Modificados — contratos y renderer

14. `src/renderer/src/types/audio.ts` — `MauryaApi.window.openDetached`.
15. `src/renderer/src/types/assistant.ts` — `AssistantApi.getSnapshot`.
16. `src/renderer/src/types/domain.ts` — `DbApi.onInterviewUpdated`.
17. `src/renderer/src/App.tsx` — las dos rutas nuevas, hermanas de la ruta del `Layout`.
18. `src/renderer/src/hooks/useAssistant.ts` — parámetro opcional `{ hydrate }` + hidratación protegida por bandera.
19. `src/renderer/src/components/recording/AssistantLiveSection.tsx` — prop `interviewId` + fila de cabecera con el botón.
20. `src/renderer/src/components/interviews/ScriptSection.tsx` — prop opcional `capturing` + botón en la cabecera.
21. `src/renderer/src/components/interviews/NoteScriptSections.tsx` — prop opcional `capturing` reenviada en las tres ramas.
22. `src/renderer/src/pages/InterviewDetailPage.tsx` y `src/renderer/src/pages/CaptureDetailPage.tsx` — `interviewId={interview.id}` a `AssistantLiveSection` y `capturing={controller.capturing}` a `NoteScriptSections`.

## Orden de implementación

1. Contratos: `types/detached.ts` + las tres firmas nuevas en `types/audio.ts`, `types/assistant.ts`, `types/domain.ts` + preload. `npm run typecheck` verde con la app aún sin comportamiento nuevo.
2. Main, ciclo de vida: registro + `detachedWindows.ts` + `window:open-detached` + cierre en `recording:stop` y en `closed`.
3. Main, sincronía: `dispatchAssistantEvent` + `assistant:get-snapshot` + `windowBroadcast.ts` + los dos emisores de `db:interview-updated`.
4. Renderer, vistas: rutas, `AssistantWindowPage` (con `hydrate`), `ScriptWindowPage`.
5. Renderer, botones: `DetachWindowButton` + `AssistantLiveSection` + `ScriptSection` + `NoteScriptSections` + las dos páginas.
6. `npm run typecheck && npm run lint && npm test` (la suite existente debe quedar **verde sin adaptaciones**; ver siguiente sección) + verificación manual end-to-end.

## Impacto esperado sobre las suites existentes

**Predicción: la suite actual queda verde sin adaptar tests.** Detalle de por qué, suite a suite, y qué habría que mirar si falla:

- `tests/unit/assistant/*.ts` (7), `latency/assistantService.latency.test.ts`, `degradation/assistantService.degraded.test.ts`, `custom-prompts/customPromptsResolution.test.ts`, `ai-cost/assistantService.aiCost.test.ts` — **sin cambios**, por la decisión 3: el registro está vacío en tests y el `sender` mockeado recibe los mismos eventos. Si se optase por `BrowserWindow.getAllWindows()` habría que añadir `BrowserWindow: { getAllWindows: () => [] }` al mock de `electron` en los 11.
- `tests/unit/script/scriptAutoGenerationService.test.ts` — su mock ya provee `BrowserWindow.getAllWindows`, comportamiento idéntico.
- `tests/unit/script/ScriptSection.test.tsx` y `tests/unit/markdown/NoteScriptSections.test.tsx` — **sin cambios** gracias a `capturing` opcional con default `false`.
- Suites que montan las páginas de detalle (`recording/AssistantLiveSection.test.tsx`, `interviews/InterviewDetailPage.test.tsx`, `interviews/OnboardingBannerBridge.test.tsx`, `captures/CaptureDetailPage*.test.tsx`, `objectives/ObjectivesSection*.test.tsx`, `notes/NoteSection.test.tsx`, `recording/RecordingSection.test.tsx`) — aparecen dos botones nuevos durante la grabación. Riesgo controlado: los nombres accesibles («Abrir asistente en ventana», «Abrir guión en ventana») no colisionan con ninguno existente, y el texto del Tooltip solo se renderiza al abrirse. **Punto de vigilancia** (lección SPEC-058 §1): cualquier aserción que **cuente** botones dentro de la sección del asistente o de la cabecera del guión (`getAllByRole('button')`) subirá en uno; la adaptación correcta es filtrar por el `data-testid` del elemento nuevo, nunca cambiar el número a ojo.
- `tests/helpers/mockApi.ts` — **adaptación obligatoria**, aunque no rompa la ejecución: `BridgeApi` gana tres métodos (`window.openDetached`, `assistant.getSnapshot`, `db.onInterviewUpdated`) y el objeto literal deja de satisfacer el tipo. Vitest transpila sin typecheck, así que las suites **siguen ejecutándose**, pero `npm run lint` y `tsconfig.test.json` lo señalarán. QA debe añadir los tres mocks y un emisor `emitInterviewUpdated(interview)` gemelo de `emitScriptGeneration`, más `getSnapshot` resolviendo `null` por defecto (estado conservador, criterio ya usado con `llm.getStatus`).

## Riesgos y mitigación

- **Título nativo sobrescrito por el `<title>` del documento** (alto, silencioso): rompe el AC de título sin romper nada más. Mitigado con `page-title-updated` + `preventDefault()` registrado antes de la carga; queda como verificación MANUAL explícita.
- **Ruta desincronizada entre main y el router** (alto, fallo mudo: ventana en blanco): mitigado con `detachedWindowHash` / `DETACHED_ROUTES` en un único módulo compartido por ambos procesos.
- **Ventanas huérfanas dejando la app inaccesible en macOS** (alto): si la principal se cierra y quedan desacopladas vivas, `app.on('activate')` no recrea nada y el Dock deja de responder. Mitigado cerrándolas en `mainWindow.on('closed')`, que domina todos los caminos de cierre.
- **Regresión sobre la ventana principal por la difusión del asistente** (medio): mitigado por construcción — el `sender` de la sesión sigue recibiendo el evento por la misma vía y en el mismo orden; la fan-out solo añade destinatarios registrados, que en la app real solo existen durante la grabación y en tests no existen.
- **Doble entrega a la ventana principal** (bajo): imposible por el guard `wc !== primary`, y por diseño la principal nunca está en el registro de desacopladas.
- **Doble persistencia / conflicto de guardado del guión** (bajo): la ventana del guión es solo lectura; no expone editor, ni guardar, ni regenerar.
- **Navegación accidental dentro de una ventana desacoplada** (bajo): el `AssistantPanel` contiene un `<Link to="/settings">` en su aviso de `no-key`; pulsarlo dentro de la ventana desacoplada la llevaría a Ajustes **con `Layout`**. En la práctica es inalcanzable (el botón está deshabilitado en `no-key` y la clave se resuelve una vez por sesión), pero conviene anotarlo. Si molestase, la vía es un guard de ruta, no tocar `AssistantPanel`.
- **Coste de memoria de un renderer completo por ventana** (bajo, asumido): dos procesos de renderizado extra durante la llamada; es el precio de reutilizar el mismo bundle y preload, que es lo que garantiza la paridad visual y de comportamiento que piden los ACs.

## Verificación

**Automatizable con Vitest (jsdom + mock de `window.api`)**: presencia/ausencia de ambos botones según `capturing` en las dos páginas; deshabilitado + Tooltip del botón del asistente en `no-key`; que el clic llama a `openDetached` con el componente y el `interviewId` correctos; render completo de `AssistantWindowPage` (cola, ancladas, cola vacía, pausa con «Reanudar», línea de error, acciones inline delegando en el bridge); hidratación por snapshot y su no-pisado por un evento previo; render de `ScriptWindowPage` en sus cuatro estados y el reintento; actualización de la ventana del guión al emitir `db:interview-updated`.

**Automatizable en entorno node (main)**: `detachedWindowRegistry` (alta, baja, dedup, filtrado de destruidos); `detachedWindows` con `electron` mockeado (una sola construcción por componente y `focus()` en la segunda petición, título compuesto, `closeDetachedWindows` cerrando y vaciando el registro); difusión de `assistant:update` al `sender` **y** a los `WebContents` registrados; `getAssistantSnapshot` devolviendo el último evento y `null` tras `stopAssistant`; `broadcastInterviewUpdated` disparado por `db:interview:update` y por `llm:generate-script`.

**`MANUAL` en `tests/spec-test-map.json`** (precedente SPEC-054/057, sin e2e en el proyecto): los tres ACs de «Ventanas nativas» en su parte no automatizable — geometría real 420×640 y mínimos 360×480, ausencia de always-on-top, título visible en la barra nativa (la neutralización de `page-title-updated` solo se comprueba de verdad en la app), foco efectivo de la ventana existente al repetir el clic, y conservación independiente de posición/tamaño al mover y redimensionar. También MANUAL: que `recording:stop` y el cierre de la principal cierren las ventanas **en la app real** (el `closeDetachedWindows()` en sí queda cubierto por unidad, pero su cableado en el flujo completo no), la coexistencia visual de las tres ventanas, el scroll vertical sin scroll horizontal a 360 px de ancho, y los Tooltips reales al hover (los `aria-label` sí quedan cubiertos).
