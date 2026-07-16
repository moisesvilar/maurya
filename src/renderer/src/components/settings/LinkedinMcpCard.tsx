import React, { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { ApiKeyRow } from '@/components/settings/ApiKeyRow'
import type { KeyStatus } from '@/types/secrets'

interface LinkedinMcpCardProps {
  /** Estado del token cifrado (kind 'linkedinMcp'); null mientras carga. */
  tokenStatus: KeyStatus | null
  /** false cuando safeStorage no puede cifrar (deshabilita guardar el token). */
  encryptionAvailable: boolean
  /** Guarda el token cifrado; true si fue bien (limpia el input). */
  onSaveToken: (value: string) => Promise<boolean>
  onRemoveToken: () => Promise<void>
}

/**
 * Card "LinkedIn (MCP)" de Ajustes: conecta un servidor MCP (p. ej. Apify)
 * para enriquecer el contexto de empresas y contactos desde LinkedIn. La URL
 * (no secreta) se persiste en db.json; el token de autorización va cifrado a
 * secrets.json (patrón ApiKeyRow, write-only). Vaciar la URL desconfigura el
 * MCP y el enriquecimiento queda inerte.
 */
export function LinkedinMcpCard({
  tokenStatus,
  encryptionAvailable,
  onSaveToken,
  onRemoveToken
}: LinkedinMcpCardProps): React.ReactElement {
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // Precarga de la URL persistida; un ajuste ilegible viaja normalizado desde
  // main como "no configurado" (url null).
  useEffect(() => {
    let cancelled = false
    void window.api.db.getLinkedinMcpSettings().then((result) => {
      if (cancelled) {
        return
      }
      if (result.ok && result.data.url !== null) {
        setUrl(result.data.url)
      }
      setLoading(false)
    })
    return (): void => {
      cancelled = true
    }
  }, [])

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    const trimmed = url.trim()
    if (trimmed !== '' && !/^https?:\/\/\S+$/.test(trimmed)) {
      setError('Introduce una URL http(s) válida o deja el campo vacío')
      return
    }
    setError(null)
    setSubmitting(true)
    void window.api.db
      .setLinkedinMcpSettings({ url: trimmed === '' ? null : trimmed })
      .then((result) => {
        setSubmitting(false)
        if (result.ok) {
          toast(result.data.url !== null ? 'MCP de LinkedIn guardado' : 'MCP de LinkedIn quitado')
        } else {
          toast.error(result.error.message)
        }
      })
  }

  return (
    <Card data-testid="linkedin-mcp-card">
      <CardHeader>
        <CardTitle>LinkedIn (MCP)</CardTitle>
        <CardDescription>
          Conecta un servidor MCP (por ejemplo Apify) para obtener información de LinkedIn al
          generar el contexto de empresas y contactos. Sin URL, el enriquecimiento desde LinkedIn
          queda desactivado.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <form className="flex flex-col gap-2" onSubmit={handleSubmit}>
          <label className="text-sm font-medium" htmlFor="linkedin-mcp-url-input">
            URL del servidor MCP
          </label>
          <div className="flex flex-col gap-2 md:flex-row md:items-start">
            <Input
              id="linkedin-mcp-url-input"
              data-testid="linkedin-mcp-url-input"
              placeholder="https://mcp.apify.com"
              value={url}
              disabled={loading}
              aria-invalid={error !== null}
              onChange={(event) => {
                setUrl(event.target.value)
                if (error !== null) {
                  setError(null)
                }
              }}
            />
            <Button type="submit" disabled={loading || submitting}>
              {submitting && <Loader2 className="animate-spin" />}
              Guardar
            </Button>
          </div>
          {error !== null && <p className="text-sm text-destructive">{error}</p>}
        </form>
        <ApiKeyRow
          label="Token del MCP de LinkedIn"
          placeholder="Pega aquí el token del servidor MCP (p. ej. token de API de Apify)"
          status={tokenStatus}
          encryptionAvailable={encryptionAvailable}
          onSave={onSaveToken}
          onRemove={onRemoveToken}
        />
      </CardContent>
    </Card>
  )
}
