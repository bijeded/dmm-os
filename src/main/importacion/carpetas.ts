import { and, eq, isNull } from 'drizzle-orm'
import { nombresDeProyecto, type NombreCotizacion } from '../cotizaciones'
import { hoy as hoyLocal } from '../../shared/fechas'
import { clave, mejorEscrito, parecidos } from '../nombres'
import type { Db } from '../db'
import { proponer } from '../sugerencias'
import { contactos, cotizaciones, proyectos, ubicacionesArchivo } from '../db/schema'

/**
 * Importing what the folders say: a Cotización per archived PDF (keyed by its Folio), a
 * Contacto per Nombre canónico, and a Proyecto per folder. Every status here is *inferred*
 * from what is on disk; anything the importer had to guess waits in Logs as a Sugerencia de
 * importación rather than being merged silently.
 */

/** Where a Proyecto's folder was found. */
export type TipoUbicacion = (typeof ubicacionesArchivo.$inferSelect)['tipo']

/** A transaction, which reads and writes exactly like the database itself. */
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]

/** What one file or folder added, summed into the run's log. */
export interface Aportes {
  contactosCreados: number
  sugerencias: number
}

export interface ResultadoContacto extends Aportes {
  contactoId: number
}

export interface ResultadoCotizacion extends Aportes {
  /** `duplicado` means that Folio was already imported and nothing changed. */
  resultado: 'importado' | 'duplicado'
  cotizacionId: number
}

export interface ResultadoCarpeta extends Aportes {
  proyectoId: number
  creado: boolean
}

/** A Cotización as its archived PDF names it, plus where the file sits. */
export interface EntradaCotizacion extends NombreCotizacion {
  /** The `Cotizaciones/<year>/` folder it was filed under, used when the name carries no date. */
  anio: number
  rutaRelativa: string
}

export interface EntradaCarpeta {
  nombre: string
  tipo: TipoUbicacion
  rutaRelativa: string
}

/**
 * A legacy Cotización naming several projects becomes one Proyecto: `elegido` if given, else
 * the first name. The names it does not become are kept in that Proyecto's notes, which is
 * the only place they survive. `nombre` is undefined when the quote names no such project.
 */
function repartirNombres(
  cotizacion: { folio: number | null; nombre: string | null },
  elegido?: string
): { nombre: string | undefined; notas: string | null } {
  const nombres = nombresDeProyecto(cotizacion.nombre ?? '')
  const nombre = elegido === undefined ? nombres[0] : nombres.find((n) => clave(n) === clave(elegido))
  const otros = nombres.filter((n) => n !== nombre)
  const notas = otros.length > 0 ? `Cotización ${cotizacion.folio} también incluye: ${otros.join(', ')}` : null
  return { nombre, notas }
}

/**
 * The Contacto behind a name written on disk. Names match through missing accents, case and
 * punctuation, and the better-written spelling becomes the stored Nombre canónico. A name
 * that is merely *close* to an existing one gets its own Contacto and a merge suggestion:
 * near-duplicates are merged only after the suggestion is accepted.
 */
export function resolverContacto(db: Tx, nombre: string): ResultadoContacto {
  const todos = db.select().from(contactos).all()
  const igual = todos.find((c) => clave(c.nombre) === clave(nombre))
  if (igual) {
    const mejor = mejorEscrito(igual.nombre, nombre)
    if (mejor !== igual.nombre) {
      db.update(contactos).set({ nombre: mejor }).where(eq(contactos.id, igual.id)).run()
    }
    return { contactoId: igual.id, contactosCreados: 0, sugerencias: 0 }
  }

  const parecido = todos.find((c) => parecidos(c.nombre, nombre))
  const creado = db.insert(contactos).values({ nombre }).returning().get()
  const sugerido =
    parecido !== undefined &&
    proponer(db, {
      entidad: 'contacto',
      entidadId: creado.id,
      accion: 'fusionar',
      contactoId: parecido.id,
      motivo: `nombre parecido a "${parecido.nombre}"`
    })
  return { contactoId: creado.id, contactosCreados: 1, sugerencias: sugerido ? 1 : 0 }
}

