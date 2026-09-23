import { calendarioPeriodos } from './calendario'
import type { Db } from './index'
import { costos, ingresos } from './schema'

/** A transaction, which reads and writes exactly like the database itself. */
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]

export function periodoDe(fecha: Date): string {
  return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}`
}

/**
 * Periodo generado: lazily writes the Ingreso/Costo rows the Periodo schedule has up to
 * `periodoActual` that are missing. Idempotent (unique on definition + period). A Costo period
 * no Vigencia de precio covers yet is skipped.
 */
export function generarPeriodos(db: Db | Tx, periodoActual: string) {
  db.transaction((tx) => {
    const calendario = calendarioPeriodos(tx, periodoActual)

    for (const { definicion: d, periodo, fecha } of calendario.ingresos) {
      tx.insert(ingresos)
        .values({
          categoria: d.categoria,
          estadoFacturacion: d.categoria === 'factura' ? 'por_facturar' : null,
          subtotal: d.subtotal,
          iva: d.iva,
          total: d.total,
          montoOriginal: d.montoOriginal,
          monedaOriginal: d.monedaOriginal,
          proyectoId: d.proyectoId,
          cotizacionId: d.cotizacionId,
          contactoId: d.contactoId,
          fechaRegistro: fecha,
          periodo,
          definicionId: d.id
        })
        .onConflictDoNothing()
        .run()
    }

    for (const { definicion: d, periodo, fecha, precio } of calendario.costos) {
      if (!precio) continue
      tx.insert(costos)
        .values({
          nombre: d.nombre,
          categoria: d.tipo,
          subtotal: precio.subtotal,
          iva: precio.iva,
          total: precio.total,
          montoOriginal: precio.montoOriginal,
          monedaOriginal: precio.monedaOriginal,
          proveedor: d.proveedor,
          fecha,
          periodo,
          definicionId: d.id,
          proyectoId: d.proyectoId
        })
        .onConflictDoNothing()
        .run()
    }
  })
}
