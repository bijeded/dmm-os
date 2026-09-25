import { and, eq, isNull, ne, or, sql } from 'drizzle-orm'
import type { Cfdi, PagoCfdi } from '../cfdi'
import type { Db } from '../db'
import { enParcialidades, montos, type MontosRegistrados } from '../dinero'
import { proponer } from '../sugerencias'
import { contactos, cotizaciones, ingresos, proyectos, sugerenciasImportacion } from '../db/schema'
import type { CambioFactura } from '../../shared/dominio'
import type { MotivoCancelada } from './plan-facturas'

export interface ResultadoImportacion {
  /** `duplicado` means the UUID was already imported and nothing changed. */
  resultado: 'importado' | 'duplicado' | 'ignorado'
  uuid: string
  /** The first Ingreso, when one was created. */
  id: number | null
  /** The RFC no Contacto claims, when the Contacto could not be linked. */
  rfcDesconocido: string | null
  /** The IVA rate, in percent, when it is neither 0 nor 16%; the amounts are imported as charged. */
  tasaIvaInusual: number | null
  /** How many Sugerencias de importación it left waiting: one per Ingreso it created with a guess. */
  sugerencias: number
  /** An Ingreso imported by an earlier run that this one re-dated or split, or left alone. */
  cambio: { tipo: 'refechado' | 'dividido' | 'intacto'; detalle: CambioFactura } | null
}

type Ingreso = typeof ingresos.$inferSelect

/** A transaction, which reads and writes exactly like the database itself. */
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]

/**
 * The amounts as the invoice states them, built by the money module, which checks the total balances.
 * Only MXN and USD are recorded; another currency keeps its MXN amounts and loses only the label.
 */
function montosDe(cfdi: Cfdi) {
  return montos(cfdi.subtotal, {
    iva: cfdi.iva,
    retenciones: cfdi.retenciones,
    total: cfdi.total,
    montoOriginal: cfdi.moneda === 'USD' ? cfdi.montoOriginal : null
  })
}

/**
 * A CFDI is imported once, whichever folder it turns up in. Seeing it again re-reads its IVA and
 * retenciones, so a row imported when IVA was stored net of retenciones ends as a fresh import
 * would store it. Only a row still holding one of the old splits is rewritten: IVA net of retenciones, or
 * that net moved whole into retenciones by migration 0013. Any other split, or a changed subtotal or
 * total, was edited by hand and is left alone.
 */
function releerSiImportado(db: Tx, cfdi: Cfdi): boolean {
  const { subtotal, iva, retenciones, total } = montosDe(cfdi)
  const neto = iva - retenciones
  // A Parcialidad holds only a share of the CFDI, so only a row holding all of it is re-read.
  const filas = db.select().from(ingresos).where(eq(ingresos.cfdiUuid, cfdi.uuid)).all()
  if (filas.length === 0) return false
  const fila = filas.find((f) => f.cfdiParcialidad === 0)
  if (fila === undefined) return true
  db.update(ingresos)
    .set({ iva, retenciones })
    .where(
      and(
        eq(ingresos.id, fila.id),
        eq(ingresos.subtotal, subtotal),
        eq(ingresos.total, total),
        or(
          and(eq(ingresos.iva, neto), eq(ingresos.retenciones, 0)),
          and(eq(ingresos.iva, 0), eq(ingresos.retenciones, -neto))
        )
      )
    )
    .run()
  return true
}

/**
 * Imports one issued CFDI as an Ingreso, keyed by its UUID: importing the same file again
 * changes nothing. Received CFDIs are never imported; Costos are entered by hand. The Contacto is linked by RFC; the
 * Proyecto is only ever guessed, and the guess waits as a Sugerencia de importación.
 * A PPD invoice is dated by the `pagos` its complementos record, split into Parcialidades
 * when there are several; an Ingreso an earlier run imported is re-dated or split to match.
 */
export function importarCfdi(db: Db, cfdi: Cfdi, pagos: PagoCfdi[] = []): ResultadoImportacion {
  const vacio = { uuid: cfdi.uuid, id: null, rfcDesconocido: null, tasaIvaInusual: null, sugerencias: 0, cambio: null }

  // Only ingreso vouchers carry new money; pagos, nóminas and traslados restate what exists.
  // Egresos (notas de crédito) are Reembolsos, which are entered against their original Ingreso.
  if (cfdi.tipo !== 'I') return { ...vacio, resultado: 'ignorado' }

  return db.transaction((tx) => {
    const partes = partesDeFactura(cfdi, pagos)
    if (releerSiImportado(tx, cfdi)) return { ...vacio, resultado: 'duplicado' as const, cambio: conciliar(tx, cfdi, partes) }

    const rfc = cfdi.receptor.rfc
    const contacto = tx.select().from(contactos).where(eq(contactos.rfc, rfc)).get()
    const ids = partes.map((p) => registrarIngreso(tx, cfdi, p, contacto?.id))

    const adivinado = contacto ? adivinarProyecto(tx, contacto.id, cfdi.total, cfdi.fecha) : null
    const sugerencias = adivinado
      ? ids.filter((id) =>
          proponer(tx, {
            entidad: 'ingreso',
            entidadId: id,
            proyectoId: adivinado.proyectoId,
            motivo: adivinado.motivo
          })
        ).length
      : 0

    return {
      resultado: 'importado' as const,
      uuid: cfdi.uuid,
      id: ids[0],
      rfcDesconocido: contacto ? null : rfc,
      tasaIvaInusual: cfdi.tasaIvaInusual,
      sugerencias,
      cambio: null
    }
  })
}

