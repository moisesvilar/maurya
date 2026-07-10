# SPEC-021-iter-1 — Corrección del artefacto de coma flotante en el redondeo del límite

## Descripción

Iteración de corrección de defecto sobre la implementación de SPEC-021.

La desencadena el report de QA `tests/reports/SPEC-021-run-20260710T122451Z.md` (373/374 PASS): el
test de `roundUpUsd` falla porque la función altera valores que ya son exactos a 2 decimales. El
veredicto del orquestador es code-defect: redondear "hacia arriba a 2 decimales" un importe que ya
tiene exactamente 2 decimales no debe cambiarlo, y la implementación actual lo cambia por un
artefacto de coma flotante.

Cambia únicamente el interior de `roundUpUsd` en `src/main/aiCost.ts`. No cambia nada más: ni la
semántica conservadora del redondeo (los valores con más de 2 decimales siguen redondeando hacia
arriba, para pausar antes de exceder el límite), ni las tarifas, ni el resto del módulo, ni ningún
otro fichero.

## Alcance de implementación

- Esta iteración define **únicamente** una corrección puntual de lógica en `src/main/aiCost.ts`.
- **Los tests automatizados están fuera del alcance del implementador.** No se deben escribir tests
  unitarios (Vitest / Testing Library) ni tests end-to-end (Playwright) como parte de esta entrega.
  Los tests los genera la skill `/somo-qa-dev` y los ejecuta `/somo-qa-tester` contra el código ya
  commiteado, en un paso posterior del pipeline de QA de SOMO. Cualquier test que el implementador
  entregue será descartado o reemplazado.
- No hay cambios de schema ni de canales IPC ni de `package.json`: solo el cuerpo de una función.
- **Fuera de alcance:** cualquier otro punto de `aiCost.ts` (tarifas, `computeCostUsd`,
  `extractUsage`, `recordInterviewUsage`), el gate del asistente que consume `roundUpUsd`, y el
  drift cosmético de acumulación señalado por QA como observación (no es objeto de esta iter).

## Defecto a corregir

### Síntoma

Test `tests/unit/ai-cost/aiCost.test.ts > aiCost > rounds up to 2 decimals for the limit
comparison` (map: SPEC-021, AC de comparación con el límite): `expect(roundUpUsd(1.1)).toBe(1.1)`
recibe `1.11`.

### Causa raíz

`src/main/aiCost.ts`, función `roundUpUsd`: `Math.ceil(value * 100) / 100`. En IEEE-754,
`1.1 * 100 === 110.00000000000001`, y `Math.ceil` lo sube a `111` → `1.11`. Cualquier valor exacto
a 2 decimales cuya multiplicación por 100 produzca un residuo flotante superior se infla un céntimo.

### Cambio requerido

Neutralizar el residuo flotante antes del `Math.ceil`, manteniendo el redondeo hacia arriba para
los valores con más de 2 decimales reales. Ajuste quirúrgico de una línea, por ejemplo:

```ts
// antes
return Math.ceil(value * 100) / 100
// después — elimina el residuo IEEE-754 (~1e-13 aquí) sin absorber terceras decimales reales (≥1e-3)
return Math.ceil(Number((value * 100).toFixed(6))) / 100
```

Comportamiento esperado: `roundUpUsd(1.1) === 1.1` · `roundUpUsd(1.111) === 1.12` ·
`roundUpUsd(0.001) === 0.01` · `roundUpUsd(0) === 0`.

## Notas técnicas

- Fichero afectado: `src/main/aiCost.ts`, solo el cuerpo de `roundUpUsd`. Sin impacto en
  datos/schema/IPC (explícito: no).
- Retrocompatibilidad: los consumidores (`maybeAnalyze` del asistente) no cambian; el único efecto
  observable es que un acumulado exactamente igual a un múltiplo de céntimo ya no se infla un
  céntimo artificial en la comparación con el límite.
- Dependencias: SPEC-021 (base).
- Verificación manual sugerida: fijar límite 0.01 en Ajustes, grabar con asistente hasta la pausa,
  comprobar que el importe del Alert coincide con el límite configurado sin céntimos fantasma.
