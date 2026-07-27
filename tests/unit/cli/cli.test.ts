// @vitest-environment node
/**
 * Tests del CLI (src/cli/cli.ts) contra el store JSON real en un directorio
 * temporal, inyectado vía --data-dir (patrón repository.test.ts). Electron se
 * mockea con un guard que lanza: el CLI nunca debe usar app.getPath.
 */
import { mkdtempSync, readFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { runCli } from '../../../src/cli/cli'

vi.mock('electron', () => ({
  app: {
    getPath: (): string => {
      throw new Error('app.getPath no debe usarse: el CLI inyecta --data-dir')
    }
  }
}))

let dataDir = ''
let stdout: string[] = []
let stderr: string[] = []

const io = {
  out: (line: string): void => {
    stdout.push(line)
  },
  err: (line: string): void => {
    stderr.push(line)
  }
}

/** Ejecuta el CLI con --data-dir inyectado y devuelve exit code + JSON parseado. */
function run(...args: string[]): {
  code: number
  payload: { ok: boolean; data?: unknown; error?: { kind: string; message: string } }
} {
  stdout = []
  stderr = []
  const code = runCli(['--data-dir', dataDir, ...args], io)
  expect(stdout).toHaveLength(1)
  return { code, payload: JSON.parse(stdout[0]) }
}

/** Crea una entidad y devuelve su id (falla el test si el create no es ok). */
function createId(...args: string[]): string {
  const { code, payload } = run(...args)
  expect(code).toBe(0)
  expect(payload.ok).toBe(true)
  return (payload.data as { id: string }).id
}

beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), 'maurya-cli-test-'))
})

describe('runCli — creación de las 7 entidades con integridad referencial', () => {
  it('crea discovery, company, contact, templates, grupo y entrevista encadenados', () => {
    const discoveryId = createId(
      'discovery',
      'create',
      '--name',
      'Discovery X',
      '--objectives',
      'Validar'
    )
    const companyId = createId(
      'company',
      'create',
      '--name',
      'Acme',
      '--website',
      'https://acme.test'
    )
    const contactId = createId('contact', 'create', '--company-id', companyId, '--name', 'Jane')
    const interviewTemplateId = createId(
      'interview-template',
      'create',
      '--name',
      'Guion',
      '--phase',
      'exploratory',
      '--blocks',
      '[{"title":"Contexto","questions":[{"text":"¿Cómo facturas hoy?"}]}]'
    )
    const noteTemplateId = createId(
      'note-template',
      'create',
      '--name',
      'Nota',
      '--sections',
      '[{"title":"Dolores","description":"Problemas"}]'
    )
    const groupId = createId(
      'interview-group',
      'create',
      '--discovery-id',
      discoveryId,
      '--name',
      'CFOs',
      '--interview-template-id',
      interviewTemplateId,
      '--note-template-id',
      noteTemplateId
    )
    const interviewId = createId(
      'interview',
      'create',
      '--discovery-id',
      discoveryId,
      '--title',
      'Entrevista Jane',
      '--company-id',
      companyId,
      '--contact-ids',
      JSON.stringify([contactId]),
      '--interview-group-id',
      groupId,
      '--template-id',
      interviewTemplateId
    )

    const { payload } = run('interview', 'get', interviewId)
    const interview = payload.data as Record<string, unknown>
    expect(interview.companyId).toBe(companyId)
    expect(interview.contactIds).toEqual([contactId])
    expect(interview.interviewGroupId).toBe(groupId)

    // Lo creado queda persistido en el db.json del directorio inyectado.
    const persisted = JSON.parse(readFileSync(join(dataDir, 'db.json'), 'utf-8'))
    expect(persisted.interviews).toHaveLength(1)
    expect(persisted.interviewGroups[0].name).toBe('CFOs')
  })

  it('acepta payload completo vía --json, incluido null explícito', () => {
    const { code, payload } = run('company', 'create', '--json', '{"name":"Beta","context":null}')
    expect(code).toBe(0)
    const company = payload.data as Record<string, unknown>
    expect(company.name).toBe('Beta')
    expect(company.context).toBeNull()
  })

  it('los flags individuales sobreescriben las claves del --json', () => {
    const { payload } = run('company', 'create', '--json', '{"name":"Beta"}', '--name', 'Gamma')
    expect((payload.data as Record<string, unknown>).name).toBe('Gamma')
  })
})

