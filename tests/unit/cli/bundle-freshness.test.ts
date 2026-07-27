// @vitest-environment node
/**
 * SPEC-056 AC-17..AC-19 — sincronía del bundle del CLI.
 *
 * `bin/maurya-cli` no ejecuta el código fuente: carga `out/cli/index.cjs`, un
 * artefacto que genera `npm run cli:build` y que no está versionado. Cuando ese
 * artefacto se queda atrás, el CLI corre código viejo en silencio (fue la mitad
 * del bug que originó esta spec: un `updateInterview` sin soporte de
 * interviewGroupId seguía instalado cuatro días después del commit que lo añadió).
 *
 * La comprobación es por CONTENIDO, no por mtime: los mtimes cambian con un
 * `git checkout` sin que cambie el código, lo que daría rojos falsos. esbuild es
 * determinista, así que reconstruir a un temporal y comparar byte a byte responde
 * exactamente a la pregunta «¿el artefacto instalado es el que produce este código?».
 *
 * El comando de build se lee de package.json (única fuente de verdad: si alguien
 * cambia las flags de `cli:build`, este test las hereda) y se le añade un
 * `--outfile` que sobreescribe al del script — esbuild se queda con el último.
 */
import { execSync } from 'child_process'
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'fs'
import { delimiter, join } from 'path'
import { tmpdir } from 'os'
import { describe, expect, it } from 'vitest'

/** Raíz del repo: vitest ejecuta con cwd = root del proyecto (vitest.config.ts). */
const repoRoot = process.cwd()
const bundlePath = join(repoRoot, 'out', 'cli', 'index.cjs')

type BundleState = 'missing' | 'fresh' | 'stale'

let expectedBundle: string | null = null

/** Reconstruye el bundle a un temporal con el comando real de package.json. */
function buildExpectedBundle(): string {
  if (expectedBundle !== null) {
    return expectedBundle
  }
  const packageJson = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf-8')) as {
    scripts: Record<string, string>
  }
  const command = packageJson.scripts['cli:build']
  expect(command, 'package.json debe seguir teniendo el script cli:build').toBeTruthy()

  const outfile = join(mkdtempSync(join(tmpdir(), 'maurya-cli-bundle-')), 'index.cjs')
  execSync(`${command} --outfile="${outfile}"`, {
    cwd: repoRoot,
    stdio: 'pipe',
    // El comando invoca `esbuild` a secas, como haría npm: node_modules/.bin al PATH.
    env: {
      ...process.env,
      PATH: `${join(repoRoot, 'node_modules', '.bin')}${delimiter}${process.env.PATH ?? ''}`
    }
  })
  expectedBundle = readFileSync(outfile, 'utf-8')
  return expectedBundle
}

/** 'missing' = no hay artefacto (clon limpio) · 'fresh' = al día · 'stale' = desincronizado. */
function inspectBundle(path: string): BundleState {
  if (!existsSync(path)) {
    return 'missing'
  }
  return readFileSync(path, 'utf-8') === buildExpectedBundle() ? 'fresh' : 'stale'
}

describe('bundle del CLI — sincronía con el código fuente', () => {
  it('AC-18 · el bundle instalado coincide con lo que produce el código actual', () => {
    const state = inspectBundle(bundlePath)
    expect(
      state,
      'out/cli/index.cjs está desincronizado del código: bin/maurya-cli estaría ejecutando una versión vieja. Ejecuta `npm run cli:build`.'
    ).not.toBe('stale')
  }, 60_000)

  it('AC-19 · sin out/ el test pasa: el bundle es un artefacto opcional', () => {
    expect(inspectBundle(join(repoRoot, 'out', 'cli', 'no-existe.cjs'))).toBe('missing')
  })

  it('AC-17 · un bundle con contenido distinto se detecta como desincronizado', () => {
    const stalePath = join(mkdtempSync(join(tmpdir(), 'maurya-cli-stale-')), 'index.cjs')
    writeFileSync(stalePath, `${buildExpectedBundle()}\n// bundle de otra época\n`, 'utf-8')
    expect(inspectBundle(stalePath)).toBe('stale')
  }, 60_000)
})
