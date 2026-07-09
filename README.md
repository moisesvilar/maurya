# Maurya

 Maurya es tu copiloto para entrevistas de descubrimiento. Te ayuda a aplicar The Mom Test en tiempo real: escucha la conversación, detecta cuándo se desvía hacia generalidades, opiniones o cumplidos de cortesía, y te sugiere cómo reconducirla hacia hechos concretos. Así sales de cada entrevista con problemas reales y relevantes.

## Servicios externos

Maurya se apoya en dos APIs, cuyas claves se configuran en Ajustes:

- **Deepgram** — transcripción de voz a texto en streaming (mic + audio del sistema).
- **Claude (Anthropic)** — el LLM que prepara el guión, asiste en tiempo real y resume la entrevista.

## Comandos

```bash
./start.sh   # lanza la aplicación
```

## Comandos de desarrollo

```bash
npm run dev          # arranca la app en desarrollo (electron-vite)
npm run typecheck    # tsc de main+preload (node) y renderer (web) — sin emitir
npm run lint         # eslint con caché
npm run format       # prettier --write

npm test             # Vitest unit (una pasada)
npm run test:watch   # Vitest en watch
npx vitest run tests/unit/persistence/repository.test.ts   # un solo archivo
npx vitest run -t "cascading"                              # por nombre de test

npm run build:mac    # typecheck + electron-vite build + electron-builder --mac
```

- `npm run dev` **falla en silencio si `ELECTRON_RUN_AS_NODE` está exportada**
(Electron arranca como Node y la ventana no abre). Usa `./start.sh` o
`env -u ELECTRON_RUN_AS_NODE npm run dev`.
- `npm run build:mac` produce `dist/mac-arm64/Maurya.app` + DMG/ZIP arm64 con
firma **ad-hoc** (sin Developer ID ni notarización).
- Requisitos: macOS 14.2+ (backend CATap del loopback), Node 20+.

## Licencia

Maurya es open source bajo licencia [MIT](LICENSE).

