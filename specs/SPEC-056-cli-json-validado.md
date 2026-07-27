# SPEC-056 — El `--json` de maurya-cli deja de mentir

## Descripción

En `maurya-cli`, un `update` puede devolver `{"ok":true}` sin haber aplicado el cambio pedido. El caso que lo destapó: `interview update <id> --json '{"interviewGroupId":"<otro grupo>"}'` responde `ok:true` con la entrevista sin modificar. La causa son **dos fallos superpuestos**, verificados por reproducción en un sandbox (`--data-dir` sobre una copia del `db.json` real):

- **Fallo A — bundle desincronizado.** `bin/maurya-cli` carga `out/cli/index.cjs`, un artefacto generado por `npm run cli:build` y no versionado. El bundle instalado era del 20-jul; el commit `c90523d` (24-jul) añadió el soporte de `interviewGroupId` en `updateInterview` (`src/main/db/repository.ts`) y en `UpdateInterviewPatch`. El bundle viejo **sí** contenía la cadena `interviewGroupId` (en `createInterview` y en la cascada de `deleteInterviewGroup`), pero su `updateInterview` saltaba de `templateId` a `scriptMarkdown` sin pasar por el grupo. Reconstruir el bundle resuelve 2 de los 3 síntomas: el grupo válido pasa a aplicarse y el grupo inexistente pasa a devolver `reference`.
- **Fallo B — `--json` no se valida.** En `parsePayload` (`src/cli/cli.ts`) el objeto de `--json` se fusiona tal cual (`base = { ...base, ...parsed }`) sin contrastarlo contra el `FieldSpec` de la entidad. Los flags sueltos sí se validan y lanzan `UsageError` con la lista de flags soportados; el `--json` no. Aguas abajo, el repositorio aplica solo las claves que conoce y el resto se evapora en silencio. Este fallo **sobrevive al rebuild** y afecta a **todas** las entidades y a `create`, `update` y `list`: cualquier clave mal escrita (`titel`, `contactIDs`) o no soportada para esa entidad y acción (`discoveryId`, `companyId`) se pierde sin aviso.

Además, el `ok:true` mentiroso **no es un no-op**: `updateInterview` llama a `touched()` incondicionalmente, así que un patch íntegramente descartado deja el `updatedAt` bumpeado en `db.json`. Hoy el CLI ya escribe a medias.

Esta spec cierra el Fallo B haciendo que una clave desconocida o no soportada falle con `error.kind: "usage"` y la lista de claves admitidas —el mismo trato que ya reciben los flags sueltos—, expone `--interview-group-id` en los `updateFields` de `interview` (el repositorio ya lo soporta y lo valida; solo faltaba declararlo), y añade un test que falla si el bundle instalado está desincronizado del código.

## Trazabilidad

**Esta spec no traza a ningún `RF-...` del PRD.** `maurya-cli` es **tooling interno** para agentes (Claude Code, scripts): no aparece en `docs/prd.md`, no tiene ítem en `docs/checklist.md` y no existe spec previa que lo introdujera. Se documenta aquí explícitamente en lugar de inventar un RF (`docs/RULES.md`, regla 4) o de modificar el PRD (regla 3). Nada que marcar `[x]` en el checklist al cerrar.

## Alcance de implementación

- Código de producción del CLI (`src/cli/cli.ts`) **y** sus tests, que en esta entrega **sí** están dentro del alcance por petición explícita del humano (a diferencia del reparto habitual `/somo-dev` → `/somo-qa-dev`).
- **Fuera de alcance:**
  - El contrato de salida no se toca: `{ok, data}` / `{ok, error{kind, message}}`, exit code 0/1, stdout siempre un único JSON, ayuda como única salida no-JSON.
  - El comportamiento de la app Electron no cambia. Esta spec no toca `src/main/db/`, `src/renderer/` ni ningún canal IPC.
  - **`discoveryId` sigue siendo inmutable.** No se hace mutable. La invariante «el grupo pertenece al mismo discovery de la entrevista» (`assertInterviewGroup`) es la que lo sostiene, y moverla tiene implicaciones en la app. Lo que esta spec exige es que el intento de cambiarlo **falle con un error explícito** en vez de ignorarse.
  - **Validación de valores** (que `status` acepte solo los `InterviewStatus` válidos, que `objectives` sea un array): ver «Hallazgos derivados». Queda fuera por decisión humana y se propone como spec aparte.
  - **Exponer `assignInterviewCompany` en el CLI**: ver «Hallazgos derivados». Fuera de alcance.

## Criterios de aceptación

### AC — Validación de claves en `--json`

