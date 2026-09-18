import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { eq, max } from 'drizzle-orm'
import type { Db } from './db'
import { borrar, cancelar } from './db/cancelacion'
import { contactos, costos, cotizaciones, definicionesIngreso, ingresos, proyectos } from './db/schema'
import { plantillaCotizacion } from './plantilla-cotizacion'
import {
  CATEGORIAS,
  FACTURACIONES,
  type Categoria,
  type CotizacionNueva,
  type FichaCotizacion,
  type ListaCotizaciones,
  type PartidaCotizacion
} from '../shared/ipc'

/** Prints a page of HTML to PDF bytes; in the app, Electron's `printToPDF`. */
export type ImprimirPdf = (html: string) => Promise<Uint8Array>

const TASA_IVA = 0.16

const folioDe = (c: { folio: number | null; folioSufijo: string }) => (c.folio === null ? null : `${c.folio}${c.folioSufijo}`)

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
    proyectoId: proyecto?.id ?? null
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
  if (c.costosEstimados.some((e) => !e.concepto.trim() || !esMonto(e.monto))) throw new Error('Cada costo estimado necesita concepto y monto')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(c.fecha)) throw new Error('Fecha inválida')

  const subtotal = Math.round(c.partidas.reduce((s, p) => s + p.cantidad * p.precio, 0))
  const iva = c.conIva ? Math.round(subtotal * TASA_IVA) : 0
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
    costosEstimados: c.costosEstimados.map((e) => ({ ...e, concepto: e.concepto.trim() }))
  }

  if (c.id === undefined) return fichaCotizacion(db, db.insert(cotizaciones).values(valores).returning({ id: cotizaciones.id }).get().id)
  if (leer(db, c.id).estado !== 'borrador') throw new Error('Solo un borrador se puede editar')
  db.update(cotizaciones).set(valores).where(eq(cotizaciones.id, c.id)).run()
  return fichaCotizacion(db, c.id)
}

/** `Cotizaciones/<year>/<YYMMDD>-DMM<folio>-<nombre>.pdf`, relative to the DMM OS root. */
export function archivoPdf({ folio, fecha, nombre }: { folio: number; fecha: string; nombre: string }): string {
  const [y, m, d] = fecha.split('-')
  const seguro = nombre.replace(/[/\\:*?"<>|]/g, '-').trim()
  return `Cotizaciones/${y}/${y.slice(2)}${m}${d}-DMM${folio}-${seguro}.pdf`
}

/**
 * Folio assignment: a draft gets the next Folio when it is sent, and its PDF is archived.
 * Nothing is written to the database until the file is on disk.
 */
export async function enviarCotizacion(db: Db, root: string, id: number, imprimir: ImprimirPdf): Promise<FichaCotizacion> {
  const c = leer(db, id)
  if (c.estado !== 'borrador') throw new Error('Solo un borrador se puede enviar')
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

/**
 * Accepting a sent quote creates its Proyecto, the pending Ingresos (por facturar, dates blank
 * until invoiced) or the monthly definition, and the estimated Costos.
 */
export function aceptarCotizacion(db: Db, id: number, hoy: string): FichaCotizacion {
  const c = leer(db, id)
  if (c.estado !== 'enviada') throw new Error('Solo una cotización enviada se puede aceptar')

  db.transaction((tx) => {
    tx.update(cotizaciones).set({ estado: 'aceptada' }).where(eq(cotizaciones.id, id)).run()
    const proyectoId = tx
      .insert(proyectos)
      .values({ nombre: c.nombre ?? `Cotización ${folioDe(c)}`, contactoId: c.contactoId, cotizacionId: id, categoria: c.categoria, fechaInicio: hoy })
      .returning({ id: proyectos.id })
      .get().id
    const vinculos = { proyectoId, cotizacionId: id, contactoId: c.contactoId }

    if (c.facturacion === 'mensual') {
      tx.insert(definicionesIngreso)
        .values({ ...vinculos, tipo: 'mensual', categoria: 'factura', subtotal: c.subtotal, iva: c.iva, total: c.total, periodoInicio: hoy.slice(0, 7) })
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
            subtotal,
            iva: ivas[i],
            total: subtotal + ivas[i],
            notas: n > 1 ? `Parcialidad ${i + 1} de ${n}` : null
          })
          .run()
      )
    }

    for (const e of c.costosEstimados) {
      tx.insert(costos)
        .values({ nombre: e.concepto, categoria: 'unico', estimado: true, subtotal: e.monto, total: e.monto, fecha: hoy, proyectoId, cotizacionId: id })
        .run()
    }
  })
  return fichaCotizacion(db, id)
}

export function rechazarCotizacion(db: Db, id: number): FichaCotizacion {
  if (leer(db, id).estado !== 'enviada') throw new Error('Solo una cotización enviada se puede rechazar')
  db.update(cotizaciones).set({ estado: 'rechazada' }).where(eq(cotizaciones.id, id)).run()
  return fichaCotizacion(db, id)
}

export function cancelarCotizacion(db: Db, id: number): FichaCotizacion {
  const estado = leer(db, id).estado
  if (estado !== 'enviada' && estado !== 'aceptada') throw new Error('Solo una cotización enviada o aceptada se puede cancelar')
  cancelar(db, 'cotizacion', id)
  return fichaCotizacion(db, id)
}

/** Borrar vs cancelar: only drafts are deleted; a sent quote exists for the Contacto. */
export function borrarCotizacion(db: Db, id: number): void {
  if (leer(db, id).estado !== 'borrador') throw new Error('Solo un borrador se puede borrar; cancélala en su lugar')
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
