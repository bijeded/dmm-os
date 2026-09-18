import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { and, eq, max } from 'drizzle-orm'
import type { Db } from './db'
import { borrar, cancelar } from './db/cancelacion'
import { contactos, costos, cotizaciones, definicionesCosto, definicionesIngreso, ingresos, proyectos, vigenciasPrecio } from './db/schema'
import { plantillaCotizacion } from './plantilla-cotizacion'
import { CATEGORIAS, CATEGORIAS_COSTO, FACTURACIONES, type AccionCotizacion, type Categoria, type CotizacionNueva, type EstadoCotizacion, type FichaCotizacion, type ListaCotizaciones, type PartidaCotizacion } from '../shared/dominio'
import { folioDmm, totalesCotizacion } from '../shared/formato'
import { sumarDias } from '../shared/fechas'

/** Prints a page of HTML to PDF bytes; in the app, Electron's `printToPDF`. */
export type ImprimirPdf = (html: string) => Promise<Uint8Array>

/** Which estados allow each action. The guards below and the ficha's `acciones` both read this. */
const PERMITIDA_EN: Record<AccionCotizacion, readonly EstadoCotizacion[]> = {
  editar: ['borrador'],
  borrar: ['borrador'],
  enviar: ['borrador'],
  aceptar: ['enviada'],
  rechazar: ['enviada'],
  cancelar: ['enviada', 'aceptada']
}

const accionesEn = (estado: EstadoCotizacion) =>
  (Object.keys(PERMITIDA_EN) as AccionCotizacion[]).filter((a) => PERMITIDA_EN[a].includes(estado))

function exigir(accion: AccionCotizacion, estado: EstadoCotizacion, mensaje: string) {
  if (!PERMITIDA_EN[accion].includes(estado)) throw new Error(mensaje)
}

export const folioDe = (c: { folio: number | null; folioSufijo: string }) => (c.folio === null ? null : `${c.folio}${c.folioSufijo}`)

function leer(db: Db, id: number) {
  const c = db.select().from(cotizaciones).where(eq(cotizaciones.id, id)).get()
  if (!c) throw new Error(`La cotización ${id} no existe`)
  return c
}

export function fichaCotizacion(db: Db, id: number): FichaCotizacion {
  const c = leer(db, id)
  const contacto = db.select({ nombre: contactos.nombre }).from(contactos).where(eq(contactos.id, c.contactoId)).get()
  const proyecto = db.select({ id: proyectos.id }).from(proyectos).where(eq(proyectos.cotizacionId, id)).get()
  return {
    id: c.id,
    folio: folioDe(c),
    estado: c.estado,
    contactoId: c.contactoId,
    contacto: contacto?.nombre ?? '',
    nombre: c.nombre ?? '',
    categoria: c.categoria,
    fecha: c.fecha,
    validezDias: c.validezDias,
    moneda: c.moneda,
    partidas: c.items as PartidaCotizacion[],
    conIva: c.iva > 0,
    facturacion: c.facturacion,
    parcialidades: c.parcialidades,
    stack: c.stack,
    terminos: c.terminos,
    notas: c.notas,
    costosEstimados: c.costosEstimados,
    subtotal: c.subtotal,
    iva: c.iva,
    total: c.total,
    pdf: c.pdfRutaRelativa,
    proyectoId: proyecto?.id ?? null,
    acciones: accionesEn(c.estado)
  }
}

const esMonto = (n: number) => Number.isInteger(n) && n >= 0

