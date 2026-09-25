import { posix } from 'node:path'
import type { Cfdi, PagoCfdi } from '../cfdi'
import { clave } from '../nombres'

/**
 * What the Facturas run decides once every file is read: a cancellation (the folder a CFDI is filed
 * in), a sustitución (another CFDI's relación `04`) and a payment date (a separate complemento de
 * pago) all live outside the invoice's own file.
 */

/** One XML under `Facturas/`, as read: `cfdi` is `null` for a document that is not a CFDI. */
export interface Lectura {
  /** Relative to the DMM OS root, e.g. `Facturas/Emitidas/2019/08/Canceladas/x.xml`. */
  archivo: string
  cfdi: Cfdi | null
}

/** Why a CFDI is a Factura cancelada. */
export type MotivoCancelada = 'carpeta' | 'sustituida'

export interface PlanFacturas<L extends Lectura = Lectura> {
  /** Every Factura cancelada by UUID, whether or not its file is in the folders. */
  canceladas: Map<string, MotivoCancelada>
  /** The payments complementos record for each invoice UUID, one per parcialidad, in order. */
  pagos: Map<string, PagoCfdi[]>
  /** The readings to import, in the order they were read: every CFDI that is not cancelled. */
  importar: (L & { cfdi: Cfdi })[]
  /** Files skipped because they are Facturas canceladas, by why. */
  omitidas: { carpeta: number; sustituida: number }
}

/**
 * Whether `archivo` sits in a folder whose name starts with "cancel", ignoring case and accents,
 * anywhere below `Facturas/Emitidas` or `Facturas/Recibidas`.
 */
export function enCarpetaCancelada(archivo: string): boolean {
  return archivo
    .split(posix.sep)
    .slice(2, -1)
    .some((carpeta) => clave(carpeta).startsWith('cancel'))
}

export function planearFacturas<L extends Lectura>(lecturas: L[]): PlanFacturas<L> {
  const cfdis = lecturas.filter((l): l is L & { cfdi: Cfdi } => l.cfdi !== null)
  const canceladas = new Map<string, MotivoCancelada>()
  for (const l of cfdis) if (enCarpetaCancelada(l.archivo)) canceladas.set(l.cfdi.uuid, 'carpeta')
  // Only a CFDI that was not itself filed as cancelled can replace another: a cancelled
  // complemento pointing at a valid invoice must not knock it out.
  for (const l of cfdis) {
    if (canceladas.get(l.cfdi.uuid) === 'carpeta') continue
    for (const uuid of l.cfdi.sustituye) if (!canceladas.has(uuid)) canceladas.set(uuid, 'sustituida')
  }

  const pagos = new Map<string, PagoCfdi[]>()
  for (const l of cfdis) {
    if (canceladas.has(l.cfdi.uuid)) continue
    for (const pago of l.cfdi.pagos) {
      const previos = pagos.get(pago.uuidFactura) ?? []
      // The same complemento filed twice records the same parcialidad twice; it counts once.
      if (previos.some((p) => p.parcialidad === pago.parcialidad)) continue
      pagos.set(pago.uuidFactura, [...previos, pago])
    }
  }
  for (const lista of pagos.values()) lista.sort((a, b) => a.parcialidad - b.parcialidad)

  const omitidas = { carpeta: 0, sustituida: 0 }
  const importar: PlanFacturas<L>['importar'] = []
  for (const l of cfdis) {
    const motivo = canceladas.get(l.cfdi.uuid)
    if (motivo) omitidas[motivo]++
    else importar.push(l)
  }
  return { canceladas, pagos, importar, omitidas }
}
