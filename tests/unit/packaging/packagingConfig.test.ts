// @vitest-environment node
/**
 * Tests de la configuración de empaquetado macOS e identidad (SPEC-005).
 * Se leen los archivos de config como texto (sin dependencia de YAML: es
 * config estable y se verifica con segmentación simple + substrings).
 * La verificación del bundle real (.app, Info.plist, prompts TCC) es manual.
 */
import { readFileSync, statSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'

const ROOT = process.cwd()

function readText(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), 'utf8')
}

/**
 * Extrae el bloque anidado bajo una clave YAML (líneas siguientes con más
 * indentación que la clave), sin parser: suficiente para config estable.
 */
function extractYamlBlock(yml: string, key: string): string {
  const lines = yml.split(/\r?\n/)
  const startIndex = lines.findIndex((line) => line.trim() === `${key}:`)
  if (startIndex === -1) {
    throw new Error(`No se encontró la clave YAML "${key}:"`)
  }
  const keyIndent = lines[startIndex].length - lines[startIndex].trimStart().length
  const block: string[] = []
  for (const line of lines.slice(startIndex + 1)) {
    const indent = line.length - line.trimStart().length
    if (line.trim() !== '' && indent <= keyIndent) {
      break
    }
    block.push(line)
  }
  return block.join('\n')
}

describe('packaging config (SPEC-005)', () => {
  describe('application identity', () => {
    // SPEC-005 · AC-01 (parcial: identidad en config/código; menú y dock reales son manuales)
    it('names the app "Maurya" in package.json, window title, document title and ships a non-empty icns icon', () => {
      const packageJson = JSON.parse(readText('package.json')) as {
        productName?: string
        version?: string
      }
      expect(packageJson.productName).toBe('Maurya')

      // Título del documento del renderer y de la BrowserWindow (leídos como texto:
      // src/ no se importa porque el main no es ejecutable fuera de Electron)
      expect(readText('src/renderer/index.html')).toContain('<title>Maurya</title>')
      expect(readText('src/main/index.ts')).toContain("title: 'Maurya'")

      // Icono placeholder presente y no vacío
      const icon = statSync(join(ROOT, 'build/icon.icns'))
      expect(icon.size).toBeGreaterThan(0)
    })

    // SPEC-005 · AC-02 (parcial: appId estable en config y versión de package.json)
    it('declares a stable com.<org>.<app> appId and takes the bundle version from package.json', () => {
      const yml = readText('electron-builder.yml')
      expect(yml).toContain('appId: com.maurya.app')
      // Formato estable com.<org>.<app> (CFBundleIdentifier del bundle)
      expect(yml).toMatch(/^appId: com\.[a-z0-9-]+\.[a-z0-9-]+$/m)
      expect(yml).toContain('productName: Maurya')

      // electron-builder toma CFBundleShortVersionString de package.json.version
      const packageJson = JSON.parse(readText('package.json')) as { version?: string }
      expect(packageJson.version).toMatch(/^\d+\.\d+\.\d+$/)

      // El main fija el AppUserModelId al mismo appId
      expect(readText('src/main/index.ts')).toContain("setAppUserModelId('com.maurya.app')")
    })
  })

  describe('macOS build targets', () => {
    // SPEC-005 · AC-03 (parcial: config del build; la ejecución real de build:mac es manual)
    it('configures build:mac to produce dmg and zip artifacts for arm64 with ad-hoc signing', () => {
      const packageJson = JSON.parse(readText('package.json')) as {
        scripts?: Record<string, string>
      }
      expect(packageJson.scripts?.['build:mac']).toBe(
        'electron-vite build && electron-builder --mac'
      )

      const yml = readText('electron-builder.yml')
      const macBlock = extractYamlBlock(yml, 'mac')
      expect(macBlock).toMatch(/- target: dmg\s*\n\s+arch:\s*\n\s+- arm64/)
      expect(macBlock).toMatch(/- target: zip\s*\n\s+arch:\s*\n\s+- arm64/)
      // Firma ad-hoc sin notarización (Developer ID queda para H7)
      expect(macBlock).toContain('identity: null')
      expect(macBlock).toContain('notarize: false')
    })
  })

  describe('TCC usage descriptions', () => {
    // SPEC-005 · AC-05 (parcial: extendInfo en config; el Info.plist del bundle real es manual)
    it('declares NSMicrophoneUsageDescription and NSAudioCaptureUsageDescription as a MAP with Spanish texts', () => {
      const yml = readText('electron-builder.yml')
      const extendInfo = extractYamlBlock(yml, 'extendInfo')

      // Claves como MAP (clave: valor), NO como lista (un guion delante dejaría
      // el Info.plist sin las claves TCC)
      expect(extendInfo).toMatch(/^\s+NSMicrophoneUsageDescription:/m)
      expect(extendInfo).toMatch(/^\s+NSAudioCaptureUsageDescription:/m)
      expect(extendInfo).not.toMatch(/^\s*-\s*NSMicrophoneUsageDescription/m)
      expect(extendInfo).not.toMatch(/^\s*-\s*NSAudioCaptureUsageDescription/m)

      // Textos es-ES que explican el uso (micrófono y audio del sistema)
      expect(extendInfo).toMatch(/micrófono/i)
      expect(extendInfo).toMatch(/audio del sistema/i)
      expect(extendInfo).toMatch(/entrevista/i)
    })
  })
})