/** Saves a draft, new or edited. A sent quote is a document the Contacto has; it is never edited. */
export function guardarCotizacion(db: Db, c: CotizacionNueva): FichaCotizacion {
  const nombre = c.nombre.trim()
  if (!nombre) throw new Error('La cotización necesita nombre')
  if (c.partidas.length === 0) throw new Error('Agrega al menos un concepto')
  if (c.partidas.some((p) => !p.concepto.trim() || !esMonto(p.precio) || !(p.cantidad > 0))) throw new Error('Cada concepto necesita nombre, cantidad y precio')
  if (!CATEGORIAS.includes(c.categoria)) throw new Error('Categoría desconocida')
  if (!FACTURACIONES.includes(c.facturacion)) throw new Error('Facturación desconocida')
  if (c.facturacion === 'parcialidades' && !(Number.isInteger(c.parcialidades) && c.parcialidades! >= 2)) throw new Error('Indica al menos 2 parcialidades')
  if (c.costosEstimados.some((e) => !e.concepto.trim() || !esMonto(e.monto) || !CATEGORIAS_COSTO.includes(e.categoria)))
    throw new Error('Cada costo estimado necesita concepto, monto y tipo')
  if (c.costosEstimados.some((e) => e.categoria === 'msi' && !(Number.isInteger(e.parcialidades) && e.parcialidades! >= 2)))
    throw new Error('Un costo a MSI necesita al menos 2 mensualidades')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(c.fecha)) throw new Error('Fecha inválida')

  const { subtotal, iva } = totalesCotizacion(c.partidas, c.conIva)
  const valores = {
    contactoId: c.contactoId,
    nombre,
    categoria: c.categoria,
    fecha: c.fecha,
    validezDias: c.validezDias,
    moneda: c.moneda,
    items: c.partidas.map((p) => ({ ...p, concepto: p.concepto.trim() })),
    subtotal,
    iva,
    total: subtotal + iva,
    facturacion: c.facturacion,
    parcialidades: c.facturacion === 'parcialidades' ? c.parcialidades : null,
    stack: c.stack?.trim() || null,
    terminos: c.terminos?.trim() || null,
    notas: c.notas?.trim() || null,
    costosEstimados: c.costosEstimados.map((e) => ({ ...e, concepto: e.concepto.trim(), parcialidades: e.categoria === 'msi' ? e.parcialidades : null }))
  }

  if (c.id === undefined) return fichaCotizacion(db, db.insert(cotizaciones).values(valores).returning({ id: cotizaciones.id }).get().id)
  exigir('editar', leer(db, c.id).estado, 'Solo un borrador se puede editar')
  db.update(cotizaciones).set(valores).where(eq(cotizaciones.id, c.id)).run()
  return fichaCotizacion(db, c.id)
}

