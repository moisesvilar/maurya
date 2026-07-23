import Anthropic from '@anthropic-ai/sdk'
import type {
  AiTaskConfig,
  Company,
  Contact,
  LinkedinMcpSettings
} from '../renderer/src/types/domain'
import type { ContextCapabilities } from '../renderer/src/types/llm'
import { getAnthropicKey, LlmOperationError, mapSdkError } from './llmService'
import { resolveTaskConfig, thinkingParamFor } from './aiModels'
import { getDecryptedSecret } from './secretsService'
import * as repository from './db/repository'

/**
 * Servicio de generación de contexto de empresas y contactos. Vive SOLO en
 * main (patrón llmService): el SDK de Anthropic, la clave y el token del MCP
 * jamás llegan al renderer; por IPC solo cruzan IDs y entidades actualizadas.
 *
 * Fuentes del contexto:
 * - Web de la empresa: sitemap + scraping en main (fetch nativo de Node) y
 *   resumen con Claude.
 * - LinkedIn: vía el MCP configurado en Ajustes (p. ej. Apify), usando el
 *   conector MCP de la API de Anthropic (beta `mcp-client-2025-11-20`): el
 *   servidor MCP lo llama la propia API, aquí no hay cliente MCP local.
 *
 * Invariante: la entidad solo se persiste tras un parseo válido del resumen;
 * ante cualquier error no cambia nada (patrón generateInterviewScript).
 */

// Constantes del modelo (mismas reglas que llmService: NUNCA enviar
// temperature/top_p/top_k — devuelven 400). El modelo y el thinking vienen de
// los ajustes por tarea ('companyContext'/'contactContext', default Opus 4.8).
const SUMMARY_MAX_TOKENS = 4000
const LINKEDIN_MAX_TOKENS = 8000
/** Beta del conector MCP de la API de Anthropic. */
const MCP_BETA = 'mcp-client-2025-11-20'
/** Máximo de re-envíos ante stop_reason 'pause_turn' del bucle server-side. */
const MAX_PAUSE_CONTINUATIONS = 5

// Límites del scraping: acotan coste y tamaño del prompt.
const MAX_PAGES = 12
const MAX_CHILD_SITEMAPS = 3
const PAGE_CHAR_LIMIT = 6000
const TOTAL_CHAR_LIMIT = 48000
const FETCH_TIMEOUT_MS = 15000
const USER_AGENT = 'Maurya/0.3 (contexto de empresa; +https://github.com/moisesvilar/maurya)'

// ---------------------------------------------------------------------------
// Helpers puros del scraping (exportados para tests unitarios)
// ---------------------------------------------------------------------------

/** true si el XML es un índice de sitemaps (<sitemapindex>) y no un urlset. */
export function isSitemapIndex(xml: string): boolean {
  return /<\s*sitemapindex[\s>]/i.test(xml)
}

/** Extrae las URLs http(s) de los <loc> de un sitemap (urlset o índice). */
export function extractSitemapUrls(xml: string): string[] {
  const urls: string[] = []
  const pattern = /<loc>\s*([^<]+?)\s*<\/loc>/gi
  let match: RegExpExecArray | null
  while ((match = pattern.exec(xml)) !== null) {
    const url = match[1].trim()
    if (/^https?:\/\//i.test(url)) {
      urls.push(url)
    }
  }
  return urls
}

/**
 * Selecciona hasta `max` URLs del mismo host que la web base, sin duplicados
 * y priorizando las rutas menos profundas (home, /about, /pricing… antes que
 * posts enterrados). La home va siempre la primera.
 */
export function pickPages(urls: string[], baseUrl: string, max: number): string[] {
  let baseHost: string
  try {
    baseHost = new URL(baseUrl).hostname.replace(/^www\./, '')
  } catch {
    return []
  }
  const seen = new Set<string>()
  const candidates: Array<{ url: string; depth: number }> = []
  for (const raw of urls) {
    let parsed: URL
    try {
      parsed = new URL(raw)
    } catch {
      continue
    }
    const host = parsed.hostname.replace(/^www\./, '')
    if (host !== baseHost) {
      continue
    }
    // Clave de dedupe con host normalizado: www./sin-www y barra final
    // apuntan a la misma página
    const normalized = `${host}${parsed.pathname.replace(/\/$/, '')}`
    if (seen.has(normalized)) {
      continue
    }
    seen.add(normalized)
    const depth = parsed.pathname.split('/').filter((segment) => segment !== '').length
    candidates.push({ url: raw, depth })
  }
  candidates.sort((a, b) => a.depth - b.depth || a.url.length - b.url.length)
  return candidates.slice(0, max).map((candidate) => candidate.url)
}

