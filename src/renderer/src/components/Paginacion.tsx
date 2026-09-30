import { useEffect } from 'react'
import { useRecordado } from './recordado'
import { Button } from './ui/button'

export const POR_PAGINA = 20

const SIN_PAGINA = { pagina: 0, firma: '' }

export interface Pie {
  desde: number
  mostradas: number
  total: number
  anterior: (() => void) | null
  siguiente: (() => void) | null
}

/**
 * Shows `filas` 20 at a time and remembers the page under `clave` while the app is open.
 * `filtros` are the values that narrow this table: when they differ from the ones the page
 * was kept with, the table shows page 1. The reset is derived, not triggered, so a screen that
 * opens again with its restored filters keeps its page.
 */
export function usePaginacion<T>(filas: T[], clave: string, filtros: unknown[]): { visibles: T[]; pie: Pie; mostrar: (indice: number) => void } {
  const [guardada, fijar] = useRecordado(clave, SIN_PAGINA)
  const firma = JSON.stringify(filtros)
  const pedida = guardada.firma === firma ? guardada.pagina : 0
  const paginas = Math.max(1, Math.ceil(filas.length / POR_PAGINA))
  const actual = Math.min(pedida, paginas - 1)
  // Keep what is shown: page 1 after a filter change, so going back to earlier filters never
  // brings an old page back, and the last page with rows once a list shrinks. An empty list may
  // still be loading, so it keeps its page.
  useEffect(() => {
    if (guardada.firma !== firma || (filas.length > 0 && actual !== guardada.pagina)) fijar({ pagina: actual, firma })
  }, [guardada, firma, filas.length, actual, fijar])
  const visibles = filas.slice(actual * POR_PAGINA, (actual + 1) * POR_PAGINA)
  const ir = (pagina: number) => fijar({ pagina, firma })
  return {
    visibles,
    /** Moves to the page that holds row `indice`. */
    mostrar: (indice: number) => ir(Math.floor(indice / POR_PAGINA)),
    pie: {
      desde: actual * POR_PAGINA,
      mostradas: visibles.length,
      total: filas.length,
      anterior: actual > 0 ? () => ir(actual - 1) : null,
      siguiente: actual < paginas - 1 ? () => ir(actual + 1) : null
    }
  }
}

/** The footer under a paginated table: always shown, even when every row fits on one page. */
export function PiePaginacion({ pie }: { pie: Pie }) {
  return (
    <div className="flex items-center justify-between gap-3 text-[12px] text-on-surface-muted">
      <span>{pie.total > 0 ? `${pie.desde + 1}–${pie.desde + pie.mostradas} de ${pie.total}` : ''}</span>
      <div className="flex gap-2">
        <Button variant="ghost" disabled={!pie.anterior} onClick={pie.anterior ?? undefined}>
          Anterior
        </Button>
        <Button variant="ghost" disabled={!pie.siguiente} onClick={pie.siguiente ?? undefined}>
          Siguiente
        </Button>
      </div>
    </div>
  )
}