/** One Ingreso a CFDI records: 0 is the whole invoice, n its nth Parcialidad. */
interface Parte {
  parcialidad: number
  montos: MontosRegistrados
  estado: 'pagado' | 'pendiente'
  fechaPago: string | null
}

const parteCompleta = (cfdi: Cfdi, fechaPago: string): Parte => ({
  parcialidad: 0,
  montos: montosDe(cfdi),
  estado: 'pagado',
  fechaPago
})

/**
 * The Ingresos an issued invoice records. Only a PPD invoice with complementos is dated by them: one
 * payment that pays it all re-dates it whole, several split it into Parcialidades numbered by their
 * NumParcialidad, the last one still pending while a balance is open. Without complementos it is paid
 * on its own date.
 */
function partesDeFactura(cfdi: Cfdi, pagos: PagoCfdi[]): Parte[] {
  if (cfdi.metodoPago !== 'PPD' || pagos.length === 0) return [parteCompleta(cfdi, cfdi.fecha)]
  const partes = enParcialidades(montosDe(cfdi), pagos, cfdi.montoOriginal ?? cfdi.total)
  if (partes.length === 1) return [parteCompleta(cfdi, pagos[0].fecha)]
  return partes.map((p, i) => {
    const pago = pagos[i] as PagoCfdi | undefined
    return {
      parcialidad: pago?.parcialidad ?? pagos[pagos.length - 1].parcialidad + 1,
      montos: p.montos,
      estado: p.pagada ? 'pagado' : 'pendiente',
      fechaPago: p.pagada && pago ? pago.fecha : null
    }
  })
}

const mismosMontos = (fila: Ingreso, m: MontosRegistrados) =>
  fila.subtotal === m.subtotal && fila.iva === m.iva && fila.retenciones === m.retenciones && fila.total === m.total

const tieneReembolso = (tx: Tx, id: number) =>
  tx.select({ id: ingresos.id }).from(ingresos).where(eq(ingresos.reembolsoDeId, id)).get() !== undefined

const detalle = (fila: Ingreso, motivo: CambioFactura['motivo'], total = fila.total): CambioFactura => ({
  entidad: 'ingreso',
  id: fila.id,
  fecha: fila.fechaRegistro,
  total,
  motivo
})

/**
 * Brings the Ingresos an earlier run imported for `cfdi` in line with `partes`. A whole-invoice row is
 * re-dated or split only while it still holds what its import stored. Parcialidades already paid are
 * never rewritten: when the complementos now say something else about one, or no longer split the
 * invoice at all, the invoice is left alone and reported. Pending remainders are re-derived.
 */
function conciliar(tx: Tx, cfdi: Cfdi, partes: Parte[]): ResultadoImportacion['cambio'] {
  const filas = tx
    .select()
    .from(ingresos)
    .where(and(eq(ingresos.cfdiUuid, cfdi.uuid), ne(ingresos.estado, 'cancelado')))
    .orderBy(ingresos.cfdiParcialidad)
    .all()
  if (filas.length === 0) return null
  const [primera] = filas
  const dividido = { tipo: 'dividido' as const, detalle: detalle(primera, 'pagos', cfdi.total) }

  if (primera.cfdiParcialidad === 0) {
    const [parte] = partes
    if (partes.length === 1 && primera.fechaPago === parte.fechaPago) return null
    const intacta = primera.estado === 'pagado' && mismosMontos(primera, montosDe(cfdi)) && primera.fechaPago === cfdi.fecha
    if (!intacta || tieneReembolso(tx, primera.id))
      return { tipo: 'intacto', detalle: detalle(primera, intacta ? 'reembolso' : 'editado') }
    if (partes.length === 1) {
      tx.update(ingresos).set({ fechaPago: parte.fechaPago }).where(eq(ingresos.id, primera.id)).run()
      return { tipo: 'refechado', detalle: detalle(primera, 'pagos') }
    }
    escribirParte(tx, primera.id, partes[0])
    for (const p of partes.slice(1)) copiarParte(tx, primera, p)
    return dividido
  }

  const pagadas = filas.filter((f) => f.estado === 'pagado')
  const cuadra = (f: Ingreso) =>
    partes.some((p) => p.parcialidad === f.cfdiParcialidad && p.estado === 'pagado' && p.fechaPago === f.fechaPago && mismosMontos(f, p.montos))
  if (partes[0].parcialidad === 0 || !pagadas.every(cuadra) || filas.some((f) => tieneReembolso(tx, f.id)))
    return { tipo: 'intacto', detalle: detalle(primera, 'complementos', cfdi.total) }

  const libres = filas.filter((f) => f.estado === 'pendiente')
  const faltan = partes.filter((p) => !pagadas.some((f) => f.cfdiParcialidad === p.parcialidad))
  let cambio = false
  // A pending row keeps its number when that Parcialidad is still wanted; otherwise it is reused.
  const porEscribir = faltan.map((p) => {
    const i = libres.findIndex((f) => f.cfdiParcialidad === p.parcialidad)
    return { p, fila: i === -1 ? undefined : libres.splice(i, 1)[0] }
  })
  for (const x of porEscribir) if (!x.fila) x.fila = libres.shift()
  for (const { p, fila } of porEscribir) {
    if (!fila) {
      copiarParte(tx, primera, p)
      cambio = true
    } else if (fila.cfdiParcialidad !== p.parcialidad || fila.estado !== p.estado || fila.fechaPago !== p.fechaPago || !mismosMontos(fila, p.montos)) {
      escribirParte(tx, fila.id, p)
      cambio = true
    }
  }
  // A remainder no Parcialidad needs any more held no money: it is cancelled, never left pending.
  for (const f of libres) {
    tx.update(ingresos).set({ estado: 'cancelado' }).where(eq(ingresos.id, f.id)).run()
    cambio = true
  }
  return cambio ? dividido : null
}