/** `Cotizaciones/<year>/<YYMMDD>-DMM<folio>-<nombre>.pdf`, relative to the DMM OS root. */
export function archivoPdf({ folio, fecha, nombre }: { folio: number; fecha: string; nombre: string }): string {
  const [y, m, d] = fecha.split('-')
  const seguro = nombre.replace(/[/\\:*?"<>|]/g, '-').trim()
  return `Cotizaciones/${y}/${y.slice(2)}${m}${d}-${folioDmm(folio)}-${seguro}.pdf`
}

/**
 * Folio assignment: a draft gets the next Folio when it is sent, and its PDF is archived.
 * Nothing is written to the database until the file is on disk.
 */
export async function enviarCotizacion(db: Db, root: string, id: number, imprimir: ImprimirPdf): Promise<FichaCotizacion> {
  const c = leer(db, id)
  exigir('enviar', c.estado, 'Solo un borrador se puede enviar')
  const folio = (db.select({ n: max(cotizaciones.folio) }).from(cotizaciones).get()?.n ?? 0) + 1
  const ficha = { ...fichaCotizacion(db, id), folio: String(folio) }

  const pdf = archivoPdf({ folio, fecha: c.fecha, nombre: ficha.nombre })
  const bytes = await imprimir(plantillaCotizacion(ficha))
  const destino = join(root, pdf)
  mkdirSync(dirname(destino), { recursive: true })
  writeFileSync(destino, bytes)

  db.update(cotizaciones).set({ estado: 'enviada', folio, folioSufijo: '', pdfRutaRelativa: pdf }).where(eq(cotizaciones.id, id)).run()
  return fichaCotizacion(db, id)
}

/** Splits `total` into `n` parts that add up to it, the remainder going to the first. */
const repartir = (total: number, n: number) => {
  const parte = Math.floor(total / n)
  return Array.from({ length: n }, (_, i) => (i === 0 ? total - parte * (n - 1) : parte))
}

/** The last day a quote can be accepted: its date plus its validity. */
export function venceEl(fecha: string, validezDias: number): string {
  return sumarDias(fecha, validezDias)
}

/** A sent quote nobody answered within its validity becomes expirada. Safe to run at any time. */
export function expirarCotizaciones(db: Db, hoy: string): void {
  for (const c of db.select().from(cotizaciones).where(eq(cotizaciones.estado, 'enviada')).all()) {
    if (venceEl(c.fecha, c.validezDias) < hoy) {
      db.update(cotizaciones).set({ estado: 'expirada' }).where(and(eq(cotizaciones.id, c.id), eq(cotizaciones.estado, 'enviada'))).run()
    }
  }
}

/**
 * Accepting a sent quote creates its Proyecto, the pending Ingresos (por facturar, dates blank
 * until invoiced) or the monthly definition, and the estimated Costos: one-time ones as a Costo,
 * recurring ones as a definition that generates its periods. Money is always recorded in MXN;
 * a USD quote is converted at `tipoCambio` and keeps its USD amount as the original.
 */
export function aceptarCotizacion(db: Db, id: number, hoy: string, tipoCambio?: number): FichaCotizacion {
  const c = leer(db, id)
  exigir('aceptar', c.estado, 'Solo una cotización enviada se puede aceptar')
  const usd = c.moneda === 'USD'
  if (usd && !(tipoCambio !== undefined && tipoCambio > 0)) throw new Error('Indica el tipo de cambio de la cotización en USD')
  const mxn = (n: number) => (usd ? Math.round(n * tipoCambio!) : n)
  /** Subtotal and IVA converted to MXN, their total, and the original amount when it was USD. */
  const montos = (subtotal: number, iva: number) => ({
    subtotal: mxn(subtotal),
    iva: mxn(iva),
    total: mxn(subtotal) + mxn(iva),
    montoOriginal: usd ? subtotal + iva : null,
    monedaOriginal: usd ? ('USD' as const) : null
  })
  const periodo = hoy.slice(0, 7)

  db.transaction((tx) => {
    tx.update(cotizaciones).set({ estado: 'aceptada', tipoCambio: usd ? tipoCambio : null }).where(eq(cotizaciones.id, id)).run()
    const proyectoId = tx
      .insert(proyectos)
      .values({ nombre: c.nombre ?? `Cotización ${folioDe(c)}`, contactoId: c.contactoId, cotizacionId: id, categoria: c.categoria, fechaInicio: hoy })
      .returning({ id: proyectos.id })
      .get().id
    const vinculos = { proyectoId, cotizacionId: id, contactoId: c.contactoId }

    if (c.facturacion === 'mensual') {
      tx.insert(definicionesIngreso)
        .values({ ...vinculos, ...montos(c.subtotal, c.iva), tipo: 'mensual', categoria: 'factura', periodoInicio: periodo })
        .run()
    } else {
      const n = c.facturacion === 'parcialidades' ? (c.parcialidades ?? 1) : 1
      const subtotales = repartir(c.subtotal, n)
      const ivas = repartir(c.iva, n)
      subtotales.forEach((subtotal, i) =>
        tx
          .insert(ingresos)
          .values({
            ...vinculos,
            categoria: 'factura',
            estadoFacturacion: 'por_facturar',
            ...montos(subtotal, ivas[i]),
            notas: n > 1 ? `Parcialidad ${i + 1} de ${n}` : null
          })
          .run()
      )
    }

    for (const e of c.costosEstimados) {
      // Quotes saved before costs had a type were all one-time.
      const categoria = e.categoria ?? 'unico'
      if (categoria === 'unico') {
        tx.insert(costos)
          .values({ ...montos(e.monto, 0), nombre: e.concepto, categoria, estimado: true, fecha: hoy, proyectoId, cotizacionId: id })
          .run()
        continue
      }
      const definicionCostoId = tx
        .insert(definicionesCosto)
        .values({
          nombre: e.concepto,
          tipo: categoria,
          proyectoId,
          cotizacionId: id,
          diaDelMes: Number(hoy.slice(8, 10)),
          periodoInicio: periodo,
          numeroParcialidades: categoria === 'msi' ? e.parcialidades : null
        })
        .returning({ id: definicionesCosto.id })
        .get().id
      tx.insert(vigenciasPrecio).values({ ...montos(e.monto, 0), definicionCostoId, desde: periodo }).run()
    }
  })
  return fichaCotizacion(db, id)
}

export function rechazarCotizacion(db: Db, id: number): FichaCotizacion {
  exigir('rechazar', leer(db, id).estado, 'Solo una cotización enviada se puede rechazar')
  db.update(cotizaciones).set({ estado: 'rechazada' }).where(eq(cotizaciones.id, id)).run()
  return fichaCotizacion(db, id)
}

export function cancelarCotizacion(db: Db, id: number): FichaCotizacion {
  exigir('cancelar', leer(db, id).estado, 'Solo una cotización enviada o aceptada se puede cancelar')
  cancelar(db, 'cotizacion', id)
  return fichaCotizacion(db, id)
}

/** Borrar vs cancelar: only drafts are deleted; a sent quote exists for the Contacto. */
export function borrarCotizacion(db: Db, id: number): void {
  exigir('borrar', leer(db, id).estado, 'Solo un borrador se puede borrar; cancélala en su lugar')
  borrar(db, 'cotizacion', id)
}

export function listarCotizaciones(db: Db): ListaCotizaciones {
  const filas = db
    .select({
      id: cotizaciones.id,
      folio: cotizaciones.folio,
      folioSufijo: cotizaciones.folioSufijo,
      fecha: cotizaciones.fecha,
      contactoId: cotizaciones.contactoId,
      contacto: contactos.nombre,
      nombre: cotizaciones.nombre,
      categoria: cotizaciones.categoria,
      subtotal: cotizaciones.subtotal,
      estado: cotizaciones.estado,
      pdf: cotizaciones.pdfRutaRelativa
    })
    .from(cotizaciones)
    .innerJoin(contactos, eq(contactos.id, cotizaciones.contactoId))
    .all()
    .sort((a, b) => (a.folio ?? Infinity) - (b.folio ?? Infinity) || a.folioSufijo.localeCompare(b.folioSufijo) || a.id - b.id)
    .reverse()
    .map(({ folioSufijo, pdf, ...f }) => ({ ...f, folio: folioDe({ folio: f.folio, folioSufijo }), pdf: pdf !== null }))

  const hechas = filas.filter((f) => f.estado !== 'borrador')
  const enviadas = hechas.filter((f) => f.estado === 'enviada')
  const porCategoria = Object.fromEntries(CATEGORIAS.map((c) => [c, 0])) as Record<Categoria, number>
  for (const f of hechas) porCategoria[f.categoria]++
  const suma = (fs: typeof filas) => fs.reduce((s, f) => s + f.subtotal, 0)

  return {
    cotizaciones: filas,
    resumen: {
      total: hechas.length,
      enviadas: enviadas.length,
      conversion: hechas.length ? Math.round((hechas.filter((f) => f.estado === 'aceptada').length / hechas.length) * 100) : 0,
      montoAbiertas: suma(enviadas),
      promedio: hechas.length ? Math.round(suma(hechas) / hechas.length) : 0
    },
    porCategoria
  }
}