/** Decodifica las entidades HTML más comunes (suficiente para texto plano). */
function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(parseInt(code, 16)))
}

/**
 * Aplana HTML a texto legible: elimina script/style/svg/noscript y las
 * etiquetas, decodifica entidades y colapsa el espacio en blanco.
 */
export function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<(script|style|noscript|svg|template)\b[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<(head)\b[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|li|h[1-6]|tr|section|article)>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
  )
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim()
}

// ---------------------------------------------------------------------------
// Scraping de la web (fetch nativo, best-effort)
// ---------------------------------------------------------------------------

/** GET con timeout; null ante cualquier fallo (el scraping es best-effort). */
async function fetchText(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,application/xml,text/plain,*/*' },
      redirect: 'follow'
    })
    if (!response.ok) {
      return null
    }
    return await response.text()
  } catch {
    return null
  }
}

/**
 * Descubre las URLs de la web: /sitemap.xml → Sitemap: de robots.txt →
 * fallback a la propia home. Un índice de sitemaps se expande hasta
 * MAX_CHILD_SITEMAPS hijos.
 */
async function discoverPageUrls(website: string): Promise<string[]> {
  let origin: string
  try {
    origin = new URL(website).origin
  } catch {
    return [website]
  }

  let sitemapXml = await fetchText(`${origin}/sitemap.xml`)
  if (sitemapXml === null || !/<loc>/i.test(sitemapXml)) {
    const robots = await fetchText(`${origin}/robots.txt`)
    const sitemapLine = robots
      ?.split('\n')
      .map((line) => line.trim())
      .find((line) => /^sitemap:/i.test(line))
    const sitemapUrl = sitemapLine?.slice(sitemapLine.indexOf(':') + 1).trim()
    sitemapXml = sitemapUrl !== undefined && sitemapUrl !== '' ? await fetchText(sitemapUrl) : null
  }

  if (sitemapXml === null) {
    return [website]
  }

  if (isSitemapIndex(sitemapXml)) {
    const children = extractSitemapUrls(sitemapXml).slice(0, MAX_CHILD_SITEMAPS)
    const nested = await Promise.all(children.map((child) => fetchText(child)))
    const urls = nested
      .filter((xml): xml is string => xml !== null)
      .flatMap((xml) => extractSitemapUrls(xml))
    return urls.length > 0 ? urls : [website]
  }

  const urls = extractSitemapUrls(sitemapXml)
  return urls.length > 0 ? urls : [website]
}

/**
 * Scrapea la web de la empresa: sitemap → selección de páginas → texto plano
 * acotado por página y en total. Devuelve null si no se pudo leer nada.
 */
async function scrapeWebsite(website: string): Promise<string | null> {
  const discovered = await discoverPageUrls(website)
  const pages = pickPages([website, ...discovered], website, MAX_PAGES)
  const sections: string[] = []
  let total = 0
  for (const url of pages) {
    if (total >= TOTAL_CHAR_LIMIT) {
      break
    }
    const html = await fetchText(url)
    if (html === null) {
      continue
    }
    const text = htmlToText(html).slice(0, PAGE_CHAR_LIMIT)
    if (text === '') {
      continue
    }
    sections.push(`### ${url}\n${text}`)
    total += text.length
  }
  return sections.length > 0 ? sections.join('\n\n') : null
}

// ---------------------------------------------------------------------------
// LinkedIn vía conector MCP de la API de Anthropic
// ---------------------------------------------------------------------------

interface LinkedinMcpConnection {
  url: string
  token: string | null
}

/**
 * Resolución del MCP de LinkedIn: URL de Ajustes (db.json) + token cifrado
 * (Ajustes) → LINKEDIN_MCP_TOKEN de .env.local (fallback de desarrollo).
 * null = MCP no configurado (el enriquecimiento queda inerte).
 */
function resolveLinkedinMcp(): LinkedinMcpConnection | null {
  let settings: LinkedinMcpSettings
  try {
    settings = repository.getLinkedinMcpSettings()
  } catch {
    return null
  }
  if (settings.url === null) {
    return null
  }
  const fromSettings = getDecryptedSecret('linkedinMcp')
  const fromEnv = process.env['LINKEDIN_MCP_TOKEN']?.trim()
  const token = fromSettings ?? (fromEnv !== undefined && fromEnv !== '' ? fromEnv : null)
  return { url: settings.url, token }
}

/** Estado para la UI: habilita los botones "Generar contexto" sin exponer secretos. */
export function getContextCapabilities(): ContextCapabilities {
  return {
    hasAnthropicKey: getAnthropicKey() !== null,
    linkedinMcpConfigured: resolveLinkedinMcp() !== null
  }
}

/** Concatena los bloques de texto de una respuesta beta (ignora thinking/tool use). */
function betaTextOf(message: Anthropic.Beta.Messages.BetaMessage): string {
  return message.content
    .filter((block): block is Anthropic.Beta.Messages.BetaTextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('\n')
    .trim()
}

/**
 * Obtiene un informe de LinkedIn con Claude + herramientas del MCP
 * configurado (conector MCP server-side: la API llama al servidor, aquí no
 * viaja ningún dato de LinkedIn por procesos intermedios). Reanuda los
 * `pause_turn` del bucle de herramientas hasta MAX_PAUSE_CONTINUATIONS.
 */
async function fetchLinkedinReport(
  client: Anthropic,
  config: AiTaskConfig,
  mcp: LinkedinMcpConnection,
  task: string
): Promise<string | null> {
  const messages: Anthropic.Beta.Messages.BetaMessageParam[] = [{ role: 'user', content: task }]
  let response: Anthropic.Beta.Messages.BetaMessage
  try {
    for (let attempt = 0; ; attempt++) {
      response = await client.beta.messages.create({
        model: config.model,
        max_tokens: LINKEDIN_MAX_TOKENS,
        ...thinkingParamFor(config.model, config.thinking, LINKEDIN_MAX_TOKENS),
        betas: [MCP_BETA],
        mcp_servers: [
          {
            type: 'url',
            name: 'linkedin',
            url: mcp.url,
            authorization_token: mcp.token
          }
        ],
        tools: [{ type: 'mcp_toolset', mcp_server_name: 'linkedin' }],
        system:
          'Eres un asistente de investigación. Usa las herramientas MCP disponibles para obtener la información solicitada de LinkedIn y devuelve un informe factual en español con lo obtenido. Si las herramientas no devuelven datos, dilo explícitamente.',
        messages
      })
      if (response.stop_reason !== 'pause_turn' || attempt >= MAX_PAUSE_CONTINUATIONS) {
        break
      }
      // Bucle server-side pausado: re-enviar el turno del asistente lo reanuda
      messages.push({ role: 'assistant', content: response.content })
    }
  } catch (error) {
    throw mapSdkError(error)
  }
  const text = betaTextOf(response)
  return text === '' ? null : text
}

// ---------------------------------------------------------------------------
// Resumen final (structured output, patrón llmService)
// ---------------------------------------------------------------------------

const CONTEXT_SCHEMA = {
  type: 'object' as const,
  properties: { context: { type: 'string' as const } },
  required: ['context'],
  additionalProperties: false
}

/** Valida la forma del JSON devuelto por el structured output. */
function parseGeneratedContext(raw: string): string {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    parsed = null
  }
  const context =
    typeof parsed === 'object' && parsed !== null
      ? (parsed as Record<string, unknown>).context
      : undefined
  if (typeof context !== 'string' || context.trim() === '') {
    throw new LlmOperationError(
      'format',
      'La respuesta de la IA no tiene el formato esperado. Vuelve a intentarlo.'
    )
  }
  return context.trim()
}

async function summarizeContext(
  client: Anthropic,
  config: AiTaskConfig,
  systemTask: string,
  userPrompt: string
): Promise<string> {
  let response: Anthropic.Message
  try {
    response = await client.messages.create({
      model: config.model,
      max_tokens: SUMMARY_MAX_TOKENS,
      ...thinkingParamFor(config.model, config.thinking, SUMMARY_MAX_TOKENS),
      output_config: { format: { type: 'json_schema', schema: CONTEXT_SCHEMA } },
      system: [
        systemTask,
        'Reglas:',
        '- Escribe TODO en español, en markdown conciso (máximo ~300 palabras).',
        '- Solo hechos presentes en las fuentes; no inventes datos ni cifras.',
        '- Si el usuario aportó contexto manual, consérvalo integrado (no lo pierdas).',
        '- Estructura sugerida: qué hace, producto/servicios, clientes y mercado, tamaño y señales, notas útiles para discovery.',
        '- Responde únicamente con el JSON pedido.'
      ].join('\n'),
      messages: [{ role: 'user', content: userPrompt }]
    })
  } catch (error) {
    throw mapSdkError(error)
  }
  const textBlock = response.content.find(
    (block): block is Anthropic.TextBlock => block.type === 'text'
  )
  if (textBlock === undefined) {
    throw new LlmOperationError(
      'format',
      'La respuesta de la IA no contiene texto. Vuelve a intentarlo.'
    )
  }
  return parseGeneratedContext(textBlock.text)
}

// ---------------------------------------------------------------------------
// Generación de contexto de EMPRESA
// ---------------------------------------------------------------------------

/** Guard anti doble-click: una generación en curso por entidad (patrón llmService). */
const inFlightCompanies = new Map<string, Promise<Company>>()
const inFlightContacts = new Map<string, Promise<Contact>>()

export function generateCompanyContext(companyId: string): Promise<Company> {
  const existing = inFlightCompanies.get(companyId)
  if (existing !== undefined) {
    return existing
  }
  const promise = doGenerateCompanyContext(companyId).finally(() => {
    inFlightCompanies.delete(companyId)
  })
  inFlightCompanies.set(companyId, promise)
  return promise
}

async function doGenerateCompanyContext(companyId: string): Promise<Company> {
  const company = repository.getCompany(companyId)
  const apiKey = getAnthropicKey()
  if (apiKey === null) {
    throw new LlmOperationError(
      'no-key',
      'Configura tu clave de Anthropic en Ajustes para generar el contexto'
    )
  }
  const mcp = company.linkedinUrl !== null ? resolveLinkedinMcp() : null
  if (company.website === null && mcp === null) {
    throw new LlmOperationError(
      'no-source',
      'Añade la web de la empresa o configura el MCP de LinkedIn (y la URL de LinkedIn de la empresa) para generar contexto'
    )
  }

  const client = new Anthropic({ apiKey })
  // Config por tarea (revisión de coste 2026-07): una para las dos llamadas
  // (informe LinkedIn + resumen) de la generación de contexto de empresa.
  const taskConfig = resolveTaskConfig('companyContext')

  // Fuente 1: la web (best-effort; si falla y hay LinkedIn, se degrada)
  const webText = company.website !== null ? await scrapeWebsite(company.website) : null

  // Fuente 2: LinkedIn vía MCP. Degradable si la web aportó material; si era
  // la única fuente, el error tipado sube al renderer.
  let linkedinReport: string | null = null
  if (mcp !== null && company.linkedinUrl !== null) {
    try {
      linkedinReport = await fetchLinkedinReport(
        client,
        taskConfig,
        mcp,
        `Obtén información de la empresa "${company.name}" desde su página de LinkedIn: ${company.linkedinUrl}. Interesan: descripción, sector, tamaño (empleados), sede, productos/servicios, publicaciones o señales recientes.`
      )
    } catch (error) {
      if (webText === null) {
        throw error
      }
      linkedinReport = null
    }
  }

  if (webText === null && linkedinReport === null) {
    throw new LlmOperationError(
      'no-source',
      'No se pudo obtener contenido ni de la web ni de LinkedIn. Revisa las URLs y la configuración del MCP.'
    )
  }

  const manual = company.context?.trim() ?? ''
  const sections: string[] = [
    `## Empresa\nNombre: ${company.name}` +
      (company.website !== null ? `\nWeb: ${company.website}` : '') +
      (company.linkedinUrl !== null ? `\nLinkedIn: ${company.linkedinUrl}` : '')
  ]
  if (manual !== '') {
    sections.push(`## Contexto manual del usuario (consérvalo integrado)\n${manual}`)
  }
  if (webText !== null) {
    sections.push(`## Contenido de la web\n${webText}`)
  }
  if (linkedinReport !== null) {
    sections.push(`## Informe de LinkedIn\n${linkedinReport}`)
  }
  sections.push('## Tarea\nRedacta el contexto de la empresa a partir de las fuentes anteriores.')

  const context = await summarizeContext(
    client,
    taskConfig,
    'Tu tarea: redactar el campo "contexto" de una empresa para preparar entrevistas de discovery (The Mom Test).',
    sections.join('\n\n')
  )

  // Persistir SOLO tras parseo válido (ante error la empresa no cambia)
  return repository.updateCompany(company.id, { context })
}

// ---------------------------------------------------------------------------
// Generación de contexto de CONTACTO
// ---------------------------------------------------------------------------

export function generateContactContext(contactId: string): Promise<Contact> {
  const existing = inFlightContacts.get(contactId)
  if (existing !== undefined) {
    return existing
  }
  const promise = doGenerateContactContext(contactId).finally(() => {
    inFlightContacts.delete(contactId)
  })
  inFlightContacts.set(contactId, promise)
  return promise
}

async function doGenerateContactContext(contactId: string): Promise<Contact> {
  const contact = repository.getContact(contactId)
  const apiKey = getAnthropicKey()
  if (apiKey === null) {
    throw new LlmOperationError(
      'no-key',
      'Configura tu clave de Anthropic en Ajustes para generar el contexto'
    )
  }
  // Doble condición del contacto: MCP configurado Y LinkedIn del contacto
  const mcp = resolveLinkedinMcp()
  if (mcp === null || contact.linkedinUrl === null) {
    throw new LlmOperationError(
      'no-source',
      'El contexto de un contacto se genera desde LinkedIn: configura el MCP de LinkedIn en Ajustes y añade la URL de LinkedIn del contacto'
    )
  }

  let company: Company | null = null
  try {
    company = repository.getCompany(contact.companyId)
  } catch {
    company = null
  }

  const client = new Anthropic({ apiKey })
  // Config por tarea (revisión de coste 2026-07): informe + resumen del contacto
  const taskConfig = resolveTaskConfig('contactContext')
  const linkedinReport = await fetchLinkedinReport(
    client,
    taskConfig,
    mcp,
    `Obtén información del perfil de LinkedIn de "${contact.name}"${
      contact.position !== null ? ` (${contact.position})` : ''
    }${company !== null ? ` de la empresa "${company.name}"` : ''}: ${contact.linkedinUrl}. Interesan: cargo actual, trayectoria, responsabilidades, publicaciones o señales recientes.`
  )
  if (linkedinReport === null) {
    throw new LlmOperationError(
      'no-source',
      'LinkedIn no devolvió información para este contacto. Revisa la URL y la configuración del MCP.'
    )
  }

  const manual = contact.context?.trim() ?? ''
  const sections: string[] = [
    `## Contacto\nNombre: ${contact.name}` +
      (contact.position !== null ? `\nCargo: ${contact.position}` : '') +
      (company !== null ? `\nEmpresa: ${company.name}` : '') +
      `\nLinkedIn: ${contact.linkedinUrl}`
  ]
  if (manual !== '') {
    sections.push(`## Contexto manual del usuario (consérvalo integrado)\n${manual}`)
  }
  sections.push(`## Informe de LinkedIn\n${linkedinReport}`)
  sections.push('## Tarea\nRedacta el contexto del contacto a partir de las fuentes anteriores.')

  const context = await summarizeContext(
    client,
    taskConfig,
    'Tu tarea: redactar el campo "contexto" de un contacto (la persona a entrevistar) para preparar entrevistas de discovery (The Mom Test).',
    sections.join('\n\n')
  )

  // Persistir SOLO tras parseo válido (ante error el contacto no cambia)
  return repository.updateContact(contact.id, { context })
}
