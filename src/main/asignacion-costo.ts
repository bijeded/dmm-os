import type { AsignacionCosto, EstadoProyecto } from '../shared/dominio'

/** What the split reads of a Proyecto AI. */
export interface ProyectoAsignable {
  id: number
  nombre: string
  fechaInicio: string | null
  fechaFin: string | null
  estado: EstadoProyecto
}

/**
 * Splits `total` centavos in proportion to `pesos`, in whole centavos that add up to it: each
 * takes its share rounded down, and the centavos left go one each to the largest remainders (the
 * first on a tie).
 */
function mayorResto(total: number, pesos: number[]): number[] {
  const suma = BigInt(pesos.reduce((s, p) => s + p, 0))
  if (suma === 0n) return pesos.map(() => 0)
  const exactos = pesos.map((p) => BigInt(Math.abs(total)) * BigInt(p))
  const montos = exactos.map((e) => Number(e / suma))
  let faltan = Math.abs(total) - montos.reduce((s, m) => s + m, 0)
  const restos = exactos.map((e, k) => ({ k, resto: e % suma })).sort((a, b) => (a.resto === b.resto ? a.k - b.k : a.resto > b.resto ? -1 : 1))
  for (const { k } of restos) {
    if (faltan-- <= 0) break
    montos[k]++
  }
  return montos.map((m) => Math.sign(total) * m || 0)
}

/**
 * Abierto en el mes: whether `p` started on or before the end of `mes` (or has no start date),
 * and was not completed or cancelled before it began. A closed one with no end date recorded
 * (imported history) is taken as closed before.
 */
function abiertoEnElMes(p: ProyectoAsignable, mes: string) {
  if (p.fechaInicio !== null && p.fechaInicio > `${mes}-31`) return false
  if (p.estado !== 'completado' && p.estado !== 'cancelado') return true
  return p.fechaFin !== null && p.fechaFin >= `${mes}-01`
}

/**
 * Month `mes`'s Asignación de costo of `total` centavos across `proyectos` (the Proyectos AI, in
 * the order the rows take), given each one's `tokens` in the month: by tokens across those with
 * usage; with none, evenly across those Abiertos en el mes; with none of those, all Sin asignar.
 */
export function asignacionDeCosto(mes: string, total: number, tokens: Map<number, number>, proyectos: ProyectoAsignable[]): AsignacionCosto {
  const conUso = proyectos.filter((p) => (tokens.get(p.id) ?? 0) > 0)
  const abiertos = proyectos.filter((p) => abiertoEnElMes(p, mes))
  const criterio = conUso.length > 0 ? 'tokens' : abiertos.length > 0 ? 'partes_iguales' : 'sin_proyectos'
  const entre = criterio === 'tokens' ? conUso : abiertos
  const pesos = entre.map((p) => (criterio === 'tokens' ? tokens.get(p.id)! : 1))
  const suma = pesos.reduce((s, x) => s + x, 0)
  const montos = mayorResto(total, pesos)
  return {
    mes,
    total,
    criterio,
    filas: entre.map((p, k) => ({ proyectoId: p.id, nombre: p.nombre, tokens: tokens.get(p.id) ?? 0, parte: pesos[k] / suma, monto: montos[k] })),
    sinAsignar: total - montos.reduce((s, m) => s + m, 0)
  }
}
