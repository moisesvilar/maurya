# SPEC-050 — Eliminar entrevistas desde el listado de un grupo

## Descripción

En la página de detalle de un grupo de entrevistas (Discoveries → un discovery → un grupo), cada entrevista del listado ofrece un menú de acciones «⋯» que hoy solo permite «Mover a otro grupo». Falta poder **eliminar** una entrevista desde ahí, algo que en el listado de Capturas ya es posible. Esta spec añade la opción «Eliminar» a ese menú, con confirmación previa, para que el usuario pueda dar de baja una entrevista sin salir de la vista del grupo. El borrado es permanente y arrastra las notas de la entrevista, exactamente igual que el borrado ya existente en Capturas.

## Alcance de implementación

- Esta spec define **únicamente el código de producción** que debe entregarse: UI (componentes, páginas, estados), datos (queries, mutations, schema si aplica) y lógica de negocio asociada.
- **Los tests automatizados están fuera del alcance del implementador.** No se deben escribir tests unitarios (Vitest / Testing Library) ni tests end-to-end (Playwright) como parte de esta entrega. Los tests los genera la skill `/somo-qa-dev` y los ejecuta `/somo-qa-tester` contra el código ya commiteado, en un paso posterior del pipeline de QA de SOMO. Cualquier test que el implementador entregue será descartado o reemplazado.
- Si la spec requiere algún ajuste de schema, migración Supabase o cambio de RLS, se indica explícitamente en "Notas técnicas". Si no se indica, no hay cambios de infraestructura.
- **Fuera de alcance**: el canal de borrado y su cascada (notas) ya existen y no se modifican; el flujo de «Mover a otro grupo» de la misma fila permanece intacto; el borrado de entrevistas desde otras vistas (Capturas, detalle de empresa) no se toca.

## Criterios de aceptación

### Menú de acciones de la fila

- GIVEN el menú ⋯ de una fila del listado de entrevistas del grupo WHEN se abre THEN muestra «Mover a otro grupo» y, tras un separador, «Eliminar» (destructive, con icono de papelera).
- GIVEN el menú ⋯ abierto WHEN se observa el orden THEN «Eliminar» es la última opción, después del separador que la aísla de «Mover a otro grupo».

### Eliminación (happy path)

- GIVEN el menú ⋯ de una entrevista WHEN se pulsa «Eliminar» THEN se abre un AlertDialog titulado «Eliminar entrevista» con la descripción «Se eliminarán permanentemente «{título}» y sus notas.» y los botones «Cancelar» y «Eliminar».
- GIVEN el AlertDialog de confirmación WHEN se pulsa «Eliminar» THEN la entrevista se borra, desaparece de la lista sin recargar la página y se muestra un Toast «Entrevista eliminada».
- GIVEN una entrevista con empresa y otra sin empresa (companyId null) en el mismo grupo WHEN se elimina cualquiera de las dos THEN el borrado funciona igual y solo esa fila desaparece del listado.

### Cancelación (edge case)

- GIVEN el AlertDialog de confirmación WHEN se pulsa «Cancelar» THEN el diálogo se cierra, no se llama al borrado y la entrevista permanece en la lista.
- GIVEN el AlertDialog de confirmación WHEN se pulsa Escape THEN equivale a Cancelar: no se borra nada y la entrevista permanece.

### Error state

- GIVEN que el borrado falla en el proceso principal WHEN se confirma «Eliminar» THEN se muestra un Toast destructivo con el mensaje del error y la entrevista permanece en la lista.

### Estado tras vaciar el grupo

- GIVEN un grupo con una sola entrevista WHEN se elimina esa entrevista THEN el listado pasa a mostrar el empty state «Aún no hay entrevistas en este grupo» con su CTA, sin recargar la página.

## UX Design

### Wireframe textual

**Pantalla: Detalle de grupo de entrevistas** (`/discoveries/:discoveryId/groups/:groupId`, **Layout 2 — Página de detalle**; ya existente, esta spec solo amplía el menú de fila y añade un AlertDialog).

- Sección «Entrevistas»: List (`ul` con `divide-y`, borde redondeado) donde cada fila (`li`) tiene:
  - Izquierda: link con el título de la entrevista (font-medium, hover underline) · Badge secondary con el estado · texto muted «{empresa o «Sin empresa»} · {contactos o «Sin contacto»}».
  - Derecha: **DropdownMenu** (trigger = Button ghost icon-only, icono `MoreHorizontal`, `aria-label="Acciones"`) cuyo contenido (align end) es:
    - `DropdownMenuItem` «Mover a otro grupo» (icono `FolderInput`) — existente, sin cambios.
    - `DropdownMenuSeparator` — **nuevo**.
    - `DropdownMenuItem` variant `destructive` «Eliminar» (icono `Trash2`) — **nuevo**.
