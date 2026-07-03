// @vitest-environment node
/**
 * Tests de src/main/wavFileService.ts (código Node puro) contra fs real en un
 * directorio temporal. Solo se mockea `electron` (app.getPath('userData')).
 */
import { existsSync, readFileSync } from 'fs'
import { describe, expect, it, vi } from 'vitest'
import { startRecording, stopRecording, writeChunk } from '../../../src/main/wavFileService'

vi.mock('electron', async () => {
  const { mkdtempSync } = await import('fs')
  const { tmpdir } = await import('os')
  const { join } = await import('path')
  const userDataDir = mkdtempSync(join(tmpdir(), 'maurya-wav-test-'))
  return {
    app: {
      getPath: (): string => userDataDir
    }
  }
})

describe('wavFileService', () => {
  describe('when a recording is started, fed PCM chunks and stopped', () => {
    // SPEC-001 · AC-08
    it('writes a linear PCM 16-bit 16 kHz stereo RIFF header and patches the size fields at offsets 4 and 40 on stop', () => {
      const filePath = startRecording()
      expect(existsSync(filePath)).toBe(true)

      // Justo tras iniciar, el header placeholder tiene los tamaños a 0
      const placeholder = readFileSync(filePath)
      expect(placeholder.length).toBe(44)
      expect(placeholder.readUInt32LE(4)).toBe(36)
      expect(placeholder.readUInt32LE(40)).toBe(0)

      // 1600 frames estéreo Int16 = 0.1 s a 16 kHz → 6400 bytes de data
      const frames = 1600
      const chunk = Buffer.alloc(frames * 4, 0x7f)
      writeChunk(chunk)

      const result = stopRecording()
      expect(result.filePath).toBe(filePath)
      expect(result.sampleRate).toBe(16000)
      expect(result.channels).toBe(2)
      expect(result.durationSeconds).toBeCloseTo(0.1, 5)
      expect(result.sizeBytes).toBe(44 + chunk.length)

      const file = readFileSync(filePath)
      expect(file.length).toBe(44 + chunk.length)
      // Marcadores RIFF/WAVE/fmt/data
      expect(file.toString('ascii', 0, 4)).toBe('RIFF')
      expect(file.toString('ascii', 8, 12)).toBe('WAVE')
      expect(file.toString('ascii', 12, 16)).toBe('fmt ')
      expect(file.toString('ascii', 36, 40)).toBe('data')
      // Formato: PCM lineal (1), 2 canales, 16000 Hz, 16 bits por muestra
      expect(file.readUInt16LE(20)).toBe(1)
      expect(file.readUInt16LE(22)).toBe(2)
      expect(file.readUInt32LE(24)).toBe(16000)
      expect(file.readUInt32LE(28)).toBe(16000 * 4) // byte rate
      expect(file.readUInt16LE(32)).toBe(4) // block align (2 canales × 16 bits)
      expect(file.readUInt16LE(34)).toBe(16)
      // Tamaños parcheados tras stop
      expect(file.readUInt32LE(4)).toBe(36 + chunk.length)
      expect(file.readUInt32LE(40)).toBe(chunk.length)
      // La data escrita se conserva íntegra tras el patch del header
      expect(file.subarray(44).equals(chunk)).toBe(true)
    })
  })
})
