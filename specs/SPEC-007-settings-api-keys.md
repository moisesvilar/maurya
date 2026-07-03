# SPEC-007 — Ajustes: claves de IA con guardado seguro

> Requisitos origen: RF-APP-003 (Must) + NFR §4.6 "API keys en keychain, no en texto plano" · Hito H1 ítems 3 y 4 · Checklist: "Pantalla de settings para gestionar API keys de LLM y STT" + "Guardado seguro de API keys en keychain"
> Relacionados: SPEC-002 (hoy la key de Deepgram se lee de `.env.local`; pasa a ser fallback), RF-GUION (H3 consumirá la clave de Anthropic aquí configurada), H1 ítem 6 (layout de navegación completo — aquí solo navegación mínima)
> Naturaleza: feature de producto con UI.

## Descripción

Añade la página de Ajustes de Maurya donde el usuario introduce y gestiona sus claves de IA (Deepgram para transcripción y Anthropic para el LLM). Las claves se guardan cifradas con `safeStorage` de Electron (respaldado por el Keychain en macOS), nunca en texto plano, y una vez guardadas no vuelven a mostrarse (solo su estado y sus últimos 4 caracteres). La clave de Deepgram configurada aquí prevalece sobre la de `.env.local`, que queda como fallback de desarrollo.

## Alcance de implementación

- Esta spec define **únicamente el código de producción** que debe entregarse: UI (componentes, páginas, estados), datos (queries, mutations, schema si aplica) y lógica de negocio asociada.
- **Los tests automatizados están fuera del alcance del implementador.** No se deben escribir tests unitarios (Vitest / Testing Library) ni tests end-to-end (Playwright) como parte de esta entrega. Los tests los genera la skill `/somo-qa-dev` y los ejecuta `/somo-qa-tester` contra el código ya pusheado, en un paso posterior del pipeline de QA de SOMO. Cualquier test que el implementador entregue será descartado o reemplazado.
- Si la spec requiere algún ajuste de schema, migración Supabase o cambio de RLS, se indica explícitamente en "Notas técnicas". Si no se indica, no hay cambios de infraestructura. **Sin Supabase.**
- **Matiz:** el layout de navegación definitivo (sidebar) es el ítem 6 de H1; esta spec introduce solo React Router y una navegación mínima harness ⇄ ajustes. "Probar conexión" de las claves queda fuera (H7).

## Criterios de aceptación

### Navegación mínima

- GIVEN la pantalla del harness WHEN el usuario pulsa el botón de Ajustes (icono engranaje, aria-label "Ajustes") THEN navega a la página de Ajustes.
- GIVEN la página de Ajustes WHEN el usuario pulsa el back button "Volver" THEN regresa a la pantalla del harness.

### Guardado seguro (Deepgram y Anthropic, mismo comportamiento)

- GIVEN el campo de la clave de Deepgram con un valor WHEN el usuario pulsa "Guardar" THEN aparece el Toast "Clave de Deepgram guardada" y el estado pasa a Badge "Configurada" acompañado de los últimos 4 caracteres (formato "····abcd").
- GIVEN una clave guardada WHEN se inspecciona cualquier archivo del disco de la app THEN la clave no aparece en texto plano (se persiste cifrada con safeStorage).
- GIVEN una clave guardada WHEN la app se cierra y se vuelve a abrir THEN el estado sigue siendo "Configurada" con los mismos últimos 4.
- GIVEN una clave guardada WHEN el usuario vuelve a la página de Ajustes THEN el campo de entrada está vacío (la clave nunca se re-muestra) y el estado la representa.

### Uso de la clave (Deepgram)

- GIVEN una clave de Deepgram guardada en Ajustes WHEN se inicia una captura con transcripción THEN se usa la clave de Ajustes (prevalece sobre `.env.local`).
- GIVEN sin clave en Ajustes pero con `DEEPGRAM_API_KEY` en `.env.local` WHEN se inicia una captura THEN se usa la de `.env.local` (compatibilidad con el flujo actual).
- GIVEN sin clave en ningún sitio WHEN se inicia una captura THEN el comportamiento es el actual de SPEC-002 (estado "Sin key", captura sin transcripción).

### Eliminación

- GIVEN una clave configurada WHEN el usuario pulsa "Eliminar" THEN se abre un AlertDialog "Eliminar clave" que explica la consecuencia (la transcripción/LLM dejará de funcionar salvo fallback) con botones Cancelar (outline) y Eliminar (destructive).
- GIVEN el AlertDialog abierto WHEN el usuario confirma "Eliminar" THEN el estado pasa a "No configurada", aparece Toast "Clave eliminada" y la clave desaparece del almacenamiento cifrado.

### Validación

- GIVEN el campo de clave vacío o solo espacios WHEN el usuario pulsa "Guardar" THEN aparece el error inline "Introduce una clave" y no se modifica nada.

### Error state (cifrado no disponible)

- GIVEN `safeStorage` reporta cifrado no disponible WHEN se abre la página de Ajustes THEN se muestra un Alert destructive explicando que no es posible guardar claves de forma segura en este equipo, y los botones "Guardar" quedan deshabilitados con Tooltip explicativo. Nunca se guarda una clave sin cifrar.

