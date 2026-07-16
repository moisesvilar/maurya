import React from 'react'
import { useNavigate } from 'react-router-dom'
import { Building2, FolderSearch, Layers, MessagesSquare, User } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList
} from '@/components/ui/command'
import { STATUS_LABELS } from '@/components/interviews/statusLabels'
import { useGlobalSearch } from '@/hooks/useGlobalSearch'

export interface GlobalSearchDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * Diálogo de búsqueda global (SPEC-018): command palette sobre cmdk con
 * `shouldFilter={false}` — la coincidencia (case/diacríticos-insensitive) se
 * calcula en main y aquí solo se pintan los resultados ya filtrados, de forma
 * determinista y testeable. Grupos en orden fijo Discoveries → Grupos →
 * Empresas → Contactos → Entrevistas (SPEC-048), solo los que tienen
 * resultados. Cerrar el diálogo resetea la query (reabrir = búsqueda nueva).
 *
 * Rutas de destino (SPEC-048, modelo v3): empresas y contactos navegan al
 * detalle global directo `/companies/:companyId`; los grupos a
 * `/discoveries/:discoveryId/groups/:groupId`; las entrevistas conservan la
 * ruta anidada (o `/captures/:id` sin empresa, SPEC-020).
 */
export function GlobalSearchDialog({
  open,
  onOpenChange
}: GlobalSearchDialogProps): React.ReactElement {
  const navigate = useNavigate()
  const { query, setQuery, state } = useGlobalSearch()

  const handleOpenChange = (nextOpen: boolean): void => {
    if (!nextOpen) {
      setQuery('')
    }
    onOpenChange(nextOpen)
  }

  const closeAndNavigate = (path: string): void => {
    handleOpenChange(false)
    navigate(path)
  }

  const hasQuery = query.trim() !== ''
  const results = hasQuery && state.status === 'ready' ? state.results : null

  return (
    <CommandDialog
      open={open}
      onOpenChange={handleOpenChange}
      title="Buscar"
      description="Búsqueda global de discoveries, empresas, contactos y entrevistas"
      className="top-[20%] translate-y-0 sm:max-w-[640px]"
    >
      <Command shouldFilter={false}>
        <CommandInput placeholder="Buscar…" value={query} onValueChange={setQuery} />
        <CommandList>
          {!hasQuery && state.status !== 'error' && (
            <div className="py-6 text-center text-sm text-muted-foreground">
              Escribe para buscar discoveries, empresas, contactos o entrevistas.
            </div>
          )}
          {state.status === 'error' && (
            <div className="py-6 text-center text-sm text-muted-foreground">No se pudo buscar</div>
          )}
          {results !== null && (
            <>
              {/* Con shouldFilter=false, CommandEmpty solo debe existir cuando hay
                  query y respuesta correcta (en idle se mostraría siempre). */}
              <CommandEmpty>Sin resultados</CommandEmpty>
              {results.discoveries.length > 0 && (
                <CommandGroup heading="Discoveries">
                  {results.discoveries.map((hit) => (
                    <CommandItem
                      key={`discovery-${hit.id}`}
                      value={`discovery-${hit.id}`}
                      onSelect={() => closeAndNavigate(`/discoveries/${hit.id}`)}
                    >
                      <FolderSearch />
                      <span className="truncate">{hit.name}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
              {results.groups.length > 0 && (
                <CommandGroup heading="Grupos">
                  {results.groups.map((hit) => (
                    <CommandItem
                      key={`group-${hit.id}`}
                      value={`group-${hit.id}`}
                      onSelect={() =>
                        closeAndNavigate(`/discoveries/${hit.discoveryId}/groups/${hit.id}`)
                      }
                    >
                      <Layers />
                      <span className="truncate">{hit.name}</span>
                      <span className="ml-auto truncate text-xs text-muted-foreground">
                        {hit.discoveryName}
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
              {results.companies.length > 0 && (
                <CommandGroup heading="Empresas">
                  {results.companies.map((hit) => (
                    <CommandItem
                      key={`company-${hit.id}`}
                      value={`company-${hit.id}`}
                      onSelect={() => closeAndNavigate(`/companies/${hit.id}`)}
                    >
                      <Building2 />
                      <span className="truncate">{hit.name}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
              {results.contacts.length > 0 && (
                <CommandGroup heading="Contactos">
                  {results.contacts.map((hit) => (
                    <CommandItem
                      key={`contact-${hit.id}`}
                      value={`contact-${hit.id}`}
                      onSelect={() => closeAndNavigate(`/companies/${hit.companyId}`)}
                    >
                      <User />
                      <span className="truncate">{hit.name}</span>
                      <span className="ml-auto truncate text-xs text-muted-foreground">
                        {hit.companyName}
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
              {results.interviews.length > 0 && (
                <CommandGroup heading="Entrevistas">
                  {results.interviews.map((hit) => (
                    <CommandItem
                      key={`interview-${hit.id}`}
                      value={`interview-${hit.id}`}
                      // SPEC-020: los hits sin empresa navegan a la ruta
                      // canónica de captura; con empresa conservan la anidada.
                      onSelect={() =>
                        closeAndNavigate(
                          hit.companyId === null
                            ? `/captures/${hit.id}`
                            : `/discoveries/${hit.discoveryId}/companies/${hit.companyId}/interviews/${hit.id}`
                        )
                      }
                    >
                      <MessagesSquare />
                      <span className="truncate">{hit.title}</span>
                      <span className="ml-auto flex shrink-0 items-center gap-2">
                        <span className="truncate text-xs text-muted-foreground">
                          {hit.companyName ?? 'Sin empresa'}
                        </span>
                        <Badge variant="secondary">{STATUS_LABELS[hit.status]}</Badge>
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
            </>
          )}
        </CommandList>
      </Command>
    </CommandDialog>
  )
}
