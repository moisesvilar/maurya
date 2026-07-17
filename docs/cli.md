# maurya-cli — CLI de gestión de datos de Maurya

Ejecutable de línea de comandos para crear y gestionar las entidades de Maurya
(discoveries, empresas, contactos, grupos de entrevistas, entrevistas y
plantillas) **sin abrir la app**, pensado para integrarse con agentes (Claude
Code, scripts, automatizaciones).

Reutiliza la misma capa de persistencia que la app (`src/main/db`): mismas
validaciones, integridad referencial, cascadas de borrado y escritura atómica
sobre el mismo `db.json` de userData.

## Build y ejecución

```bash
npm run cli:build        # genera out/cli/index.cjs (esbuild, Node puro, sin Electron)
./bin/maurya-cli --help  # o: npm run cli -- --help
```

El bundle solo hay que regenerarlo cuando cambie el código de `src/cli/` o de
`src/main/db/`.

## Contrato de salida (para agentes)

- **stdout**: SIEMPRE un único JSON con el envelope del dominio:
  `{ "ok": true, "data": ... }` o `{ "ok": false, "error": { "kind", "message" } }`.
- **exit code**: `0` si ok, `1` si error.
- `error.kind`: `validation` | `not-found` | `reference` | `storage` (errores
  del repositorio) o `usage` (flags/argumentos incorrectos del CLI).
- La única salida no-JSON es el texto de ayuda (`--help`).

## Directorio de datos

Resolución (primera que aplique):

1. `--data-dir <dir>` (flag global, en cualquier posición)
2. `$MAURYA_DATA_DIR`
3. userData de la app: `~/Library/Application Support/Maurya/maurya-data` (macOS)

> **Concurrencia**: la app Electron mantiene su snapshot en memoria y persiste
> el almacén completo en cada mutación. Si la app está abierta, su siguiente
> escritura puede pisar los cambios del CLI. Usa el CLI con la app cerrada (o
> recárgala después de escribir).

## Comandos

Toda entidad soporta `create`, `list`, `get <id>`, `update <id>`, `delete <id>`.
En `create`/`update` los campos se pasan como flags `--kebab-case`; además,
`--json '{...}'` acepta el payload completo (imprescindible para asignar `null`
o estructuras anidadas); los flags individuales sobreescriben las claves del
`--json`. Los flags marcados `(JSON)` parsean su valor como JSON.

| Entidad | create (obligatorios en negrita) | list |
| --- | --- | --- |
| `discovery` | **`--name`**, `--objectives` | — |
| `company` | **`--name`**, `--website`, `--linkedin-url`, `--context` | — |
| `contact` | **`--company-id`**, **`--name`**, `--position`, `--linkedin-url`, `--context` | `--company-id` obligatorio |
| `interview-template` | **`--name`**, `--phase` (`exploratory`\|`problem`\|`solution`), `--blocks` (JSON) | — |
| `interview-group` | **`--discovery-id`**, **`--name`**, `--objective`, `--interview-template-id`, `--note-template-id` | `--discovery-id` obligatorio |
| `interview` | **`--discovery-id`**, **`--title`**, `--company-id`, `--contact-ids` (JSON), `--interview-group-id`, `--template-id` | `--company-id` opcional (sin él: vista global de capturas) |
| `note-template` | **`--name`**, `--context`, `--sections` (JSON) | — |

`interview update` admite además: `--status` (`draft`\|`prepared`\|`recorded`\|`summarized`),
`--contact-ids` (JSON), `--script-markdown`, `--objectives` (JSON array de strings),
`--wav-path`, `--transcript-path`.

Comandos adicionales:

```bash
maurya-cli search <consulta...>   # búsqueda global (todas las entidades)
maurya-cli status                 # estado del almacén + ruta del db.json
maurya-cli <entidad> --help       # ayuda por entidad
```

## Ejemplos

```bash
# Flujo completo: discovery → empresa → contacto → plantillas → grupo → entrevista
./bin/maurya-cli discovery create --name "Discovery SaaS" --objectives "Validar dolor de facturación"
./bin/maurya-cli company create --name "Acme Corp" --website "https://acme.example"
./bin/maurya-cli contact create --company-id <companyId> --name "Jane Roe" --position "CFO"
./bin/maurya-cli interview-template create --name "Guion exploratorio" --phase exploratory \
  --blocks '[{"title":"Contexto","questions":[{"text":"¿Cómo facturas hoy?","guidance":"Hechos, no opiniones"}]}]'
./bin/maurya-cli note-template create --name "Nota Mom Test" --context "Resumen de hechos" \
  --sections '[{"title":"Dolores","description":"Problemas concretos detectados"}]'
./bin/maurya-cli interview-group create --discovery-id <discoveryId> --name "CFOs" \
  --interview-template-id <tplId> --note-template-id <noteTplId>
./bin/maurya-cli interview create --discovery-id <discoveryId> --title "Entrevista Jane" \
  --company-id <companyId> --contact-ids '["<contactId>"]' --interview-group-id <groupId>

# Payload completo por JSON (permite null explícito)
./bin/maurya-cli company update <id> --json '{"website":null}'

# Datos de prueba aislados
./bin/maurya-cli --data-dir /tmp/maurya-sandbox discovery create --name "Sandbox"
```

## Estructura

- `src/cli/cli.ts` — parsing declarativo, dispatch y envelope (exporta `runCli`, testeable).
- `src/cli/index.ts` — entry del ejecutable.
- `src/cli/electron-stub.ts` — stub de `electron` para el bundle (el CLI siempre
  inyecta `baseDir` en `initStore`; el stub delata cualquier uso accidental).
- `bin/maurya-cli` — wrapper con shebang que carga `out/cli/index.cjs`.
- `tests/unit/cli/cli.test.ts` — suite Vitest (entorno node, electron mockeado).