describe('runCli — list / update / delete', () => {
  it('lista contactos por empresa y actualiza con patch', () => {
    const companyId = createId('company', 'create', '--name', 'Acme')
    const contactId = createId('contact', 'create', '--company-id', companyId, '--name', 'Jane')

    const list = run('contact', 'list', '--company-id', companyId)
    expect((list.payload.data as unknown[]).length).toBe(1)

    const updated = run('contact', 'update', contactId, '--position', 'CEO')
    expect((updated.payload.data as Record<string, unknown>).position).toBe('CEO')

    const removed = run('contact', 'delete', contactId)
    expect(removed.code).toBe(0)
    expect(removed.payload).toEqual({ ok: true, data: null })
  })

  it('interview list sin --company-id devuelve la vista global de capturas', () => {
    const discoveryId = createId('discovery', 'create', '--name', 'D')
    createId('interview', 'create', '--discovery-id', discoveryId, '--title', 'Capture 1')
    const { payload } = run('interview', 'list')
    expect((payload.data as unknown[]).length).toBe(1)
  })
})

describe('runCli — errores en envelope y exit code 1', () => {
  it('propaga los errores tipados del repositorio (validation / reference / not-found)', () => {
    const invalid = run('company', 'create', '--name', '   ')
    expect(invalid.code).toBe(1)
    expect(invalid.payload.error?.kind).toBe('validation')

    const brokenRef = run('contact', 'create', '--company-id', 'nope', '--name', 'X')
    expect(brokenRef.payload.error?.kind).toBe('reference')

    const missing = run('company', 'get', 'nope')
    expect(missing.payload.error?.kind).toBe('not-found')
  })

  it('reporta errores de uso como kind usage sin tocar el almacén', () => {
    const missingRequired = run('company', 'create')
    expect(missingRequired.code).toBe(1)
    expect(missingRequired.payload.error?.kind).toBe('usage')

    const unknownFlag = run('company', 'create', '--name', 'Acme', '--nope', 'x')
    expect(unknownFlag.payload.error?.kind).toBe('usage')

    const badJson = run('company', 'create', '--json', '{rotisimo')
    expect(badJson.payload.error?.kind).toBe('usage')

    const unknownEntity = run('empresa', 'create')
    expect(unknownEntity.payload.error?.kind).toBe('usage')

    const persisted = JSON.parse(readFileSync(join(dataDir, 'db.json'), 'utf-8'))
    expect(persisted.companies).toHaveLength(0)
  })
})

describe('runCli — search, status y ayuda', () => {
  it('search encuentra entidades por texto y status reporta el almacén', () => {
    const companyId = createId('company', 'create', '--name', 'Acme')
    createId('contact', 'create', '--company-id', companyId, '--name', 'Jane Roe')

    const search = run('search', 'jane')
    const results = search.payload.data as { contacts: Array<{ name: string }> }
    expect(results.contacts.map((contact) => contact.name)).toEqual(['Jane Roe'])

    const status = run('status')
    const data = status.payload.data as Record<string, unknown>
    expect(data.ready).toBe(true)
    expect(data.dbFile).toBe(join(dataDir, 'db.json'))
  })

  it('--help emite texto de ayuda (única salida no-JSON) con exit 0', () => {
    stdout = []
    const code = runCli(['--help'], io)
    expect(code).toBe(0)
    expect(stdout[0]).toContain('maurya-cli')
    expect(stdout[0]).toContain('interview-group')
  })
})

// ---------------------------------------------------------------------------
// SPEC-056 — el --json deja de mentir
// ---------------------------------------------------------------------------

/** Lee el db.json crudo para comparar el almacén antes/después de un comando. */
function readDb(): string {
  return readFileSync(join(dataDir, 'db.json'), 'utf-8')
}