/**
 * One archived PDF as a Cotización, keyed by its Folio (and the letter that tells two quotes
 * sharing a Folio apart). A PDF exists, so the quote was at least sent: that is the weakest
 * status its Folio allows. Re-importing the same Folio changes nothing.
 */
export function importarCotizacion(db: Db, entrada: EntradaCotizacion): ResultadoCotizacion {
  return db.transaction((tx) => {
  const sufijo = entrada.sufijo ?? ''
  const existente = tx
    .select()
    .from(cotizaciones)
    .where(and(eq(cotizaciones.folio, entrada.folio), eq(cotizaciones.folioSufijo, sufijo)))
    .get()
  if (existente) {
    return { resultado: 'duplicado', cotizacionId: existente.id, contactosCreados: 0, sugerencias: 0 }
  }

  // The old filenames carry no date; the year the file is filed under is all the disk knows.
  const fecha = entrada.fecha ?? `${entrada.anio}-01-01`
  const { contactoId, ...aportes } = resolverContacto(tx, nombresDeProyecto(entrada.nombre)[0] ?? entrada.nombre)
  const cotizacion = tx
    .insert(cotizaciones)
    .values({
      folio: entrada.folio,
      folioSufijo: sufijo,
      contactoId,
      categoria: 'other',
      estado: 'enviada',
      fecha,
      pdfRutaRelativa: entrada.rutaRelativa,
      nombre: entrada.nombre
    })
    .returning()
    .get()
  return { resultado: 'importado', cotizacionId: cotizacion.id, ...aportes }
  })
}

/**
 * One folder as a Proyecto. A folder still in `Proyectos/` is En curso; one that has left for
 * `Archivo/` or the external HDD is a finished Proyecto. The same Proyecto may be found in
 * several places, and each is recorded as its own location.
 */
export function importarCarpetaProyecto(db: Db, entrada: EntradaCarpeta, hoy = hoyLocal()): ResultadoCarpeta {
  return db.transaction((tx) => {
    // A folder the app scaffolded (or already knows) is its Proyecto's, whatever its name says.
    const conocida = tx
      .select()
      .from(ubicacionesArchivo)
      .where(and(eq(ubicacionesArchivo.tipo, entrada.tipo), eq(ubicacionesArchivo.rutaRelativa, entrada.rutaRelativa)))
      .get()
    if (conocida) {
      tx.update(ubicacionesArchivo)
        .set({ disponible: true, verificadoEn: hoy })
        .where(eq(ubicacionesArchivo.id, conocida.id))
        .run()
      return { proyectoId: conocida.proyectoId, creado: false, contactosCreados: 0, sugerencias: 0 }
    }

    const { contactoId, ...aportes } = resolverContacto(tx, entrada.nombre)
    // Matched by Nombre canónico, so the same Proyecto foldered `Sonrieme` in one root and
    // `Sonríeme` in another is one Proyecto with two locations, not two Proyectos.
    const existente = tx
      .select()
      .from(proyectos)
      .where(eq(proyectos.contactoId, contactoId))
      .all()
      .find((p) => clave(p.nombre) === clave(entrada.nombre))

    const proyecto =
      existente ??
      tx
        .insert(proyectos)
        .values({
          nombre: entrada.nombre,
          contactoId,
          categoria: 'other',
          estado: entrada.tipo === 'proyectos' ? 'en_curso' : 'completado'
        })
        .returning()
        .get()

    tx.insert(ubicacionesArchivo)
      .values({
        proyectoId: proyecto.id,
        tipo: entrada.tipo,
        rutaRelativa: entrada.rutaRelativa,
        disponible: true,
        verificadoEn: hoy
      })
      .onConflictDoUpdate({
        target: [ubicacionesArchivo.proyectoId, ubicacionesArchivo.tipo],
        set: { rutaRelativa: entrada.rutaRelativa, disponible: true }
      })
      .run()

    const vinculada = !existente && vincularCotizacion(tx, proyecto.id, contactoId, entrada.nombre)
    return {
      proyectoId: proyecto.id,
      creado: !existente,
      contactosCreados: aportes.contactosCreados,
      sugerencias: aportes.sugerencias + (vinculada ? 1 : 0)
    }
  })
}

