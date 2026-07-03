# Plan de implementación — SPEC-001: Spike captura simultánea mic + audio de sistema (macOS)

> Generado por subagente Plan y aprobado por el orquestador (2026-07-03). Contrato: specs/SPEC-001-spike-captura-audio-macos.md.

## 1. Decisión técnica de captura

### Estado real del ecosistema (verificado 2026-07)

| Opción                                                                      | Estado                                                                                                                                                                                                                                                                                                                                       | Veredicto                |
| --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| `getDisplayMedia` + `setDisplayMediaRequestHandler` con `audio: 'loopback'` | Doc oficial dice "only Windows", pero Chromium trae loopback macOS tras feature flags desde ~128+, activable en Electron 31–38. Backends: **ScreenCaptureKit** (macOS 13+, `MacSckSystemAudioLoopbackOverride`) y **Core Audio taps / CATap** (macOS 14.2+, `MacCatapSystemAudioLoopbackCapture`), junto a `MacLoopbackAudioForScreenShare`. | **Vía principal**        |
| Electron ≥ 39 (CATap por defecto, sin flags)                                | Exige `NSAudioCaptureUsageDescription` en Info.plist — inviable en dev sin empaquetar; regresión de silencio en E40.1.0 (#49607).                                                                                                                                                                                                            | Descartado para el spike |
| Addon nativo (SCK/CATap, helper Swift tipo `audiotee`)                      | Funciona pero añade toolchain nativa a un harness desechable.                                                                                                                                                                                                                                                                                | **Fallback**             |
| Driver virtual (BlackHole)                                                  | Instalación manual del usuario.                                                                                                                                                                                                                                                                                                              | Descartable por diseño   |

### Decisión

- **Vía principal:** Electron **38.x (pin último patch)** + `session.setDisplayMediaRequestHandler(handler, { useSystemPicker: false })` devolviendo `{ video: <pantalla primaria>, audio: 'loopback' }`, con flags en main antes de `app.whenReady()`: `MacLoopbackAudioForScreenShare` + `MacCatapSystemAudioLoopbackCapture` (preferido; sin nag mensual de SCK en macOS 15+); alternativa runtime `MacSckSystemAudioLoopbackOverride`. Micrófono vía `getUserMedia` con `deviceId`.
- **Sin dependencia de `electron-audio-loopback`** (~40 líneas propias; el paquete es referencia).
- **Versiones mínimas:** macOS 14.2 (CATap) target del spike; macOS 13.2 alcanzable con SCK (documentar). Electron pin 38.x.
- **Fallback:** helper nativo CATap/SCK (Swift → PCM por stdout) solo si el probe fase 0 falla.
- **Formato:** WAV único **estéreo** PCM 16-bit · 16 kHz · **L = micrófono, R = sistema**.

## 2. Scaffolding

Proyecto en la **raíz del repo**:

```bash
npm create @quick-start/electron@latest maurya-app -- --template react-ts   # mover a raíz, borrar subcarpeta
npm i -D electron@38
npm i tailwindcss @tailwindcss/vite
npx shadcn@latest init
npx shadcn@latest add button select badge tooltip alert-dialog sonner alert progress
```

- `electron.vite.config.ts`: renderer → `plugins: [react(), tailwindcss()]`, alias `'@': resolve('src/renderer/src')`.
- `main.css`: `@import "tailwindcss";` + tokens shadcn.
- `components.json`: css `src/renderer/src/assets/main.css`, aliases `@/components`, `@/lib/utils`.
- tsconfig node+web: `strict`, `noUnusedLocals`, `noUnusedParameters`; web con paths `@/*`.
- ESLint plantilla + `@typescript-eslint/no-explicit-any: "error"`.
- `BrowserWindow` 720×640 (min), flags antes de `app.whenReady()`.
- NO tocar `src/renderer/src/components/ui/` a mano.

## 3. Estructura de archivos

```
src/
├── main/
│   ├── index.ts                # flags, BrowserWindow, close guard
│   ├── loopbackHandler.ts      # setDisplayMediaRequestHandler → audio 'loopback'
│   ├── permissionService.ts    # getMediaAccessStatus / askForMediaAccess / deep-links Ajustes
│   ├── wavFileService.ts       # WAV streaming: header placeholder → chunks → patch tamaños al stop
│   └── ipc.ts                  # canales ipcMain tipados
├── preload/
│   ├── index.ts                # contextBridge: api.permissions / api.recording / api.window
│   └── index.d.ts
└── renderer/src/
    ├── assets/main.css
    ├── lib/utils.ts
    ├── types/audio.ts          # PermissionsSnapshot, CaptureStatus, AudioInputDevice, RecordingResult, CaptureError
    ├── services/{permissionsService,captureService,wavRecorderService}.ts
    ├── worklets/recorderProcessor.ts   # Float32→Int16 interleaved, lotes ~8192 frames
    ├── hooks/{usePermissions,useAudioDevices,useAudioCapture,useCloseGuard}.ts
    ├── components/spike/{PermissionsSection,ConfigSection,CaptureSection,LevelMeter,ResultSection,CaptureErrorAlert,StopOnCloseDialog}.tsx
    ├── pages/SpikeAudioCapturePage.tsx  # layout centrado max-w-[640px]
    ├── App.tsx                          # página + Toaster (sonner) + TooltipProvider
    └── main.tsx
```

Bridge preload: `api.permissions.getStatus()` (sin prompt) / `requestMicrophone()` / `openSettings(target)`; `api.recording.start()/writeChunk()/stop()/showInFinder()`; `api.window.onCloseRequested(cb)/confirmClose(save)`.

## 4. Implementación por grupo de ACs

- **Inicio/detención + medidores:** `useAudioCapture.start()` → valida permisos → `getUserMedia` → `getDisplayMedia` (interceptado) → `AudioContext({sampleRate:16000})`, 2×`MediaStreamAudioSourceNode` → `ChannelMergerNode` (mic=L, sistema=R) → `AudioWorkletNode`; 2×`AnalyserNode` pre-merger para medidores RMS por rAF → `Progress`. Video track vivo sin renderizar (detenerlo puede silenciar audio, #49607 — verificar en fase 0). Cronómetro = `samplesWritten/16000`. Stop → patch header → `RecordingResult` → Toast "Grabación guardada · Mostrar en Finder". Spinner inline si start >1 s.
- **Evidencia WAV:** `wavFileService` en `app.getPath('userData')/recordings/spike-<timestamp>.wav`, header 44 bytes placeholder (PCM=1, ch=2, 16000 Hz, 16-bit), patch offsets 4 y 40 al stop. Verificable con `afinfo`/`ffprobe`. `shell.showItemInFolder`.
- **Permisos sin prompt:** al montar `getMediaAccessStatus('microphone'|'screen')` → Badges. Al Iniciar sin permiso: Alert destructive con instrucción literal de la spec + botón a Ajustes. Matiz: con CATap el TCC real es "System Audio Recording Only"; 'screen' actúa como proxy — verificar en fase 0.
- **Edge cases:** track `ended` + `devicechange` → parada controlada conservando lo grabado + Alert. Close guard: main `e.preventDefault()` si grabando → `close-requested` → `StopOnCloseDialog` (Cancelar outline / Detener y guardar destructive, Esc=Cancelar). Select disabled durante captura + Tooltip.
- **Sesión 15 min:** streaming puro (lotes ~32 KB → IPC → disco), memoria plana por construcción; validar con Activity Monitor + duración WAV == reloj.

## 5. Orden de implementación

1. **Fase 0 — probe fail-fast**: scaffold mínimo + flags + `loopbackHandler` + captura provisional de 10 s con RMS por fuente. **Go/no-go real.** Si falla → fallback nativo antes de invertir en UI.
2. Scaffolding completo. 3. Main + preload. 4. Types → worklet → services. 5. Hooks. 6. Componentes + página. 7. Edge cases. 8. Sesión 15 min.

Validación por fase: `npm run typecheck` && `npm run lint` && `npm run dev`. Sin tests (los genera `/somo-qa-dev`).

## 6. Riesgos

| #   | Riesgo                                             | Mitigación                                                        |
| --- | -------------------------------------------------- | ----------------------------------------------------------------- |
| 1   | Loopback por flags sin audio en macOS 26/Darwin 25 | Fase 0 obligatoria: CATap → SCK → fallback nativo                 |
| 2   | Detener video track silencia audio (#49607)        | Fase 0: probar track vivo / detenido / 4×4                        |
| 3   | AudioContext 16 kHz rechaza loopback               | Verificar con afinfo; plan B: 48 kHz + downsample en worklet      |
| 4   | Proxy de permiso 'screen' vs TCC CATap diverge     | Verificar en fase 0; detección por intento + documentar           |
| 5   | Prompt TCC en dev se atribuye a "Electron"         | Aceptable en spike; producto final necesitará empaquetado firmado |
| 6   | Deep-link `?Privacy_AudioCapture` inexistente      | Fallback `?Privacy_ScreenCapture` o pane general                  |
| 7   | Drift del scaffolder                               | Pin de versiones exactas tras scaffold                            |

Fuentes: electron-audio-loopback (GitHub), alec.is loopback post, docs Electron desktopCapturer/session, electron#47490, electron#49607.
