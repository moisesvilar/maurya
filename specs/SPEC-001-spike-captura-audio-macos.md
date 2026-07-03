# SPEC-001 — Spike: captura simultánea de micrófono + audio del sistema en macOS

> Requisito origen: RF-AUDIO-002 (Must) · Hito H0 · Checklist: "Prueba de captura simultánea de micrófono + altavoces/salida del sistema en macOS"
> Relacionados: RF-AUDIO-005 (permisos), RF-AUDIO-003 (condiciona el formato de salida), RF-AUDIO-001 (iniciar/detener)
> Naturaleza: **SPIKE** (prueba de concepto go/no-go, Riesgo #4 del PRD). El código es un harness de validación técnica, no una feature de producto final.

## Descripción

Prueba de concepto que valida la viabilidad técnica de capturar, a la vez, el audio del micrófono y el de los altavoces/salida del sistema en macOS desde una aplicación Electron. Sirve para entrevistas presenciales (solo micrófono relevante) y virtuales (el interlocutor suena por los altavoces). El entregable es doble: un harness ejecutable que demuestra la captura dual con evidencia grabada, y la información necesaria para la decisión go/no-go del hito H0.

## Alcance de implementación

- Esta spec define **únicamente el código de producción** que debe entregarse: UI (componentes, páginas, estados), datos (queries, mutations, schema si aplica) y lógica de negocio asociada.
- **Los tests automatizados están fuera del alcance del implementador.** No se deben escribir tests unitarios (Vitest / Testing Library) ni tests end-to-end (Playwright) como parte de esta entrega. Los tests los genera la skill `/somo-qa-dev` y los ejecuta `/somo-qa-tester` contra el código ya pusheado, en un paso posterior del pipeline de QA de SOMO. Cualquier test que el implementador entregue será descartado o reemplazado.
- Si la spec requiere algún ajuste de schema, migración Supabase o cambio de RLS, se indica explícitamente en "Notas técnicas". Si no se indica, no hay cambios de infraestructura. **En esta spec no hay Supabase:** el harness es 100% local (Electron), sin backend.
- **Matiz de spike:** el código del harness es desechable por diseño; no debe integrarse en la navegación ni en el modelo de datos del producto. Su único propósito es producir la evidencia de los criterios de aceptación.

## Criterios de aceptación

### Inicio y detención de la captura

- GIVEN los permisos de micrófono y de captura de audio del sistema están concedidos WHEN el usuario pulsa "Iniciar captura" THEN comienza la captura de ambas fuentes y los dos medidores de nivel (micrófono y sistema) reflejan actividad en tiempo real.
- GIVEN la captura está en curso WHEN el usuario habla al micrófono sin audio del sistema sonando THEN solo el medidor de micrófono muestra actividad.
- GIVEN la captura está en curso WHEN se reproduce audio por los altavoces sin hablar al micrófono THEN solo el medidor de sistema muestra actividad.
- GIVEN la captura está en curso WHEN el usuario pulsa "Detener" THEN la captura finaliza, se muestra la duración total y se genera el archivo de grabación en disco.
- GIVEN la captura está en curso WHEN el usuario observa la pantalla THEN se muestra un cronómetro con el tiempo transcurrido en formato mm:ss.

### Evidencia de la grabación (verificación del spike)

- GIVEN una grabación finalizada WHEN se inspecciona el archivo generado THEN contiene las dos fuentes distinguibles (dos pistas separadas, o dos canales de un mismo archivo, una por fuente).
- GIVEN una grabación finalizada donde sonaron ambas fuentes WHEN se reproduce THEN ambas señales son audibles e inteligibles.
- GIVEN una grabación finalizada WHEN se consultan sus propiedades THEN el formato es PCM lineal 16-bit con sample rate 16 kHz (formato de entrada de Deepgram streaming `linear16`).
- GIVEN una grabación finalizada WHEN el usuario pulsa "Mostrar en Finder" THEN se abre la carpeta local que contiene el archivo.

### Permisos (error states)

- GIVEN el permiso de micrófono NO está concedido WHEN el usuario pulsa "Iniciar captura" THEN la captura no arranca y se muestra un Alert destructive con la instrucción concreta para concederlo (Ajustes del Sistema → Privacidad y seguridad → Micrófono).
- GIVEN el permiso de captura de audio del sistema NO está concedido WHEN el usuario pulsa "Iniciar captura" THEN la captura no arranca y se muestra un Alert destructive con la instrucción concreta para concederlo (Ajustes del Sistema → Privacidad y seguridad → Grabación de pantalla y audio del sistema).
- GIVEN la pantalla del harness está abierta WHEN carga THEN se muestra el estado actual de cada permiso (concedido / no concedido) como Badge, sin necesidad de intentar iniciar.

### Edge cases

- GIVEN la captura está en curso WHEN el dispositivo de entrada seleccionado se desconecta THEN la captura se detiene de forma controlada (sin crash), se conserva lo grabado hasta ese momento y se muestra un Alert destructive indicando la causa.
- GIVEN la captura está en curso WHEN el usuario intenta cerrar la ventana THEN se muestra un AlertDialog de confirmación ("Detener captura": la grabación en curso se detendrá y se guardará lo capturado).
- GIVEN hay más de un dispositivo de entrada disponible WHEN el usuario abre el selector de micrófono THEN puede elegir el dispositivo antes de iniciar (el selector queda deshabilitado con Tooltip explicativo durante la captura).

### Sesión sostenida

- GIVEN la captura está en curso WHEN transcurren 15 minutos continuos THEN no hay pérdida de audio, la grabación resultante es continua (sin huecos) y el consumo de memoria del proceso se mantiene estable.

## UX Design

### Wireframe textual

**Pantalla única — Harness de captura**

Decisión no cubierta por el design system: el harness es una prueba de concepto desechable en ventana única, sin navegación de producto. Se resuelve **sin sidebar ni top bar** (excepción a la regla de constantes de layout) porque no existe aún la app contenedora (H1) y añadir chrome de navegación a código desechable es trabajo tirado. El contenido usa la estructura del **Layout 3 — Formulario** (centrado, max-width 640px) por ser una vista de acción única.

De arriba a abajo:

1. **Título** (`h1`): "Spike — Captura de audio macOS".
2. **Sección Permisos** (heading `h3` "Permisos"): dos filas, cada una con label + Badge de estado:
   - "Micrófono" — Badge verde "Concedido" / Badge rojo "No concedido".
   - "Audio del sistema" — Badge verde "Concedido" / Badge rojo "No concedido".
3. **Sección Configuración** (heading `h3`): Select "Micrófono" con los dispositivos de entrada disponibles (default: dispositivo del sistema). Deshabilitado durante la captura, con Tooltip "No se puede cambiar de dispositivo durante la captura".
4. **Sección Captura** (heading `h3`): 
   - Botón principal: Button (variant `default`, icono Mic) "Iniciar captura" ⇄ Button (variant `destructive`, icono Square) "Detener" según estado.
   - Cronómetro mm:ss (texto grande, `muted` cuando parado).
   - Dos medidores de nivel etiquetados: "Micrófono" y "Sistema" (Progress actualizado en tiempo real).
5. **Sección Resultado** (heading `h3`, visible solo tras detener): ruta del archivo generado (texto mono), duración, formato ("PCM 16-bit · 16 kHz · 2 pistas"), y Button (variant `outline`, icono FolderOpen) "Mostrar en Finder".
6. **Zona de errores:** Alert (variant `destructive`) bajo el título cuando falla un permiso, se desconecta un dispositivo o falla la escritura del archivo. Persistente hasta corregir o reintentar.

### Componentes shadcn utilizados

Componentes: `Button`, `Select`, `Badge`, `Tooltip`, `AlertDialog`, `Toast`

Componentes adicionales necesarios (no en la lista base): `Alert` (errores persistentes de permisos/dispositivo), `Progress` (medidores de nivel).

### Patrón de interacción

- **Ventana única sin navegación** — excepción documentada arriba (código desechable de spike; la app contenedora llega en H1).
- **Iniciar/Detener como botón única acción primaria**, alternando variante `default` → `destructive`: la acción de detener descarta… no, detener GUARDA; se usa `destructive` solo como señal visual de "parar algo en curso". El guardado es automático al detener → **Toast default** "Grabación guardada · Mostrar en Finder" (acción mutadora exitosa → Toast, regla 6.1).
- **Errores de permisos como Alert destructive persistente**, no Toast: el usuario debe leerlos con calma y actuar fuera de la app (regla 6.1: información para leer con calma → Alert).
- **Cierre de ventana durante captura → AlertDialog** (acción con consecuencia irreversible sobre la sesión en curso, regla 6.3): título "Detener captura", botones "Cancelar" (outline) y "Detener y guardar" (destructive). Escape = Cancelar.
- **Select deshabilitado durante captura + Tooltip explicativo** (regla 5.4: disabled siempre con Tooltip).
- **Estados de carga:** arranque de captura < 1 s esperado; si supera 1 s, spinner inline en el botón (regla 5.4, loading de acción).

### Comportamiento responsive

- **Desktop (lg+):** layout completo descrito en el wireframe. Es una app Electron de escritorio con tamaño de ventana mínimo fijado (~720×640).
- **Tablet (md-lg) y Mobile (< md):** no aplican — la ventana Electron tiene tamaño mínimo por encima de `md`. Sin variantes responsive en esta spec (excepción justificada: producto exclusivamente desktop, PRD §4.2 y Exclusión #3).

## Notas técnicas

- **⚠️ Divergencia de stack (bloqueante para el pipeline):** el stack por defecto del pipeline (Vite + React + Supabase implementado en Lovable, web) **no puede capturar audio del sistema**: los navegadores no exponen la salida de audio de macOS. Esta spec requiere **Electron + React + TypeScript** (RF-APP-001) ejecutando en macOS. El implementador no puede ser Lovable para esta spec; debe implementarse como proyecto Electron local (p. ej. scaffolding `electron-vite`). Decisión a confirmar por el orquestador/humano antes de pasar a desarrollo.
- **Candidatos técnicos para la captura de sistema en macOS** (el spike debe elegir y documentar):
  1. **ScreenCaptureKit / Core Audio taps** (macOS 13+/14.4+) vía módulo nativo o librería Electron existente (p. ej. loopback nativo). Preferido: sin instalación extra para el usuario.
  2. **Driver de loopback virtual** (BlackHole o similar). Descartable salvo fallo de (1): exige instalación manual y configuración de dispositivo agregado — fricción inaceptable para el producto final.
- **Micrófono:** `getUserMedia` estándar de Chromium/Electron con el dispositivo seleccionado.
- **Formato de salida:** WAV PCM lineal 16-bit · 16 kHz · una pista por fuente (o estéreo con canal L=mic, R=sistema). Elegido por ser la entrada nativa de Deepgram streaming (`linear16`), que consumirá este audio en el siguiente ítem de H0.
- **Permisos macOS:** micrófono (TCC `kTCCServiceMicrophone`) y grabación de pantalla/audio de sistema (TCC Screen & System Audio Recording). El harness consulta el estado sin disparar el prompt al cargar, y solo dispara el prompt del SO al iniciar.
- **Salida del spike (además del código):** los datos de esta implementación alimentan el ítem "Decisión go/no-go" del checklist (mecanismo elegido, versión mínima de macOS soportada, limitaciones encontradas). Ese documento pertenece al último ítem de H0, no a esta spec.
- **Dependencia hacia delante:** ninguna spec previa. El archivo generado y el mecanismo elegido condicionan los ítems 2-6 de H0 y el H4.
