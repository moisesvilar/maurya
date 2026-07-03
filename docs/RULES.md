# RULES.md — reglas del loop de desarrollo de Maurya

> Antes de empezar cualquier vuelta, lee `docs/MEMORY.md`.
> Antes de terminar una spec, actualiza `docs/MEMORY.md`.
> El orquestador del loop está definido en `CLAUDE.md`. Estas reglas lo acotan.

## Lo que el agente NUNCA puede hacer

1. **No debilitar, borrar ni marcar `.skip`/`.only` un test para que pase.** La condición de parada es "tests en verde"; hacer trampa a los tests invalida todo el loop. Si un test falla, primero hay que demostrar (verificador independiente) que el test está mal, no la implementación.
2. **No tocar la rama `main` ni `develop` directamente.** La implementación de cada spec va en `pipeline/SPEC-NNN` (lo hace `/somo-dev`).
3. **No modificar `docs/prd.md` ni `docs/checklist.md` salvo** para marcar una tarea como hecha `[x]` al cerrar su spec (paso 8 del flujo).
4. **No inventar requisitos** que no estén en `docs/prd.md`. Cada spec traza a uno o varios `RF-...`.
5. **No cerrar una spec sin PASS real** de `/somo-qa-tester` en unit (Vitest) y e2e (Playwright).
6. **No dar por verificado lo que solo está "commiteado".** Verificado = tests ejecutados en verde por `/somo-qa-tester`, no "el código compila".
7. **No avanzar a la siguiente spec** hasta que la actual esté cerrada o escalada a humano.

## Freno de emergencia (obligatorio)

- **Máximo 3 iteraciones de spec** (`iter-1`, `iter-2`, `iter-3`) por cada SPEC-NNN. Si a la 3ª el e2e sigue rojo → **PARAR y escalar a humano**, no seguir iterando.
- Registrar cada iteración fallida en `MEMORY.md` con la causa.

## Puntos de corte con humano (no autónomo)

El agente DEBE parar y pedir revisión humana en:
- **Aprobación de la spec** antes de `/somo-dev` (la calidad de una spec es juicio, no pass/fail).
- **Diagnóstico del paso 7** cuando los tests fallan: la decisión "¿es el test o es la implementación?" la propone el agente pero la confirma un verificador independiente (ver Principio 1) o el humano si hay duda.
- **Spec bloqueada** tras 3 iteraciones fallidas.
- **Lovable caído / public link no responde**: no reintentar en bucle, escalar.

## Dependencias externas a vigilar

- **Lovable** (public link + dev database): es un sistema externo. El e2e corre contra su URL temporal. Si el link está caído o la dev database en estado inconsistente, el rojo NO significa bug de la spec.
- **GitHub sync**: `/somo-qa-tester` asume el código sincronizado. Verificar sync git antes de ejecutar.
