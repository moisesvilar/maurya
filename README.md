# Maurya

Maurya es tu copiloto para entrevistas de descubrimiento. Te ayuda a aplicar The Mom Test en tiempo real: escucha la conversación, detecta cuándo se desvía hacia generalidades, opiniones o cumplidos de cortesía, y te sugiere cómo reconducirla hacia hechos concretos. Así sales de cada entrevista con problemas reales y relevantes.

## Servicios externos

Maurya se apoya en dos APIs, cuyas claves se configuran en Ajustes:

- **Deepgram** — transcripción de voz a texto en streaming (mic + audio del sistema).
- **Claude (Anthropic)** — el LLM que prepara el guión, asiste en tiempo real y resume la entrevista.

## Generar el instalador (macOS)

```bash
npm run build:mac
```

Ejecuta typecheck + build de electron-vite + electron-builder y deja los artefactos en `dist/`:

- `Maurya-<versión>.dmg` — el instalador (arrastrar a Aplicaciones).
- `Maurya-<versión>-arm64-mac.zip` — alternativa comprimida.
- `dist/mac-arm64/Maurya.app` — el bundle, sellado con **firma ad-hoc** y los
  entitlements de `build/entitlements.mac.plist` mediante el hook
  `build/afterPack.js` (el propio build falla si el sellado no verifica).

Sin Developer ID ni notarización en esta fase; el camino a firma real está
documentado en comentarios dentro de `electron-builder.yml`.

### Instalar y abrir la app

1. Abre el `.dmg` y arrastra **Maurya** a Aplicaciones.
2. Al no estar notarizada, la primera vez: clic derecho sobre `Maurya.app` → **Abrir** → Abrir.
3. Configura las claves de Deepgram y Anthropic en **Ajustes** (se guardan cifradas en el keychain del sistema).
4. macOS pedirá los permisos de **Micrófono** y de **Grabación de pantalla y audio del sistema** la primera vez que inicies una grabación.

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
  (Electron arranca como Node y la ventana no abre). Usa
  `env -u ELECTRON_RUN_AS_NODE npm run dev`.
- Requisitos: macOS 14.2+ (backend CATap del loopback), Node 20+.

## Licencia

Maurya es open source bajo licencia [MIT](LICENSE).
