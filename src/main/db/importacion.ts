import { and, eq, isNull, or, sql } from 'drizzle-orm'
import { leerCfdi, type Cfdi } from '../cfdi'
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

/** A transaction, which reads and writes exactly like the database itself. */
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]

/**
 * The amounts as the app records them: MXN centavos, IVA apart, original currency as
 * optional detail. Only MXN and USD are recorded; another currency keeps its MXN amounts
 * and loses only the label.
 */
function montos(cfdi: Cfdi) {
  return {
    subtotal: cfdi.subtotal,
    iva: cfdi.iva,
    total: cfdi.total,
    montoOriginal: cfdi.moneda === 'USD' ? cfdi.montoOriginal : null,
    monedaOriginal: cfdi.moneda === 'USD' ? ('USD' as const) : null
  }
}

/** A CFDI is imported once, whichever folder it turns up in. */
function yaImportado(db: Db | Tx, uuid: string): boolean {
  const existe = (tabla: typeof ingresos | typeof costos) =>
    db.select({ id: tabla.id }).from(tabla).where(eq(tabla.cfdiUuid, uuid)).get() !== undefined
  return existe(ingresos) || existe(costos)
}

/**
 * Imports one CFDI as an Ingreso (emitida) or a Costo (recibida), keyed by its UUID:
 * importing the same file again changes nothing. The Contacto is linked by RFC; the
 * Proyecto is only ever guessed, and the guess waits as a Sugerencia de importación.
 */
export function importarCfdi(db: Db, xml: string, direccion: Direccion): ResultadoImportacion {
  const cfdi = leerCfdi(xml)
  const vacio = { uuid: cfdi.uuid, id: null, rfcDesconocido: null, sugerencia: null }

  // Only ingreso vouchers carry new money; pagos, nóminas and traslados restate what exists.
  // Egresos (notas de crédito) are Reembolsos, which are entered against their original Ingreso.
  if (cfdi.tipo !== 'I') return { ...vacio, resultado: 'ignorado' }
  if (yaImportado(db, cfdi.uuid)) return { ...vacio, resultado: 'duplicado' }

  const rfc = direccion === 'emitida' ? cfdi.receptor.rfc : cfdi.emisor.rfc
  const contacto = db.select().from(contactos).where(eq(contactos.rfc, rfc)).get()

  return db.transaction((tx) => {
    const id =
      direccion === 'emitida' ? registrarIngreso(tx, cfdi, contacto?.id) : registrarCosto(tx, cfdi)

    const sugerencia = contacto ? adivinarProyecto(tx, contacto.id, cfdi.total, cfdi.fecha) : null
    if (sugerencia) {
      tx.insert(sugerenciasImportacion)
        .values({
          entidad: direccion === 'emitida' ? 'ingreso' : 'costo',
          entidadId: id,
          proyectoId: sugerencia.proyectoId,
          motivo: sugerencia.motivo
        })
        .run()
    }

    return {
      resultado: 'importado' as const,
      uuid: cfdi.uuid,
      id,
      rfcDesconocido: contacto ? null : rfc,
      sugerencia
    }
  })
}

/** An emitida is an invoice Ingreso: already facturado, not yet paid. */
function registrarIngreso(tx: Tx, cfdi: Cfdi, contactoId: number | undefined): number {
  return tx
    .insert(ingresos)
    .values({
      categoria: 'factura',
      estado: 'pendiente',
      estadoFacturacion: 'facturado',
      ...montos(cfdi),
      contactoId: contactoId ?? null,
      fechaRegistro: cfdi.fecha,
      cfdiUuid: cfdi.uuid,
      notas: cfdi.descripcion
    })
    .returning({ id: ingresos.id })
    .get().id
}

/** A recibida is a single Costo; a recurring one is recognised from its definición, not the CFDI. */
function registrarCosto(tx: Tx, cfdi: Cfdi): number {
  return tx
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
    .returning({ id: costos.id })
    .get().id
}

/**
 * Guesses which of the Contacto's Proyectos a CFDI belongs to: one whose Cotización is for
 * the same amount, else the only one open on that date. Ambiguity means no guess at all.
 */
function adivinarProyecto(db: Tx, contactoId: number, total: number, fecha: string) {
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