- **AC-01** · GIVEN `discovery update <id> --json '{"objectives":"x"}'` (clave declarada en el `FieldSpec`) WHEN se ejecuta THEN se aplica normalmente y devuelve `ok:true` con el valor nuevo: la validación no rompe ningún uso legítimo.
- **AC-02** · GIVEN `interview update <id> --json '{"titel":"x"}'` (clave mal escrita) WHEN se ejecuta THEN devuelve `{ok:false, error:{kind:"usage"}}` con exit code 1, el mensaje nombra la clave desconocida y lista las claves admitidas para esa entidad y acción.
- **AC-03** · GIVEN un `--json` con varias claves desconocidas WHEN se ejecuta THEN el mensaje las nombra **todas** (no solo la primera), en orden alfabético.
- **AC-04** · GIVEN `interview update <id> --json '{"discoveryId":"otro"}'` WHEN se ejecuta THEN devuelve `usage` (no `ok:true`): `discoveryId` no está entre las claves de `updateFields`, y el intento de cambiarlo falla ruidosamente en vez de ignorarse.
- **AC-05** · GIVEN `discovery create --json '{"name":"X","foo":"bar"}'` WHEN se ejecuta THEN devuelve `usage` y **no crea el discovery**: la validación aplica a `create` igual que a `update`, y un payload inválido produce cero escrituras.
- **AC-06** · GIVEN `interview list --json '{"foo":1}'` WHEN se ejecuta THEN devuelve `usage`: la validación aplica también a los `listFields`.
- **AC-07** · GIVEN un `--json` con clave desconocida en cualquier entidad y acción WHEN se ejecuta THEN el `db.json` queda **byte a byte idéntico** al de antes del comando: ni entidades nuevas, ni patches parciales, ni bumps de `updatedAt`.
- **AC-08** · GIVEN varios `--json` en el mismo comando WHEN alguno aporta una clave desconocida THEN el error `usage` se produce igual (las claves se validan sobre el objeto acumulado).
- **AC-09** · GIVEN una clave escrita con el nombre del flag en vez de la clave del payload (`{"linkedin-url":"x"}` en vez de `{"linkedinUrl":"x"}`) WHEN se ejecuta THEN devuelve `usage` con la lista de claves admitidas, que incluye `linkedinUrl`.
- **AC-10** · GIVEN el mensaje de error de una clave desconocida WHEN se compara con el de un flag suelto desconocido THEN ambos son `kind:"usage"` y ambos enumeran lo admitido: mismo trato para las dos vías de entrada.

### AC — `--interview-group-id` en el update de `interview`

- **AC-11** · GIVEN una entrevista y otro grupo **del mismo discovery** WHEN se ejecuta `interview update <id> --interview-group-id <grupo>` THEN el cambio se aplica y el `interviewGroupId` persistido en `db.json` es el del grupo destino.
- **AC-12** · GIVEN la misma operación por `--json '{"interviewGroupId":"<grupo del mismo discovery>"}'` WHEN se ejecuta THEN se aplica igual: el `--json` y el flag suelto son equivalentes.
- **AC-13** · GIVEN un `interviewGroupId` **inexistente** WHEN se ejecuta el update THEN devuelve `{ok:false, error:{kind:"reference"}}` con exit code 1 y la entrevista conserva su grupo original.
- **AC-14** · GIVEN un grupo que existe pero pertenece a **otro discovery** WHEN se ejecuta el update THEN devuelve `error.kind:"reference"` y la entrevista conserva su grupo original: la invariante `assertInterviewGroup` se mantiene desde el CLI.
- **AC-15** · GIVEN `--json '{"interviewGroupId":null}'` WHEN se ejecuta THEN la entrevista queda sin grupo (`null`), sin error: desasignar es legítimo y el repositorio ya lo contempla.
- **AC-16** · GIVEN `maurya-cli interview --help` WHEN se emite la ayuda THEN la línea de `interview update` incluye `[--interview-group-id <valor>]`.

### AC — Sincronía del bundle

- **AC-17** · GIVEN que `out/cli/index.cjs` existe y **no** coincide con lo que produce el código fuente actual WHEN corre la suite THEN el test de sincronía **falla**, y su mensaje indica ejecutar `npm run cli:build`.
- **AC-18** · GIVEN que `out/cli/index.cjs` existe y coincide byte a byte con el rebuild WHEN corre la suite THEN el test pasa.
- **AC-19** · GIVEN un árbol sin `out/` (clon limpio, CI) WHEN corre la suite THEN el test pasa sin construir nada: el bundle es un artefacto opcional, no un requisito para testear.

## Notas técnicas

