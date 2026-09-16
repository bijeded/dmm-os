import { and, eq, isNull, sql } from 'drizzle-orm'
import { nombresDeProyecto, type NombreCotizacion } from '../cotizaciones'
import { clave, mejorEscrito, parecidos } from '../nombres'
import type { Db } from './index'
import { contactos, cotizaciones, proyectos, sugerenciasImportacion, ubicacionesArchivo } from './schema'

/**
 * Importing what the folders say: a Cotización per archived PDF (keyed by its Folio), a
 * Contacto per Nombre canónico, and a Proyecto per folder. Every status here is *inferred*
 * from what is on disk; anything the importer had to guess waits in Logs as a Sugerencia de
 * importación rather than being merged silently.
 */

/** Where a Proyecto's folder was found. */
export type TipoUbicacion = (typeof ubicacionesArchivo.$inferSelect)['tipo']

export interface ResultadoContacto {
  contactoId: number
  creado: boolean
  /** The Contacto this one may be a misspelling of, left for the user to confirm. */
  fusionarCon: number | null
}

export interface ResultadoCotizacion {
  /** `duplicado` means that Folio was already imported and nothing changed. */
  resultado: 'importado' | 'duplicado'
  cotizacionId: number
  contactoId: number
}

export interface ResultadoCarpeta {
  proyectoId: number
  creado: boolean
  /** The Cotización this folder was taken to be the delivery of. */
  cotizacionId: number | null
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

/** A guess is recorded once; running the importer again asks nothing twice. */
function sugerir(
  db: Db,
  s: {
    entidad: (typeof sugerenciasImportacion.$inferInsert)['entidad']
    entidadId: number
    accion: (typeof sugerenciasImportacion.$inferInsert)['accion']
    proyectoId?: number | null
    contactoId?: number | null
    motivo: string
  }
): void {
  db.insert(sugerenciasImportacion).values(s).onConflictDoNothing().run()
}

/**
 * The Contacto behind a name written on disk. Names match through missing accents, case and
 * punctuation, and the better-written spelling becomes the stored Nombre canónico. A name
 * that is merely *close* to an existing one gets its own Contacto and a merge suggestion:
 * near-duplicates are merged only after the suggestion is accepted.
 */
export function resolverContacto(db: Db, nombre: string): ResultadoContacto {
  const todos = db.select().from(contactos).all()
  const igual = todos.find((c) => clave(c.nombre) === clave(nombre))
  if (igual) {
    const mejor = mejorEscrito(igual.nombre, nombre)
    if (mejor !== igual.nombre) {
      db.update(contactos).set({ nombre: mejor }).where(eq(contactos.id, igual.id)).run()
    }
    return { contactoId: igual.id, creado: false, fusionarCon: null }
  }

  const parecido = todos.find((c) => parecidos(c.nombre, nombre))
  const creado = db.insert(contactos).values({ nombre }).returning().get()
  if (parecido) {
    sugerir(db, {
      entidad: 'contacto',
      entidadId: creado.id,
      accion: 'fusionar',
      contactoId: parecido.id,
      motivo: `nombre parecido a "${parecido.nombre}"`
    })
  }
  return { contactoId: creado.id, creado: true, fusionarCon: parecido?.id ?? null }
}

/**
 * One archived PDF as a Cotización, keyed by its Folio (and the letter that tells two quotes
 * sharing a Folio apart). A PDF exists, so the quote was at least sent: that is the weakest
 * status its Folio allows. Re-importing the same Folio changes nothing.
 */
export function importarCotizacion(db: Db, entrada: EntradaCotizacion): ResultadoCotizacion {
  const sufijo = entrada.sufijo ?? ''
  const existente = db
    .select()
    .from(cotizaciones)
    .where(and(eq(cotizaciones.folio, entrada.folio), eq(cotizaciones.folioSufijo, sufijo)))
    .get()
  if (existente) {
    return { resultado: 'duplicado', cotizacionId: existente.id, contactoId: existente.contactoId }
  }

  // The old filenames carry no date; the year the file is filed under is all the disk knows.
  const fecha = entrada.fecha ?? `${entrada.anio}-01-01`
  const { contactoId } = resolverContacto(db, nombresDeProyecto(entrada.nombre)[0] ?? entrada.nombre)
  const cotizacion = db
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
  return { resultado: 'importado', cotizacionId: cotizacion.id, contactoId }
}

/**
 * One folder as a Proyecto. A folder still in `Proyectos/` is En curso; one that has left for
 * `Archivo/` or the external HDD is a finished Proyecto. The same Proyecto may be found in
 * several places, and each is recorded as its own location.
 */
export function importarCarpetaProyecto(db: Db, entrada: EntradaCarpeta): ResultadoCarpeta {
  const { contactoId } = resolverContacto(db, entrada.nombre)
  const existente = db
    .select()
    .from(proyectos)
    .where(and(eq(proyectos.contactoId, contactoId), sql`${proyectos.nombre} = ${entrada.nombre}`))
    .get()

  const proyecto =
    existente ??
    db
      .insert(proyectos)
      .values({
        nombre: entrada.nombre,
        contactoId,
        categoria: 'other',
        estado: entrada.tipo === 'proyectos' ? 'en_curso' : 'completado'
      })
      .returning()
      .get()

  db.insert(ubicacionesArchivo)
    .values({
      proyectoId: proyecto.id,
      tipo: entrada.tipo,
      rutaRelativa: entrada.rutaRelativa,
      disponible: true,
      verificadoEn: new Date().toISOString().slice(0, 10)
    })
    .onConflictDoUpdate({
      target: [ubicacionesArchivo.proyectoId, ubicacionesArchivo.tipo],
      set: { rutaRelativa: entrada.rutaRelativa, disponible: true }
    })
    .run()

  const cotizacionId = existente ? proyecto.cotizacionId : vincularCotizacion(db, proyecto.id, contactoId, entrada.nombre)
  return { proyectoId: proyecto.id, creado: !existente, cotizacionId }
}

/**
 * A folder delivering a quote of the same name means that quote was accepted. The oldest
 * unlinked match is taken, and the inference waits in Logs: it is a guess, not a record.
 */
function vincularCotizacion(db: Db, proyectoId: number, contactoId: number, nombre: string): number | null {
  const candidata = db
    .select()
    .from(cotizaciones)
    .leftJoin(proyectos, eq(proyectos.cotizacionId, cotizaciones.id))
    .where(and(eq(cotizaciones.contactoId, contactoId), isNull(proyectos.id)))
    .orderBy(cotizaciones.folio)
    .all()
    .map((r) => r.cotizaciones)
    .find((c) => nombresDeProyecto(c.nombre ?? '').some((n) => clave(n) === clave(nombre)))
  if (!candidata) return null

  const otros = nombresDeProyecto(candidata.nombre ?? '').filter((n) => clave(n) !== clave(nombre))
  db.update(cotizaciones).set({ estado: 'aceptada' }).where(eq(cotizaciones.id, candidata.id)).run()
  db.update(proyectos)
    .set({
      cotizacionId: candidata.id,
      // A legacy quote listing several projects becomes one Proyecto; the rest are kept as notes.
      notas: otros.length > 0 ? `Cotización ${candidata.folio} también incluye: ${otros.join(', ')}` : null
    })
    .where(eq(proyectos.id, proyectoId))
    .run()
  sugerir(db, {
    entidad: 'cotizacion',
    entidadId: candidata.id,
    accion: 'vincular',
    proyectoId,
    motivo: `carpeta "${nombre}" con el mismo nombre`
  })
  return candidata.id
}

/**
 * An accepted Cotización with no folder anywhere was still delivered: it becomes a completed
 * Proyecto whose files are somewhere the app cannot see. Whether that is Archivado or No
 * disponible is the one thing the disk cannot say, so it is asked once.
 */
export function proyectosDeCotizacionesAceptadas(db: Db): number[] {
  const huerfanas = db
    .select()
    .from(cotizaciones)
    .leftJoin(proyectos, eq(proyectos.cotizacionId, cotizaciones.id))
    .where(and(eq(cotizaciones.estado, 'aceptada'), isNull(proyectos.id)))
    .all()
    .map((r) => r.cotizaciones)

  return huerfanas.map((c) => {
    const nombres = nombresDeProyecto(c.nombre ?? '')
    const otros = nombres.slice(1)
    const proyecto = db
      .insert(proyectos)
      .values({
        nombre: nombres[0] ?? `Cotización ${c.folio}`,
        contactoId: c.contactoId,
        cotizacionId: c.id,
        categoria: c.categoria,
        estado: 'completado',
        notas: otros.length > 0 ? `Cotización ${c.folio} también incluye: ${otros.join(', ')}` : null
      })
      .returning()
      .get()
    sugerir(db, {
      entidad: 'proyecto',
      entidadId: proyecto.id,
      accion: 'ubicacion',
      motivo: `cotización ${c.folio} aceptada sin carpeta: ¿archivado o no disponible?`
    })
    return proyecto.id
  })
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
