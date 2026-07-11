// @vitest-environment node
/**
 * SPEC-028: tests de src/main/objectiveOverrideService.ts con el SDK de
 * Anthropic mockeado (arnés de SPEC-014/025: clases de error espejo para
 * instanceof en mapSdkError) y store/repository REALES sobre un directorio
 * temporal. La clave llega por ANTHROPIC_API_KEY (fallback de entorno del
 * servicio); los tests de degradación la borran.
 * Invariante bajo test: marca+texto son unidad atómica — ante cualquier fallo
 * (guard, SDK, stop_reason, parseo) NADA se persiste.
 */
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { overrideInterviewObjective } from '../../../src/main/objectiveOverrideService'
import { LlmOperationError } from '../../../src/main/llmService'
import * as repository from '../../../src/main/db/repository'
import { initStore } from '../../../src/main/db/store'
import type { Interview, ObjectiveResult } from '../../../src/renderer/src/types/domain'

const harness = vi.hoisted(() => {
  /** Jerarquía espejo de la del SDK: instanceof debe funcionar en mapSdkError. */
  class APIError extends Error {}
  class AuthenticationError extends APIError {}
  class RateLimitError extends APIError {}
  class APIConnectionError extends APIError {}
  return {
    create: vi.fn(),
    errors: { APIError, AuthenticationError, RateLimitError, APIConnectionError }
  }
})

vi.mock('@anthropic-ai/sdk', () => {
  class MockAnthropic {
    static APIError = harness.errors.APIError
    static AuthenticationError = harness.errors.AuthenticationError
    static RateLimitError = harness.errors.RateLimitError
    static APIConnectionError = harness.errors.APIConnectionError
    readonly messages = { create: harness.create }
  }
  return { default: MockAnthropic }
})

vi.mock('electron', () => ({
  app: {
    getPath: (): string => {
      throw new Error('app.getPath no debe usarse en tests: initStore recibe baseDir inyectado')
    }
  },
  safeStorage: {
    isEncryptionAvailable: (): boolean => true,
    encryptString: (plain: string): Buffer => Buffer.from(plain, 'utf8'),
    decryptString: (blob: Buffer): string => blob.toString('utf8')
  },
  dialog: {}
}))

/** Respuesta del SDK con bloque thinking + text y usage medible (SPEC-021). */
function sdkResponse(text: string, stopReason = 'end_turn'): unknown {
  return {
    stop_reason: stopReason,
    usage: { input_tokens: 1000, output_tokens: 200 },
    content: [
      { type: 'thinking', thinking: 'razonamiento interno' },
      { type: 'text', text }
    ]
  }
}

const REWRITTEN = 'El gasto de 200 € del último trimestre culminó en una orden firmada.'
const VALID_JSON = JSON.stringify({ text: REWRITTEN })
const COMMENT = 'El cliente confirmó la compra con una orden firmada en la llamada.'

const RESULTS: ObjectiveResult[] = [
  { met: false, reason: 'Solo se registró un gasto de 200 € sin decisión de compra.' },
  { met: true, reason: 'Se obtuvo el dato concreto con cifras del último trimestre.' }
]

/** Entrevista con 2 objetivos; opcionalmente con la evaluación de SPEC-025. */
function seedInterview(options: { withResults?: boolean } = {}): Interview {
  const { withResults = false } = options
  const discovery = repository.createDiscovery({ name: 'Discovery Maurya' })
  const created = repository.createInterview({
    discoveryId: discovery.id,
    title: 'Discovery con Acme'
  })
  const updated = repository.updateInterview(created.id, {
    objectives: ['Objetivo cero', 'Objetivo uno']
  })
  return withResults ? repository.setInterviewObjectiveResults(created.id, RESULTS) : updated
}

/** Ejecuta la operación capturando el error (el envelope lo aplana el IPC). */
async function caughtError(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => null,
    (error: unknown) => error
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  initStore(mkdtempSync(join(tmpdir(), 'maurya-override-')))
  process.env['ANTHROPIC_API_KEY'] = 'sk-ant-test-key'
})

afterEach(() => {
  delete process.env['ANTHROPIC_API_KEY']
})

