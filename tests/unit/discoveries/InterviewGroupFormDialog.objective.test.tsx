/**
 * SPEC-056 — campo «Objetivo» del Dialog de grupo de entrevistas.
 *
 * La spec acota la altura del campo (max-h + scroll propio) para que un
 * objetivo largo no arrastre al Dialog fuera de la ventana. Esos criterios son
 * de LAYOUT y quedan marcados MANUAL en spec-test-map.json: jsdom no compone,
 * no resuelve `vh` ni `max-height` y `getBoundingClientRect` devuelve ceros, de
 * modo que ningún test unitario puede afirmar que algo deja de recortarse. Un
 * assert de clases CSS comprobaría que alguien escribió una cadena, no el
 * comportamiento, y daría cobertura falsa (docs/RULES.md).
 *
 * Aquí se cubre solo lo que jsdom SÍ decide: que el locator estable existe y
 * está asociado a la etiqueta, y que acotar la altura no truncó el valor —
 * el campo scrollea, no recorta. Frontera de mocking: ninguna; el Dialog
 * recibe `onSubmit` por prop, así que no interviene el bridge.
 */
import { render, screen, waitFor, within, type RenderResult } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { InterviewGroupFormDialog } from '@/components/discoveries/InterviewGroupFormDialog'

/** Objetivo de ~3.500 caracteres: el caso que desbordaba el Dialog. */
const LONG_OBJECTIVE = Array.from(
  { length: 25 },
  (_, index) =>
    `Bloque ${index + 1}. Validar, mediante Entrevistas de Problemas, si existe un problema must-have en el segmento: fabricante de producto sanitario que es una PYME cuya función regulatoria no tiene capacidad senior experta dedicada.`
).join('\n\n')

function renderDialog(onSubmit: (values: unknown) => Promise<boolean>): RenderResult {
  return render(
    <InterviewGroupFormDialog
      open
      onOpenChange={vi.fn()}
      title="Editar grupo"
      submitLabel="Guardar"
      interviewTemplates={[]}
      noteTemplates={[]}
      onSubmit={onSubmit as never}
    />
  )
}

describe('InterviewGroupFormDialog · campo Objetivo (SPEC-056)', () => {
  // SPEC-056 · AC-01 (parte automatizable: existencia del locator estable)
  it('exposes the objective textarea under the group-objective-textarea testid, bound to its label', async () => {
    renderDialog(vi.fn().mockResolvedValue(true))

    const dialog = await screen.findByTestId('group-form-dialog')
    const objective = within(dialog).getByLabelText('Objetivo')

    expect(objective).toBe(within(dialog).getByTestId('group-objective-textarea'))
    expect(objective.tagName).toBe('TEXTAREA')
    expect(objective).toHaveAttribute(
      'placeholder',
      '¿Qué quieres aprender con este grupo de entrevistas?'
    )
  })

  // SPEC-056 · AC-05 · "el objetivo se persiste íntegro, sin truncar"
  it('submits the whole objective when a multi-thousand-character text is pasted at once', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn().mockResolvedValue(true)
    renderDialog(onSubmit)

    const dialog = await screen.findByTestId('group-form-dialog')
    const nameInput = within(dialog).getByLabelText('Nombre')
    await waitFor(() => expect(nameInput).toHaveFocus())
    await user.type(nameInput, 'Problem interview')

    const objective = within(dialog).getByTestId('group-objective-textarea')
    await user.click(objective)
    await user.paste(LONG_OBJECTIVE)

    expect(objective).toHaveValue(LONG_OBJECTIVE)

    await user.click(within(dialog).getByRole('button', { name: 'Guardar' }))

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    expect(onSubmit).toHaveBeenCalledWith({
      name: 'Problem interview',
      objective: LONG_OBJECTIVE,
      interviewTemplateId: null,
      noteTemplateId: null
    })
  })
})