describe('runCli — validación de las claves de --json (SPEC-056)', () => {
  it('AC-01 · una clave declarada en el FieldSpec se aplica con normalidad', () => {
    const discoveryId = createId('discovery', 'create', '--name', 'D')
    const { code, payload } = run(
      'discovery',
      'update',
      discoveryId,
      '--json',
      '{"objectives":"Validar el problema"}'
    )
    expect(code).toBe(0)
    expect((payload.data as Record<string, unknown>).objectives).toBe('Validar el problema')
  })

  it('AC-02 · una clave mal escrita da usage y enumera las claves admitidas', () => {
    const discoveryId = createId('discovery', 'create', '--name', 'D')
    const interviewId = createId(
      'interview',
      'create',
      '--discovery-id',
      discoveryId,
      '--title',
      'Original'
    )

    const { code, payload } = run('interview', 'update', interviewId, '--json', '{"titel":"Nuevo"}')
    expect(code).toBe(1)
    expect(payload.error?.kind).toBe('usage')
    expect(payload.error?.message).toContain('titel')
    expect(payload.error?.message).toContain('title')
    expect(payload.error?.message).toContain('interviewGroupId')

    // El título no se tocó: el error precede a cualquier escritura.
    const after = run('interview', 'get', interviewId)
    expect((after.payload.data as Record<string, unknown>).title).toBe('Original')
  })

  it('AC-03 · varias claves desconocidas se reportan todas y en orden alfabético', () => {
    const companyId = createId('company', 'create', '--name', 'Acme')
    const { payload } = run(
      'company',
      'update',
      companyId,
      '--json',
      '{"zeta":1,"alpha":2,"mid":3}'
    )
    expect(payload.error?.kind).toBe('usage')
    expect(payload.error?.message).toContain('alpha, mid, zeta')
  })

  it('AC-04 · discoveryId sigue siendo inmutable, pero ahora el intento falla', () => {
    const discoveryId = createId('discovery', 'create', '--name', 'D1')
    const otherDiscoveryId = createId('discovery', 'create', '--name', 'D2')
    const interviewId = createId(
      'interview',
      'create',
      '--discovery-id',
      discoveryId,
      '--title',
      'T'
    )

    const { code, payload } = run(
      'interview',
      'update',
      interviewId,
      '--json',
      `{"discoveryId":"${otherDiscoveryId}"}`
    )
    expect(code).toBe(1)
    expect(payload.error?.kind).toBe('usage')
    expect(payload.error?.message).toContain('discoveryId')

    const after = run('interview', 'get', interviewId)
    expect((after.payload.data as Record<string, unknown>).discoveryId).toBe(discoveryId)
  })

  it('AC-05 · la validación aplica a create: clave desconocida no crea nada', () => {
    const { code, payload } = run('discovery', 'create', '--json', '{"name":"X","foo":"bar"}')
    expect(code).toBe(1)
    expect(payload.error?.kind).toBe('usage')

    const list = run('discovery', 'list')
    expect(list.payload.data).toEqual([])
  })

  it('AC-06 · la validación aplica a list, incluso cuando la acción no admite claves', () => {
    const withFields = run('interview', 'list', '--json', '{"foo":1}')
    expect(withFields.payload.error?.kind).toBe('usage')
    expect(withFields.payload.error?.message).toContain('companyId')

    const withoutFields = run('discovery', 'list', '--json', '{"foo":1}')
    expect(withoutFields.payload.error?.kind).toBe('usage')
    expect(withoutFields.payload.error?.message).toContain('no admite payload')
  })

  it('AC-07 · un --json inválido deja el db.json byte a byte idéntico', () => {
    const discoveryId = createId('discovery', 'create', '--name', 'D')
    const interviewId = createId(
      'interview',
      'create',
      '--discovery-id',
      discoveryId,
      '--title',
      'T'
    )
    const before = readDb()

    const { code } = run('interview', 'update', interviewId, '--json', '{"titel":"x"}')
    expect(code).toBe(1)

    // Ni entidades nuevas, ni patch parcial, ni bump de updatedAt.
    expect(readDb()).toBe(before)
  })

  it('AC-08 · las claves se validan sobre el acumulado de varios --json', () => {
    const companyId = createId('company', 'create', '--name', 'Acme')
    const { payload } = run(
      'company',
      'update',
      companyId,
      '--json',
      '{"name":"Beta"}',
      '--json',
      '{"foo":"bar"}'
    )
    expect(payload.error?.kind).toBe('usage')
    expect(payload.error?.message).toContain('foo')
  })

  it('AC-09 · usar el nombre del flag como clave da usage y sugiere la clave real', () => {
    const companyId = createId('company', 'create', '--name', 'Acme')
    const { payload } = run(
      'company',
      'update',
      companyId,
      '--json',
      '{"linkedin-url":"https://x.test"}'
    )
    expect(payload.error?.kind).toBe('usage')
    expect(payload.error?.message).toContain('linkedin-url')
    expect(payload.error?.message).toContain('linkedinUrl')
  })

  it('AC-10 · el --json recibe el mismo trato que un flag suelto desconocido', () => {
    const companyId = createId('company', 'create', '--name', 'Acme')

    const viaFlag = run('company', 'update', companyId, '--nope', 'x')
    const viaJson = run('company', 'update', companyId, '--json', '{"nope":"x"}')

    expect(viaFlag.code).toBe(1)
    expect(viaJson.code).toBe(1)
    expect(viaFlag.payload.error?.kind).toBe('usage')
    expect(viaJson.payload.error?.kind).toBe('usage')
    // Ambos enumeran lo admitido, cada uno en su vocabulario (flags vs claves).
    expect(viaFlag.payload.error?.message).toContain('--linkedin-url')
    expect(viaJson.payload.error?.message).toContain('linkedinUrl')
  })
})

