// @vitest-environment node
/**
 * Servicio de contexto (empresas/contactos): helpers puros del scraping y
 * guards de generación (clave de Anthropic + fuentes + doble condición del
 * MCP de LinkedIn). Electron mockeado (patrón secretsService.test.ts); los
 * tests de guards nunca pasan de las validaciones (cero red, cero API).
 */
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  extractSitemapUrls,
  generateCompanyContext,
  generateContactContext,
  getContextCapabilities,
  htmlToText,
  isSitemapIndex,
  pickPages
} from '../../../src/main/contextService'
import { LlmOperationError } from '../../../src/main/llmService'
import {
  createCompany,
  createContact,
  setLinkedinMcpSettings
} from '../../../src/main/db/repository'
import { initStore } from '../../../src/main/db/store'
import { initSecrets, saveSecret } from '../../../src/main/secretsService'

vi.mock('electron', () => ({
  app: {
    getPath: (): string => {
      throw new Error('app.getPath no debe usarse en tests: init* reciben baseDir inyectado')
    }
  },
  safeStorage: {
    isEncryptionAvailable: (): boolean => true,
    encryptString: (plain: string): Buffer =>
      Buffer.from(`ENCv1:${Buffer.from(plain, 'utf8').toString('base64')}`, 'utf8'),
    decryptString: (blob: Buffer): string => {
      const text = blob.toString('utf8')
      if (!text.startsWith('ENCv1:')) {
        throw new Error('blob no cifrado por este mock')
      }
      return Buffer.from(text.slice('ENCv1:'.length), 'base64').toString('utf8')
    }
  }
}))

async function expectLlmError(promise: Promise<unknown>, kind: string): Promise<void> {
  let caught: unknown = null
  try {
    await promise
  } catch (error) {
    caught = error
  }
  expect(caught).toBeInstanceOf(LlmOperationError)
  expect((caught as LlmOperationError).kind).toBe(kind)
}

beforeEach(() => {
  // Los fallbacks de .env.local no deben contaminar los guards
  delete process.env.ANTHROPIC_API_KEY
  delete process.env.LINKEDIN_MCP_TOKEN
  const baseDir = mkdtempSync(join(tmpdir(), 'maurya-context-service-'))
  initStore(baseDir)
  initSecrets(baseDir)
})

describe('contextService (helpers puros del scraping)', () => {
  it('extracts http(s) <loc> URLs from a sitemap and detects sitemap indexes', () => {
    const urlset = `<?xml version="1.0"?>
      <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
        <url><loc> https://acme.test/ </loc></url>
        <url><loc>https://acme.test/pricing</loc></url>
        <url><loc>ftp://acme.test/ignorada</loc></url>
      </urlset>`
    expect(extractSitemapUrls(urlset)).toEqual(['https://acme.test/', 'https://acme.test/pricing'])
    expect(isSitemapIndex(urlset)).toBe(false)

    const index = `<sitemapindex><sitemap><loc>https://acme.test/sitemap-1.xml</loc></sitemap></sitemapindex>`
    expect(isSitemapIndex(index)).toBe(true)
    expect(extractSitemapUrls(index)).toEqual(['https://acme.test/sitemap-1.xml'])
  })

  it('picks same-host pages, deduplicated and shallow-first, capped to max', () => {
    const picked = pickPages(
      [
        'https://acme.test/blog/2024/01/post-enterrado',
        'https://www.acme.test/pricing',
        'https://acme.test/pricing/', // duplicada (barra final)
        'https://otra.test/pagina', // otro host: fuera
        'https://acme.test/',
        'https://acme.test/about'
      ],
      'https://acme.test',
      3
    )
    expect(picked).toEqual([
      'https://acme.test/',
      'https://acme.test/about',
      'https://www.acme.test/pricing'
    ])
  })

  it('flattens HTML to readable text dropping scripts, styles and tags', () => {
    const html = `<html><head><title>Acme</title><style>.x{color:red}</style></head>
      <body><script>alert('no')</script>
      <h1>Acme &amp; Co</h1><p>Hacemos m&#225;quinas.</p>
      <ul><li>Rápidas</li><li>Fiables</li></ul></body></html>`
    const text = htmlToText(html)
    expect(text).toContain('Acme & Co')
    expect(text).toContain('Hacemos máquinas.')
    expect(text).toContain('Rápidas')
    expect(text).not.toContain('alert')
    expect(text).not.toContain('color:red')
    expect(text).not.toContain('<')
  })
})

describe('contextService (capacidades y guards de generación)', () => {
  it('reports capabilities from the Anthropic key and the MCP URL', () => {
    expect(getContextCapabilities()).toEqual({
      hasAnthropicKey: false,
      linkedinMcpConfigured: false
    })

    saveSecret('anthropic', 'sk-ant-test-1234')
    setLinkedinMcpSettings({ url: 'https://mcp.apify.com' })
    expect(getContextCapabilities()).toEqual({
      hasAnthropicKey: true,
      linkedinMcpConfigured: true
    })
  })

  it('rejects company generation without an Anthropic key (no-key) before touching any source', async () => {
    const company = createCompany({
      name: 'Acme',
      website: 'https://acme.test'
    })
    await expectLlmError(generateCompanyContext(company.id), 'no-key')
  })

  it('rejects company generation without any usable source (no-source)', async () => {
    saveSecret('anthropic', 'sk-ant-test-1234')

    // Sin web ni LinkedIn
    const bare = createCompany({ name: 'Acme' })
    await expectLlmError(generateCompanyContext(bare.id), 'no-source')

    // Con LinkedIn pero sin MCP configurado: LinkedIn no cuenta como fuente
    const onlyLinkedin = createCompany({
      name: 'Globex',
      linkedinUrl: 'https://linkedin.com/company/globex'
    })
    await expectLlmError(generateCompanyContext(onlyLinkedin.id), 'no-source')
  })

  it('rejects contact generation unless BOTH the MCP is configured and the contact has LinkedIn', async () => {
    saveSecret('anthropic', 'sk-ant-test-1234')
    const company = createCompany({ name: 'Acme' })

    // Contacto con LinkedIn pero MCP sin configurar
    const withLinkedin = createContact({
      companyId: company.id,
      name: 'Ada',
      linkedinUrl: 'https://linkedin.com/in/ada'
    })
    await expectLlmError(generateContactContext(withLinkedin.id), 'no-source')

    // MCP configurado pero contacto sin LinkedIn
    setLinkedinMcpSettings({ url: 'https://mcp.apify.com' })
    const withoutLinkedin = createContact({ companyId: company.id, name: 'Grace' })
    await expectLlmError(generateContactContext(withoutLinkedin.id), 'no-source')
  })

  it('rejects contact generation without an Anthropic key (no-key)', async () => {
    setLinkedinMcpSettings({ url: 'https://mcp.apify.com' })
    const company = createCompany({ name: 'Acme' })
    const contact = createContact({
      companyId: company.id,
      name: 'Ada',
      linkedinUrl: 'https://linkedin.com/in/ada'
    })
    await expectLlmError(generateContactContext(contact.id), 'no-key')
  })
})
