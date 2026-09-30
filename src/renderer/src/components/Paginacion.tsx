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
 * was kept with, the table shows page 1. Deriving the reset (instead of an effect) keeps a
 * restored page when the screen opens again with its restored filters.
 */
export function usePaginacion<T>(filas: T[], clave: string, filtros: unknown[]): { visibles: T[]; pie: Pie } {
  const [guardada, fijar] = useRecordado(clave, SIN_PAGINA)
  const firma = JSON.stringify(filtros)
  const pedida = guardada.firma === firma ? guardada.pagina : 0
  const paginas = Math.max(1, Math.ceil(filas.length / POR_PAGINA))
  // Clamped for display only: a list that shrinks, or is still loading, gets its page back once it has the rows.
  const actual = Math.min(pedida, paginas - 1)
  const visibles = filas.slice(actual * POR_PAGINA, (actual + 1) * POR_PAGINA)
  const ir = (pagina: number) => fijar({ pagina, firma })
  return {
    visibles,
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
