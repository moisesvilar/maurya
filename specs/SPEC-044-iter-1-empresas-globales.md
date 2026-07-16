# SPEC-044-iter-1 — Empresas globales: navegar al detalle tras crear entrevista

> Iteración de defecto de código sobre `specs/SPEC-044-empresas-globales.md`. Motivo: hallazgo de
> QA Dev (2026-07-16) — el AC-21 de la spec base («GIVEN el Dialog válido con discovery elegido
> WHEN se pulsa "Crear" THEN la entrevista se crea ... y se navega a su detalle») no se cumple: la
> implementación `dc04927` conserva el comportamiento de SPEC-013 (Toast + fila en el listado, sin
> navegación). Test rojo que lo evidencia: describe «discovery select (SPEC-044)» de
> `tests/unit/interviews/CompanyDetailPage.interviews.test.tsx` (aserción de navegación).

## Alcance de implementación

- Esta iteración entrega **únicamente una corrección puntual de código de producción**: la
navegación al detalle de la entrevista recién creada desde el detalle global de empresa.
- **Los tests automatizados están fuera del alcance del implementador.** No se deben escribir tests
unitarios (Vitest / Testing Library) ni tests end-to-end (Playwright) como parte de esta entrega.
Los tests los genera la skill `/somo-qa-dev` y los ejecuta `/somo-qa-tester` contra el código ya
commiteado, en un paso posterior del pipeline de QA de SOMO. Cualquier test que el implementador
entregue será descartado o reemplazado.
- Sin cambios de schema, IPC ni preload: el ajuste vive en el hook `useInterviews` (valor de
retorno de `createInterview`) y en `CompanyDetailPage` (callback de creación).
- **Fuera de alcance:** cualquier otro comportamiento de SPEC-044 (listado, redirects, Select de
Discovery, textos de AlertDialog) y el flujo de EDICIÓN de entrevista (no navega, como hasta ahora).

## Defecto a corregir

- **Comportamiento actual:** en `/companies/:companyId`, al crear una entrevista desde el Dialog
  con discovery válido, la entrevista se crea y aparece en el listado con Toast, pero la vista
  permanece en el detalle de la empresa.
- **Comportamiento esperado (AC-21 de la base):** tras la creación exitosa se navega al detalle de
  la entrevista recién creada por la ruta anidada existente,
  `/discoveries/{discoveryId}/companies/{companyId}/interviews/{interviewId}`, construida con el
  `discoveryId` elegido en el Dialog y el id devuelto por la creación. El Toast de creación se
  conserva. Si la creación falla (envelope `ok: false`), no se navega (comportamiento de error
  intacto).
- **Referencia de patrón:** `NewCaptureDialog` (SPEC-020) navega a `/captures/:id` tras crear.

## Criterios de aceptación

- GIVEN el Dialog de nueva entrevista válido en `/companies/:companyId` WHEN se pulsa «Crear» y el bridge responde ok THEN se navega al detalle de la entrevista creada (ruta anidada con el discovery elegido) y se muestra el Toast de creación.
- GIVEN el mismo Dialog WHEN el bridge responde `ok: false` THEN se muestra el toast de error del hook y NO se navega.
- GIVEN el Dialog de EDICIÓN de entrevista WHEN se guarda THEN el comportamiento actual se conserva (sin navegación).

## Notas técnicas

- `useInterviews.createInterview` hoy devuelve un booleano de éxito; para poder navegar el caller
  necesita el id creado → que devuelva la entrevista creada (o null en fallo), manteniendo los
  toasts dentro del hook. `updateInterview`/`removeInterview` no cambian.
- `CompanyDetailPage` envuelve el `onSubmit` de creación: si el hook devuelve entrevista, navega
  con `useNavigate()` ya disponible en la página.
