# Maurya

Aplicación Electron + React + TypeScript. Copiloto de entrevistas: captura y
transcripción simultánea de micrófono + audio del sistema en macOS.

## Requisitos

- macOS 14.2+ (backend CATap para el loopback de audio de sistema)
- Node.js 20+

## Project Setup

### Install

```bash
$ npm install
```

### Development

```bash
$ npm run dev
```

Nota: si el entorno exporta `ELECTRON_RUN_AS_NODE`, hay que limpiarla antes de
arrancar (`env -u ELECTRON_RUN_AS_NODE npm run dev`); de lo contrario Electron
se ejecuta como Node y la app no abre.

### Validación

```bash
$ npm run typecheck
$ npm run lint
```

### Build

```bash
# For macOS
$ npm run build:mac
```

## App empaquetada (macOS)

`npm run build:mac` genera en `dist/` la app `Maurya.app` (dentro de
`dist/mac-arm64/`) y los artefactos DMG y ZIP para arm64. La firma es
**ad-hoc** (sin Developer ID ni notarización; la distribución pública llega
en H7). El icono placeholder se regenera con `scripts/generate-icon.sh`.

### Abrir una app sin notarizar

Al abrir `Maurya.app` por primera vez, Gatekeeper puede bloquearla por no
estar notarizada. Para abrirla: **clic derecho (o Ctrl+clic) sobre
`Maurya.app` → Abrir → Abrir** en el diálogo de confirmación. Solo hace
falta la primera vez.

### Permisos TCC: se piden de nuevo como "Maurya"

Los permisos de micrófono y de grabación de pantalla/audio del sistema
concedidos en desarrollo se atribuyeron a "Electron" y **no se transfieren**
a la app empaquetada. La primera captura desde `Maurya.app` volverá a
mostrar los prompts de macOS, esta vez atribuidos a **"Maurya"**, que
aparecerá como entrada propia en Ajustes del Sistema → Privacidad y
seguridad (Micrófono y Grabación de pantalla y audio del sistema). Es el
comportamiento esperado.

### API key de Deepgram en la app empaquetada

La app empaquetada no lee el `.env.local` del repo: busca primero en su
directorio de datos de usuario. Copia ahí la key:

```bash
$ mkdir -p "$HOME/Library/Application Support/Maurya"
$ cp .env.local "$HOME/Library/Application Support/Maurya/.env.local"
```

Las grabaciones (WAV + transcript.json) de la app empaquetada se persisten
también bajo `~/Library/Application Support/Maurya/recordings/`.

> Nota: al fijar `productName: Maurya`, el directorio userData pasa a ser
> `~/Library/Application Support/Maurya` **también en dev**. Las grabaciones
> de sesiones de desarrollo previas quedan en la ruta antigua
> `~/Library/Application Support/maurya` y no se migran.