describe('objectiveOverrideService', () => {
  describe('input guards', () => {
    // Notas técnicas (contrato del canal): índice fuera de rango → format, cero llamadas
    it('rejects an out-of-range objective index with a format error before any SDK call', async () => {
      const interview = seedInterview()

      const caught = await caughtError(overrideInterviewObjective(interview.id, 5, true, COMMENT))

      expect(caught).toBeInstanceOf(LlmOperationError)
      expect((caught as LlmOperationError).kind).toBe('format')
      expect(harness.create).not.toHaveBeenCalled()
      expect(repository.getInterview(interview.id).objectiveOverrides ?? null).toBeNull()
    })

    // SPEC-028 · AC-11 (lado main, defensa en profundidad): comentario vacío → nada
    it('rejects an empty comment with a format error without calling the SDK nor persisting', async () => {
      const interview = seedInterview()

      const caught = await caughtError(overrideInterviewObjective(interview.id, 0, true, '   '))

      expect(caught).toBeInstanceOf(LlmOperationError)
      expect((caught as LlmOperationError).kind).toBe('format')
      expect((caught as LlmOperationError).message).toBe('El comentario es obligatorio')
      expect(harness.create).not.toHaveBeenCalled()
      expect(repository.getInterview(interview.id).objectiveOverrides ?? null).toBeNull()
    })

    // Notas técnicas: entrevista inexistente → not-found del repositorio, cero llamadas
    it('propagates not-found for an unknown interview without calling the SDK', async () => {
      seedInterview()

      const caught = await caughtError(overrideInterviewObjective('missing-id', 0, true, COMMENT))

      expect(caught).toBeInstanceOf(Error)
      expect(harness.create).not.toHaveBeenCalled()
    })
  })

  describe('degradation without key', () => {
    // SPEC-028 · AC-15: sin clave la marca persiste con text = comment y cero llamadas
    it('persists the mark with the literal comment as the explanation and zero SDK calls when no key is resolvable', async () => {
      const interview = seedInterview()
      delete process.env['ANTHROPIC_API_KEY']

      const updated = await overrideInterviewObjective(interview.id, 0, true, ` ${COMMENT} `)

      expect(harness.create).not.toHaveBeenCalled()
      expect(updated.objectiveOverrides).toEqual([
        { met: true, comment: COMMENT, text: COMMENT },
        null
      ])
      // Persistido de verdad (no solo devuelto)
      expect(repository.getInterview(interview.id).objectiveOverrides).toEqual([
        { met: true, comment: COMMENT, text: COMMENT },
        null
      ])
    })
  })

  describe('rewrite call', () => {
    // Notas técnicas: schema { text } y NUNCA temperature/top_p/top_k/budget_tokens
    it('calls Claude with the {text} json_schema and never sends temperature/top_p/top_k/budget_tokens', async () => {
      const interview = seedInterview()
      harness.create.mockResolvedValue(sdkResponse(VALID_JSON))

      await overrideInterviewObjective(interview.id, 0, true, COMMENT)

      const request = harness.create.mock.calls[0][0] as Record<string, unknown>
      expect(request['model']).toBe('claude-opus-4-8')
      expect(request['thinking']).toEqual({ type: 'adaptive' })
      expect(request['output_config']).toEqual({
        format: {
          type: 'json_schema',
          schema: {
            type: 'object',
            properties: { text: { type: 'string', maxLength: 400 } },
            required: ['text'],
            additionalProperties: false
          }
        }
      })
      expect(request).not.toHaveProperty('temperature')
      expect(request).not.toHaveProperty('top_p')
      expect(request).not.toHaveProperty('top_k')
      expect(request).not.toHaveProperty('budget_tokens')
    })

    // SPEC-028 · AC-05/AC-10 (lado main): la evidencia previa viaja solo si existe
    it('includes the previous evaluation as evidence in the prompt only when it exists', async () => {
      harness.create.mockResolvedValue(sdkResponse(VALID_JSON))
      const evidenceHeading = '## Explicación previa de la evaluación automática'

      const evaluated = seedInterview({ withResults: true })
      await overrideInterviewObjective(evaluated.id, 0, true, COMMENT)
      const withEvidence = harness.create.mock.calls[0][0] as {
        messages: Array<{ content: string }>
      }
      expect(withEvidence.messages[0].content).toContain(evidenceHeading)
      expect(withEvidence.messages[0].content).toContain(RESULTS[0].reason)
      expect(withEvidence.messages[0].content).toContain('Objetivo cero')
      expect(withEvidence.messages[0].content).toContain(COMMENT)

      harness.create.mockClear()
      harness.create.mockResolvedValue(sdkResponse(VALID_JSON))
      const unevaluated = seedInterview()
      await overrideInterviewObjective(unevaluated.id, 0, true, COMMENT)
      const withoutEvidence = harness.create.mock.calls[0][0] as {
        messages: Array<{ content: string }>
      }
      expect(withoutEvidence.messages[0].content).not.toContain(evidenceHeading)
    })
  })

  describe('failure paths (nothing persisted)', () => {
    // SPEC-028 · AC-14 (lado main): stop_reason ≠ end_turn → format, marca+texto no se persisten
    it('treats a stop_reason other than end_turn as a format error and persists nothing', async () => {
      const interview = seedInterview()
      harness.create.mockResolvedValue(sdkResponse(VALID_JSON, 'max_tokens'))

      const caught = await caughtError(overrideInterviewObjective(interview.id, 0, true, COMMENT))

      expect(caught).toBeInstanceOf(LlmOperationError)
      expect((caught as LlmOperationError).kind).toBe('format')
      const persisted = repository.getInterview(interview.id)
      expect(persisted.objectiveOverrides ?? null).toBeNull()
      expect(persisted.aiUsage ?? null).toBeNull()
    })

    // SPEC-028 · AC-14 (lado main): respuesta malformada → format y NADA persistido
    it('treats a malformed response as a format error and persists neither the mark nor the text', async () => {
      const interview = seedInterview()
      harness.create.mockResolvedValue(sdkResponse(JSON.stringify({ nope: true })))

      const caught = await caughtError(overrideInterviewObjective(interview.id, 0, true, COMMENT))

      expect(caught).toBeInstanceOf(LlmOperationError)
      expect((caught as LlmOperationError).kind).toBe('format')
      const persisted = repository.getInterview(interview.id)
      expect(persisted.objectiveOverrides ?? null).toBeNull()
      expect(persisted.aiUsage ?? null).toBeNull()
    })

    // SPEC-028 · AC-14 (lado main): el error del SDK se mapea tipado y no toca la entrevista
    it('maps SDK errors via mapSdkError keeping the interview untouched', async () => {
      const interview = seedInterview()
      harness.create.mockRejectedValue(new harness.errors.AuthenticationError('bad key'))

      const caught = await caughtError(overrideInterviewObjective(interview.id, 0, true, COMMENT))

      expect(caught).toBeInstanceOf(LlmOperationError)
      expect((caught as LlmOperationError).kind).toBe('auth')
      expect(repository.getInterview(interview.id).objectiveOverrides ?? null).toBeNull()
    })
  })

  describe('success', () => {
    // SPEC-028 · AC-04 (persistencia) + AC-16 (coste acumulado en aiUsage, SPEC-021)
    it('persists the rewritten override atomically and accumulates the call usage into aiUsage', async () => {
      const interview = seedInterview({ withResults: true })
      harness.create.mockResolvedValue(sdkResponse(VALID_JSON))

      const updated = await overrideInterviewObjective(interview.id, 0, true, COMMENT)

      expect(updated.objectiveOverrides).toEqual([
        { met: true, comment: COMMENT, text: REWRITTEN },
        null
      ])
      // La evaluación previa se conserva (el tachado es historial, no borrado)
      expect(updated.objectiveResults).toEqual(RESULTS)
      // AC-16: la llamada queda contabilizada en el acumulado de la entrevista
      expect(updated.aiUsage).toMatchObject({
        calls: 1,
        inputTokens: 1000,
        outputTokens: 200
      })
      expect(repository.getInterview(interview.id).objectiveOverrides).toEqual(
        updated.objectiveOverrides
      )
    })
  })
})
