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

## CLI (`maurya-cli`)

Ejecutable de línea de comandos para crear y gestionar los datos de Maurya
(discoveries, empresas, contactos, grupos de entrevistas, entrevistas y
plantillas) **sin abrir la app**, pensado para integrarse con agentes (Claude
Code, scripts). Usa la misma capa de persistencia que la app —mismas
validaciones, integridad referencial y escritura atómica— sobre el mismo
`db.json` de userData.

```bash
npm run cli:build        # genera out/cli/index.cjs (una vez, o tras cambiar src/cli o src/main/db)
./bin/maurya-cli --help  # ayuda general; también: npm run cli -- --help

# Ejemplos
./bin/maurya-cli discovery create --name "Discovery SaaS" --objectives "Validar dolor de facturación"
./bin/maurya-cli company create --name "Acme Corp" --website "https://acme.example"
./bin/maurya-cli contact create --company-id <companyId> --name "Jane Roe" --position "CFO"
./bin/maurya-cli search jane
```

- Salida: siempre un único JSON `{ ok: true, data } | { ok: false, error: { kind, message } }`
  en stdout, con exit code 0/1 — parseable directamente por un agente.
- Entidades: `discovery`, `company`, `contact`, `interview-group`, `interview`,
  `interview-template`, `note-template`, cada una con
  `create / list / get / update / delete`; además `search <consulta>` y `status`.
- Campos por flags (`--name`, `--company-id`, …) o payload completo con
  `--json '{...}'` (necesario para `null` y estructuras anidadas).
- Directorio de datos: `--data-dir` > `$MAURYA_DATA_DIR` > userData de la app.
- **Aviso**: con la app abierta, su siguiente escritura puede pisar los cambios
  del CLI — úsalo con la app cerrada o recárgala después.

Referencia completa (tabla de flags por entidad y más ejemplos): [`docs/cli.md`](docs/cli.md).

## Licencia

Maurya es open source bajo licencia [MIT](LICENSE).