- **Dónde valida.** `parsePayload` recibe ya el `FieldSpec[]` de la entidad y la acción (`createFields` / `updateFields` / `listFields`), así que la validación es local: tras el bucle de tokens, contrastar las claves acumuladas del `--json` contra `fields.map(f => f.key)`. Los flags sueltos no necesitan revalidación: se construyen a partir del propio `FieldSpec`, así que son correctos por construcción.
- **Por qué basta con validar claves.** Se auditaron los 7 `FieldSpec` del CLI contra los `Create*Input` / `Update*Patch` de `src/renderer/src/types/domain.ts`: coinciden clave a clave en todas las entidades **salvo** `interviewGroupId` en `interview.updateFields`, que es justo el hueco que esta spec cierra. Endurecer el `--json` no rompe, por tanto, ningún uso legítimo actual.
- **`initStore` antes de `parsePayload`.** El orden actual (`initStore(dataDir)` en la línea previa al `switch`) hace que un error de uso ocurra con el almacén ya inicializado. Eso crea el `db.json` si no existía, pero **no** muta entidades: AC-07 se comprueba sobre el contenido, comparando el archivo antes y después del comando fallido. No se reordena `initStore` (cambiarlo alteraría el comportamiento de `status` y de los errores de uso ya existentes, cubiertos por la suite actual).
- **Test de sincronía del bundle.** Se apoya en dos hechos verificados: (1) esbuild es determinista —dos pasadas producen el mismo byte— y (2) repetir `--outfile` en la línea de comandos permite redirigir la salida sin duplicar el resto de flags. El test lee el comando `cli:build` **de `package.json`** (única fuente de verdad: si alguien cambia las flags del build, el test las hereda), lo ejecuta contra un `outfile` temporal y compara byte a byte con `out/cli/index.cjs`. Sin `out/`, el test pasa sin ejecutar nada.
- **Sin cambios de infraestructura**: ni schema, ni migración, ni dependencias nuevas (esbuild ya es devDependency y lo usa `cli:build`).

## Decisiones asumidas

- **Fallar ruidosamente antes que escribir a medias** → asumido `UsageError` ante cualquier clave desconocida (alternativa: avisar por stderr y aplicar el resto). Regla: el consumidor del CLI es un agente que lee el JSON de stdout y da el `ok:true` por bueno; un aviso en stderr sería invisible en la práctica. Petición humana literal: «nunca un `ok:true` parcial».
- **Validación estricta también en `create` y `list`, no solo en `update`** → asumido aplicar en las tres (alternativa: limitarlo al `update` del bug reportado). Regla: el fallo es de `parsePayload`, que es común a las tres acciones; arreglar solo una vía dejaría el mismo `ok:true` mentiroso en `create`, ya reproducido (`discovery create --json '{"name":"X","foo":"bar"}'`).
- **Se validan claves, no valores** → asumido comparar contra `FieldSpec.key` (alternativa: validar además tipos y enums). Regla: decisión humana explícita de mantener esta spec dentro del CLI; validar valores bien hecho es trabajo del repositorio, que es compartido con la app. Ver «Hallazgos derivados».
- **`--interview-group-id` como flag declarado en vez de solo vía `--json`** → asumido declararlo en `updateFields` (alternativa: dejarlo accesible solo por `--json`). Regla: el repositorio ya lo soporta y lo valida desde `c90523d`; declararlo lo hace visible en `--help` y evita que el `--json` sea la única vía para una operación de primera clase.
- **Test de sincronía por comparación byte a byte, no por mtime** → asumido rebuild-y-comparar (alternativa: comparar `mtime` del bundle contra los fuentes). Regla: los mtimes cambian con `git checkout` sin que el contenido cambie, lo que daría falsos rojos; la comparación de contenido responde exactamente a la pregunta «¿el artefacto instalado es el que produce este código?».
- **Sin guard en tiempo de ejecución en `bin/maurya-cli`** → asumido cubrirlo solo con el test (alternativa: que el wrapper avise por stderr si el bundle es más viejo que `src/`). Decisión humana explícita.

## Hallazgos derivados (fuera de alcance, para specs aparte)

- **El repositorio no valida valores.** `interview update <id> --status "esto-no-existe"` persiste el string tal cual, y `--json '{"objectives":"soy un string"}'` persiste un string donde el dominio declara `string[]`. Va por flags **declarados**, así que la validación de claves de esta spec no lo tapa, y corrompe el `db.json` que luego lee la app. Arreglarlo bien es en `src/main/db/repository.ts`, lo que cambia el comportamiento de la app y queda fuera de esta spec por decisión humana.
- **El CLI no puede asignar empresa a una entrevista.** El repositorio lo resuelve con `assignInterviewCompany` (`repository.ts`), que el CLI no importa ni expone. Con esta spec, `interview update <id> --json '{"companyId":"..."}'` pasa de descartarse en silencio a fallar con `usage` — correcto, pero deja visible que la operación no tiene vía en el CLI.
- **Mover una entrevista entre discoveries** no está soportado (la única vía es editar el `db.json` a mano con la app cerrada). No se propone como spec: con este arreglo el intento falla ruidosamente, que era el objetivo, y no hay evidencia de que la operación haga falta.