### Edge cases

- GIVEN una clave ya configurada WHEN el usuario guarda una nueva THEN la nueva sustituye a la anterior (estado actualiza los últimos 4) sin paso intermedio.
- GIVEN el estado de las claves cargándose al abrir Ajustes WHEN tarda THEN se muestran Skeletons en las filas de estado (no un spinner de página).

## UX Design

### Wireframe textual

**Página de Ajustes** (`/settings`) — **Layout 3 — Formulario** (contenido centrado, max-width 640px), sin sidebar (el layout global llega en el ítem 6; excepción documentada en SPEC-001).

1. **Back button** arriba a la izquierda: Button (variant `ghost`, icono ArrowLeft) "Volver".
2. **Título** (`h1`): "Ajustes".
3. **Sección "Claves de IA"** (heading `h3`) con descripción corta `muted`: "Las claves se guardan cifradas en este equipo y nunca vuelven a mostrarse."
4. **Fila Deepgram** (transcripción):
   - Label "Deepgram (transcripción)" + estado a la derecha: Badge verde "Configurada" + texto mono `muted` "····abcd" / Badge gris "No configurada".
   - Input (type password, placeholder "Pega aquí tu API key de Deepgram") + Button (variant `default`) "Guardar" a su derecha.
   - Button (variant `ghost`, `text-destructive`, icono Trash2) "Eliminar" visible solo si configurada.
   - Error inline bajo el input cuando la validación falla.
5. **Fila Anthropic** (LLM): idéntica estructura, label "Anthropic (asistente y guiones)", placeholder correspondiente.
6. **Zona de error de cifrado:** Alert (variant `destructive`) encima de las filas cuando safeStorage no está disponible.

**Cambio en la pantalla del harness:** Button (variant `ghost`, size icon, icono Settings, aria-label "Ajustes") arriba a la derecha, junto al título.

### Componentes shadcn utilizados

Ya instalados: `Button`, `Input`*, `Badge`, `Tooltip`, `AlertDialog`, `Toast/sonner`, `Alert`, `Skeleton`*.

*Componentes a instalar con CLI si no están: `Input`, `Skeleton` (el resto existe del spike).

### Patrón de interacción

- **Página nueva (no Dialog/Sheet)** para Ajustes: es un destino con entidad propia y crecerá (note-templates, ítem 5) — regla de composición 4.1 (sub-navegación futura → página).
- **Back button, no breadcrumbs**: profundidad 2, regla de navegación 2.3.
- **Write-only de las claves**: el campo nunca precarga la clave guardada; el estado se comunica con Badge + últimos 4. Decisión no cubierta por el design system: patrón estándar de gestión de secretos; evita exponer el valor a shoulder-surfing y al renderer.
- **AlertDialog antes de eliminar** (acción destructiva, regla 6.3) con consecuencia explícita y botón verbo "Eliminar".
- **Toast tras guardar/eliminar** (acción mutadora exitosa, regla 6.1), textos literales de los ACs.
- **Validación inline on submit** ("Introduce una clave") — no hay on-blur relevante en un campo único.
- **Guardar deshabilitado + Tooltip** cuando el cifrado no está disponible (regla 5.4: disabled siempre con explicación).
- **Skeleton para el estado inicial** (carga de contenido con layout conocido, regla 6.4).

### Comportamiento responsive

- **Desktop (lg+):** layout completo descrito. Ventana Electron ≥720×640.
- **Tablet/Mobile:** no aplican (excepción documentada en SPEC-001: producto exclusivamente desktop).

## Notas técnicas

- **Cifrado:** `safeStorage.isEncryptionAvailable()` + `encryptString`/`decryptString` en main. Los blobs cifrados (base64) se persisten en `userData/maurya-data/secrets.json` — separados de `db.json` (dominio) para que backups/inspecciones del dominio no arrastren secretos.
- **Bridge:** `api.secrets` en preload: `getStatus(): Promise<{ available: boolean; deepgram: KeyStatus; anthropic: KeyStatus }>` con `KeyStatus = { configured: boolean; last4: string | null }`; `save(kind: 'deepgram' | 'anthropic', value: string)`; `remove(kind)`. **La clave nunca viaja de main a renderer**; el renderer solo la envía al guardar.
- **Resolución de la clave Deepgram en main** (transcriptionService): 1º secrets cifrados → 2º `process.env.DEEPGRAM_API_KEY` (cargada de `.env.local`) → 3º sin key (flujo SPEC-002). La clave Anthropic solo se guarda/gestiona; su consumo llega en H3.
- **Router:** React Router v7 (**dependencia npm nueva autorizada**: `react-router-dom`). Usar **HashRouter** (la app empaquetada carga por `file://`; BrowserRouter rompería el deep-linking al recargar). Rutas: `/` (harness) y `/settings`.
- **Últimos 4:** derivados en main al guardar y persistidos junto al blob (evita descifrar para mostrar estado).
- **Divergencia de stack:** igual que specs previas. Los servicios de secrets en main son testeables en node env con `vi.mock('electron')` (mock de safeStorage) + dir temporal, mismo patrón que SPEC-006.
