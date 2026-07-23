/**
 * Revisión de coste 2026-07: card "Modelos de IA" de Ajustes (componente
 * aislado; frontera de mocking: window.api.db.getAiTaskSettings /
 * setAiTaskSettings) — una fila por tarea con Select de modelo + Checkbox de
 * thinking, precarga de lo persistido y guardado inmediato con Toast.
 */
import { render, screen, waitFor, type RenderResult } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Toaster } from '@/components/ui/sonner'
import { AiModelsCard } from '@/components/settings/AiModelsCard'
import { AI_TASK_IDS, DEFAULT_AI_TASK_SETTINGS } from '@/types/domain'
import { installMockApi, type MockApiHandle } from '../../helpers/mockApi'

let mockApi: MockApiHandle

function renderCard(): RenderResult {
  return render(
    <>
      <AiModelsCard />
      <Toaster />
    </>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockApi = installMockApi()
  vi.mocked(mockApi.api.db.setAiTaskSettings).mockImplementation((settings) =>
    Promise.resolve({ ok: true, data: settings })
  )
})

describe('AiModelsCard', () => {
  it('renders one row per AI task with the default model and thinking preloaded', async () => {
    renderCard()

    expect(await screen.findByText('Modelos de IA')).toBeInTheDocument()
    for (const task of AI_TASK_IDS) {
      expect(screen.getByTestId(`ai-task-row-${task}`)).toBeInTheDocument()
    }
    // Defaults acordados: interactivo en Haiku sin thinking, mantenimiento en
    // Sonnet con thinking, guión en Opus con thinking
    const interactive = screen.getByTestId('ai-task-model-assistantInteractive')
    await waitFor(() => expect(interactive).toBeEnabled())
    expect(interactive).toHaveTextContent('Haiku 4.5')
    expect(screen.getByTestId('ai-task-model-assistantMaintenance')).toHaveTextContent('Sonnet 5')
    expect(screen.getByTestId('ai-task-model-scriptGeneration')).toHaveTextContent('Opus 4.8')
    expect(screen.getByTestId('ai-task-thinking-assistantInteractive')).not.toBeChecked()
    expect(screen.getByTestId('ai-task-thinking-assistantMaintenance')).toBeChecked()
  })

  it('saves immediately when the model of a task changes and shows the toast', async () => {
    const user = userEvent.setup()
    renderCard()
    const trigger = screen.getByTestId('ai-task-model-assistantInteractive')
    await waitFor(() => expect(trigger).toBeEnabled())

    await user.click(trigger)
    await user.click(await screen.findByRole('option', { name: /Sonnet 5/ }))

    expect(vi.mocked(mockApi.api.db.setAiTaskSettings)).toHaveBeenCalledWith({
      ...DEFAULT_AI_TASK_SETTINGS,
      assistantInteractive: { model: 'claude-sonnet-5', thinking: false }
    })
    expect((await screen.findAllByText('Ajustes guardados')).length).toBeGreaterThanOrEqual(1)
  })

  it('saves immediately when the thinking checkbox of a task toggles', async () => {
    const user = userEvent.setup()
    renderCard()
    const checkbox = screen.getByTestId('ai-task-thinking-assistantInteractive')
    await waitFor(() => expect(checkbox).toBeEnabled())

    await user.click(checkbox)

    expect(vi.mocked(mockApi.api.db.setAiTaskSettings)).toHaveBeenCalledWith({
      ...DEFAULT_AI_TASK_SETTINGS,
      assistantInteractive: { model: 'claude-haiku-4-5', thinking: true }
    })
  })

  it('shows the persisted non-default configuration on load', async () => {
    vi.mocked(mockApi.api.db.getAiTaskSettings).mockResolvedValue({
      ok: true,
      data: {
        ...DEFAULT_AI_TASK_SETTINGS,
        noteGeneration: { model: 'claude-haiku-4-5', thinking: false }
      }
    })
    renderCard()

    const trigger = screen.getByTestId('ai-task-model-noteGeneration')
    await waitFor(() => expect(trigger).toBeEnabled())
    expect(trigger).toHaveTextContent('Haiku 4.5')
    expect(screen.getByTestId('ai-task-thinking-noteGeneration')).not.toBeChecked()
  })
})