/**
 * A folder delivering a quote of the same name means that quote was accepted. The oldest
 * unlinked match is taken. The inference *is* written — that is what "inferred status" means
 * here — and a Sugerencia records that it was inferred, so rejecting it can undo the link.
 */
function vincularCotizacion(db: Tx, proyectoId: number, contactoId: number, nombre: string): boolean {
  const candidata = db
    .select()
    .from(cotizaciones)
    .leftJoin(proyectos, eq(proyectos.cotizacionId, cotizaciones.id))
    .where(and(eq(cotizaciones.contactoId, contactoId), isNull(proyectos.id)))
    .orderBy(cotizaciones.folio)
    .all()
    .map((r) => r.cotizaciones)
    .find((c) => repartirNombres(c, nombre).nombre !== undefined)
  if (!candidata) return false

  const notasAntes = db.select().from(proyectos).where(eq(proyectos.id, proyectoId)).get()?.notas ?? null
  const notasEscritas = repartirNombres(candidata, nombre).notas
  db.update(cotizaciones).set({ estado: 'aceptada' }).where(eq(cotizaciones.id, candidata.id)).run()
  db.update(proyectos)
    .set({
      cotizacionId: candidata.id,
      notas: notasEscritas
    })
    .where(eq(proyectos.id, proyectoId))
    .run()
  return proponer(db, {
    entidad: 'cotizacion',
    entidadId: candidata.id,
    accion: 'vincular',
    proyectoId,
    motivo: `carpeta "${nombre}" con el mismo nombre`,
    deshacer: {
      cotizacion: { estado: candidata.estado },
      proyecto: { notasAntes, notasEscritas }
    }
  })
}

/**
 * An accepted Cotización with no folder anywhere was still delivered: it becomes a completed
 * Proyecto whose files are somewhere the app cannot see. Whether that is Archivado or No
 * disponible is the one thing the disk cannot say, so it is asked once.
 */
export function proyectosDeCotizacionesAceptadas(db: Db): { proyectos: number; sugerencias: number } {
  const huerfanas = db
    .select()
    .from(cotizaciones)
    .leftJoin(proyectos, eq(proyectos.cotizacionId, cotizaciones.id))
    .where(and(eq(cotizaciones.estado, 'aceptada'), isNull(proyectos.id)))
    .all()
    .map((r) => r.cotizaciones)

  let sugerencias = 0
  for (const c of huerfanas) {
    db.transaction((tx) => {
    const { nombre, notas } = repartirNombres(c)
    const proyecto = tx
      .insert(proyectos)
      .values({
        nombre: nombre ?? `Cotización ${c.folio}`,
        contactoId: c.contactoId,
        cotizacionId: c.id,
        categoria: c.categoria,
        estado: 'completado',
        notas
      })
      .returning()
      .get()
    const sugerido = proponer(tx, {
      entidad: 'proyecto',
      entidadId: proyecto.id,
      accion: 'ubicacion',
      motivo: `cotización ${c.folio} aceptada sin carpeta: ¿archivado o no disponible?`
    })
    if (sugerido) sugerencias++
    })
  }
  return { proyectos: huerfanas.length, sugerencias }
}

/**
 * The external HDD is a secondary source, usually disconnected. Its Proyectos stay in the
 * database when it is absent; their location is simply No disponible until it is back.
 */
export function marcarHddNoDisponible(db: Db): number {
  return db
    .update(ubicacionesArchivo)
    .set({ disponible: false })
    .where(eq(ubicacionesArchivo.tipo, 'hdd_externo'))
    .run().changes
}
