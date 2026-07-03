# maurya

Aplicación Electron + React + TypeScript. Contiene el spike SPEC-001 de captura
simultánea de micrófono + audio del sistema en macOS.

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