- **AlertDialog de confirmación** (nuevo, a nivel de página, fuera del DropdownMenu):
  - Título: «Eliminar entrevista».
  - Descripción: «Se eliminarán permanentemente «{título de la entrevista}» y sus notas.».
  - Footer: `AlertDialogCancel` «Cancelar» (variant outline) a la izquierda + `AlertDialogAction` «Eliminar» (variant destructive, rojo) a la derecha.

### Componentes shadcn utilizados

Componentes: `DropdownMenu` (con `DropdownMenuSeparator` e ítem destructive), `AlertDialog`, `Button`, `Badge`, `Toast` (sonner). Todos ya instalados y en uso en el proyecto (los mismos que emplea el borrado de Capturas en `CapturesPage`). Icono `Trash2` (Lucide). Sin componentes nuevos.

### data-testid

- `interview-row-actions` — trigger del DropdownMenu de cada fila (**ya existe** en la página; se reutiliza).
- `group-interviews-list` — contenedor del listado (**ya existe**; se reutiliza para scoping).
- Sin data-testid adicionales: la opción «Eliminar» es localizable por role `menuitem`+name; el AlertDialog por role `alertdialog` y sus botones por role `button`+name («Cancelar»/«Eliminar»); el Toast por su texto.

### Patrón de interacción

- **Acción destructiva en fila** → va en el DropdownMenu con color `destructive` y precedida de `DropdownMenuSeparator`, nunca como botón inline (design system §7.4). El menú ya tiene 2+ acciones, así que el DropdownMenu sigue justificado (§7.4: DropdownMenu para 2+ acciones).
- **Confirmación antes de borrar** → AlertDialog obligatorio con consecuencia explícita y verbo en el botón (design system §6.3). Escape/Cancelar nunca ejecutan el borrado.
- **Feedback de la mutación** → Toast default en éxito («Entrevista eliminada»); Toast destructivo con el mensaje del error en fallo (design system §6.1 y §5.4). No se usa inline error (no es un formulario).
- **Apertura del AlertDialog desde el DropdownMenu** → la apertura se difiere para evitar el conflicto conocido de foco Radix dropdown→dialog (mismo patrón ya aplicado en esta página para «Mover a otro grupo» y en `CapturesPage` para «Eliminar»). Nota de patrón, no de implementación concreta.
- **Actualización del listado** → la fila desaparece de forma optimista al confirmarse el borrado, sin recargar; si el grupo queda vacío, aparece el empty state ya existente (design system §7.5).

### Comportamiento responsive

- **Mobile (< md):** sin cambios respecto a desktop — el menú ⋯ y el AlertDialog son idénticos; el AlertDialog ocupa el ancho disponible con el padding estándar de Radix. La fila conserva su disposición existente.
- **Tablet (md-lg):** interpolado entre mobile y desktop; sin diferencias específicas.
- **Desktop (lg+):** layout completo del wireframe (menú alineado a la derecha de la fila, AlertDialog centrado).

## Notas técnicas

- El borrado de una entrevista ya está resuelto end-to-end en el proceso principal y se reutiliza tal cual: elimina la entrevista con **cascada a sus notas** y es el mismo camino que usa el listado de Capturas. **No hay cambios de schema, migración ni infraestructura.**
- El listado del grupo se resuelve filtrando por el grupo actual en el renderer (sin canal IPC nuevo), igual que hoy; tras el borrado la fila se retira del estado en memoria sin volver a pedir datos.

## Decisiones asumidas

- **Hard-delete (permanente) en vez de soft-delete** → asumido hard-delete (alternativa: soft-delete/papelera). Regla: aunque el design system sugeriría soft-delete por defecto, la app **no tiene** papelera y el borrado de entrevistas ya establecido (Capturas, precedente SPEC-020) es permanente con cascada a notas; introducir soft-delete solo aquí sería incoherente. Se mantiene la convención existente.
- **Sin opción «Deshacer» en el Toast** → asumido Toast simple + confirmación previa por AlertDialog (alternativa: Toast con «Deshacer»). Regla design system §6.3: para acciones irreversibles se usa AlertDialog de confirmación, no el patrón hacer+deshacer.
- **La confirmación nombra la entrevista pero no lista sus notas/participantes** → asumido mensaje conciso «…«{título}» y sus notas.» (alternativa: enumerar consecuencias detalladas). Regla: consistencia literal con el AlertDialog de borrado de Capturas (SPEC-020).