function escribirParte(tx: Tx, id: number, p: Parte): void {
  tx.update(ingresos)
    .set({ ...p.montos, cfdiParcialidad: p.parcialidad, estado: p.estado, fechaPago: p.fechaPago })
    .where(eq(ingresos.id, id))
    .run()
}

/**
 * A new Parcialidad of an invoice already imported: the same links and notes as its first row, and
 * the same Sugerencias de importación still waiting on it, so accepting one links every Parcialidad.
 */
function copiarParte(tx: Tx, fila: Ingreso, p: Parte): void {
  const { id } = tx
    .insert(ingresos)
    .values({
      categoria: fila.categoria,
      estadoFacturacion: fila.estadoFacturacion,
      contactoId: fila.contactoId,
      proyectoId: fila.proyectoId,
      cotizacionId: fila.cotizacionId,
      fechaRegistro: fila.fechaRegistro,
      cfdiUuid: fila.cfdiUuid,
      notas: fila.notas,
      ...p.montos,
      cfdiParcialidad: p.parcialidad,
      estado: p.estado,
      fechaPago: p.fechaPago
    })
    .returning({ id: ingresos.id })
    .get()
  const esperando = and(
    eq(sugerenciasImportacion.entidad, 'ingreso'),
    eq(sugerenciasImportacion.entidadId, fila.id),
    eq(sugerenciasImportacion.estado, 'pendiente')
  )
  for (const s of tx.select().from(sugerenciasImportacion).where(esperando).all())
    proponer(tx, { entidad: 'ingreso', entidadId: id, accion: s.accion, proyectoId: s.proyectoId, contactoId: s.contactoId, motivo: s.motivo })
}

/**
 * Sets every Ingreso imported from a Factura cancelada to cancelado, paid or not: imported history is
 * exempt from the lifecycle guards (ADR-0002). An Ingreso with a Reembolso is left alone, since
 * cancelling it would orphan money already given back. Costos are never touched: an earlier run's
 * Costo from a received CFDI stays as it is.
 */
export function cancelarFacturas(db: Db, canceladas: Map<string, MotivoCancelada>) {
  const cancelados: CambioFactura[] = []
  const intactos: CambioFactura[] = []
  db.transaction((tx) => {
    for (const [uuid, por] of canceladas) {
      const motivo = por === 'carpeta' ? 'cancelada' : 'sustituida'
      const vivos = and(eq(ingresos.cfdiUuid, uuid), ne(ingresos.estado, 'cancelado'))
      for (const fila of tx.select().from(ingresos).where(vivos).all()) {
        if (tieneReembolso(tx, fila.id)) {
          intactos.push(detalle(fila, 'reembolso'))
          continue
        }
        tx.update(ingresos).set({ estado: 'cancelado' }).where(eq(ingresos.id, fila.id)).run()
        cancelados.push(detalle(fila, motivo))
      }
    }
  })
  return { cancelados, intactos }
}

/** An emitida is an invoice Ingreso, facturado, or one Parcialidad of it: paid on the day its `parte` says. */
function registrarIngreso(tx: Tx, cfdi: Cfdi, parte: Parte, contactoId: number | undefined): number {
  return tx
    .insert(ingresos)
    .values({
      categoria: 'factura',
      estado: parte.estado,
      estadoFacturacion: 'facturado',
      ...parte.montos,
      contactoId: contactoId ?? null,
      fechaRegistro: cfdi.fecha,
      fechaPago: parte.fechaPago,
      cfdiUuid: cfdi.uuid,
      cfdiParcialidad: parte.parcialidad,
      notas: cfdi.descripcion
    })
    .returning({ id: ingresos.id })
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
