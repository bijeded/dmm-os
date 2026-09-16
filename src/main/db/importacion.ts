import { and, eq, isNull, or, sql } from 'drizzle-orm'
import { leerCfdi } from '../cfdi'
import type { Db } from './index'
import { contactos, costos, cotizaciones, ingresos, proyectos, sugerenciasImportacion } from './schema'

/** Which folder the CFDI came from: `Facturas/Emitidas` or `Facturas/Recibidas`. */
export type Direccion = 'emitida' | 'recibida'

export interface ResultadoImportacion {
  /** `duplicado` means the UUID was already imported and nothing changed. */
  resultado: 'importado' | 'duplicado' | 'ignorado'
  uuid: string
  /** The Ingreso or Costo, when one was created. */
  id: number | null
  /** The RFC no Contacto claims, when the Contacto could not be linked. */
  rfcDesconocido: string | null
  /** The Proyecto guessed for it, waiting in Logs as a Sugerencia de importación. */
  sugerencia: { proyectoId: number; motivo: string } | null
}

const montos = (cfdi: ReturnType<typeof leerCfdi>) => ({
  subtotal: cfdi.subtotal,
  iva: cfdi.iva,
  total: cfdi.total,
  montoOriginal: cfdi.montoOriginal,
  monedaOriginal: cfdi.monedaOriginal
})

/**
 * Imports one CFDI as an Ingreso (emitida) or a Costo (recibida), keyed by its UUID:
 * importing the same file again changes nothing. The Contacto is linked by RFC; the
 * Proyecto is only ever guessed, and the guess waits as a Sugerencia de importación.
 */
export function importarCfdi(db: Db, xml: string, direccion: Direccion): ResultadoImportacion {
  const cfdi = leerCfdi(xml)
  const vacio = { uuid: cfdi.uuid, id: null, rfcDesconocido: null, sugerencia: null }

  // Only ingreso vouchers become money; pagos, nóminas and traslados carry no new amount.
  if (cfdi.tipo !== 'I') return { ...vacio, resultado: 'ignorado' }

  const tabla = direccion === 'emitida' ? ingresos : costos
  if (db.select({ id: tabla.id }).from(tabla).where(eq(tabla.cfdiUuid, cfdi.uuid)).get()) {
    return { ...vacio, resultado: 'duplicado' }
  }

  const rfc = direccion === 'emitida' ? cfdi.receptor.rfc : cfdi.emisor.rfc
  const contacto = db.select().from(contactos).where(eq(contactos.rfc, rfc)).get()

  return db.transaction((tx) => {
    const registro =
      direccion === 'emitida'
        ? tx
            .insert(ingresos)
            .values({
              categoria: 'factura',
              estado: 'pendiente',
              estadoFacturacion: 'facturado',
              ...montos(cfdi),
              contactoId: contacto?.id ?? null,
              fechaRegistro: cfdi.fecha,
              cfdiUuid: cfdi.uuid,
              notas: cfdi.descripcion
            })
            .returning()
            .get()
        : tx
            .insert(costos)
            .values({
              nombre: cfdi.descripcion,
              categoria: 'unico',
              estado: 'pendiente',
              ...montos(cfdi),
              proveedor: cfdi.emisor.nombre,
              fecha: cfdi.fecha,
              cfdiUuid: cfdi.uuid
            })
            .returning()
            .get()

    const sugerencia = contacto ? adivinarProyecto(tx as Db, contacto.id, cfdi.total, cfdi.fecha) : null
    if (sugerencia) {
      tx.insert(sugerenciasImportacion)
        .values({
          entidad: direccion === 'emitida' ? 'ingreso' : 'costo',
          entidadId: registro.id,
          proyectoId: sugerencia.proyectoId,
          motivo: sugerencia.motivo
        })
        .run()
    }

    return {
      resultado: 'importado' as const,
      uuid: cfdi.uuid,
      id: registro.id,
      rfcDesconocido: contacto ? null : rfc,
      sugerencia
    }
  })
}

/**
 * Guesses which of the Contacto's Proyectos a CFDI belongs to: one whose Cotización is for
 * the same amount, else the only one open on that date. Ambiguity means no guess at all.
 */
function adivinarProyecto(db: Db, contactoId: number, total: number, fecha: string) {
  const abiertos = db
    .select({ id: proyectos.id, total: cotizaciones.total })
    .from(proyectos)
    .leftJoin(cotizaciones, eq(proyectos.cotizacionId, cotizaciones.id))
    .where(
      and(
        eq(proyectos.contactoId, contactoId),
        or(isNull(proyectos.fechaInicio), sql`${proyectos.fechaInicio} <= ${fecha}`),
        or(isNull(proyectos.fechaFin), sql`${proyectos.fechaFin} >= ${fecha}`)
      )
    )
    .all()

  const porMonto = abiertos.filter((p) => p.total === total)
  if (porMonto.length === 1) return { proyectoId: porMonto[0].id, motivo: 'monto y fecha' }
  if (porMonto.length === 0 && abiertos.length === 1) return { proyectoId: abiertos[0].id, motivo: 'fecha' }
  return null
}

/** Sin datos: a year whose Costos were never imported shows no margin rather than a wrong one. */
export function coberturaCostos(db: Db, desde: number, hasta: number): { anio: number; sinDatos: boolean }[] {
  const conDatos = new Set(
    db
      .select({ anio: sql<string>`substr(${costos.fecha}, 1, 4)` })
      .from(costos)
      .groupBy(sql`substr(${costos.fecha}, 1, 4)`)
      .all()
      .map((r) => Number(r.anio))
  )
  return Array.from({ length: hasta - desde + 1 }, (_, i) => desde + i).map((anio) => ({
    anio,
    sinDatos: !conDatos.has(anio)
  }))
}