describe('runCli — mover una entrevista de grupo (SPEC-056)', () => {
  /** Discovery con dos grupos + una entrevista en el primero. */
  function scenario(): {
    discoveryId: string
    groupA: string
    groupB: string
    interviewId: string
  } {
    const discoveryId = createId('discovery', 'create', '--name', 'D')
    const groupA = createId(
      'interview-group',
      'create',
      '--discovery-id',
      discoveryId,
      '--name',
      'Exploration'
    )
    const groupB = createId(
      'interview-group',
      'create',
      '--discovery-id',
      discoveryId,
      '--name',
      'Problem interview'
    )
    const interviewId = createId(
      'interview',
      'create',
      '--discovery-id',
      discoveryId,
      '--title',
      'Entrevista',
      '--interview-group-id',
      groupA
    )
    return { discoveryId, groupA, groupB, interviewId }
  }

  it('AC-11 · --interview-group-id mueve la entrevista y lo persiste', () => {
    const { groupB, interviewId } = scenario()

    const { code, payload } = run(
      'interview',
      'update',
      interviewId,
      '--interview-group-id',
      groupB
    )
    expect(code).toBe(0)
    expect((payload.data as Record<string, unknown>).interviewGroupId).toBe(groupB)

    const persisted = JSON.parse(readDb()) as { interviews: Array<{ interviewGroupId: string }> }
    expect(persisted.interviews[0].interviewGroupId).toBe(groupB)
  })

  it('AC-12 · por --json el resultado es equivalente al del flag suelto', () => {
    const { groupB, interviewId } = scenario()
    const { code, payload } = run(
      'interview',
      'update',
      interviewId,
      '--json',
      `{"interviewGroupId":"${groupB}"}`
    )
    expect(code).toBe(0)
    expect((payload.data as Record<string, unknown>).interviewGroupId).toBe(groupB)
  })

  it('AC-13 · un grupo inexistente da reference y no toca la entrevista', () => {
    const { groupA, interviewId } = scenario()

    const { code, payload } = run(
      'interview',
      'update',
      interviewId,
      '--interview-group-id',
      'no-existe'
    )
    expect(code).toBe(1)
    expect(payload.error?.kind).toBe('reference')

    const after = run('interview', 'get', interviewId)
    expect((after.payload.data as Record<string, unknown>).interviewGroupId).toBe(groupA)
  })

  it('AC-14 · un grupo de OTRO discovery da reference (invariante intacta)', () => {
    const { groupA, interviewId } = scenario()
    const otherDiscoveryId = createId('discovery', 'create', '--name', 'Otro discovery')
    const foreignGroup = createId(
      'interview-group',
      'create',
      '--discovery-id',
      otherDiscoveryId,
      '--name',
      'Grupo ajeno'
    )

    const { code, payload } = run(
      'interview',
      'update',
      interviewId,
      '--interview-group-id',
      foreignGroup
    )
    expect(code).toBe(1)
    expect(payload.error?.kind).toBe('reference')

    const after = run('interview', 'get', interviewId)
    expect((after.payload.data as Record<string, unknown>).interviewGroupId).toBe(groupA)
  })

  it('AC-15 · null desasigna el grupo sin error', () => {
    const { interviewId } = scenario()
    const { code, payload } = run(
      'interview',
      'update',
      interviewId,
      '--json',
      '{"interviewGroupId":null}'
    )
    expect(code).toBe(0)
    expect((payload.data as Record<string, unknown>).interviewGroupId).toBeNull()
  })

  it('AC-16 · la ayuda de interview anuncia el flag', () => {
    stdout = []
    const code = runCli(['--data-dir', dataDir, 'interview', '--help'], io)
    expect(code).toBe(0)
    expect(stdout[0]).toContain('interview update')
    expect(stdout[0]).toContain('[--interview-group-id <valor>]')
  })
})
