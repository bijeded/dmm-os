import { posix } from 'node:path'
import { and, eq, isNull, type SQL } from 'drizzle-orm'
import { leerNombreArchivo, nombresDeProyecto, type NombreCotizacion } from '../cotizaciones'
import { hoy as hoyLocal } from '../../shared/fechas'
import { clave, mejorEscrito, parecidos } from '../nombres'
import type { Db } from '../db'
import { heredarDeCotizacion } from '../ciclo-proyecto'
import { proponer } from '../sugerencias'
import { contactos, cotizaciones, proyectos, ubicacionesArchivo } from '../db/schema'
import { mapaVacio, type Mapa } from './mapa'
import { partidasDelMonto, partidasGuardadas, type CotizacionDePdf } from './pdf-cotizacion'

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
  /** Ids, so the log can name them once the run has settled every spelling. */
  contactosCreados: number[]
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
  /** Created with no Contacto: nothing on disk said whose it is. */
  sinContacto: boolean
  /** The Contactos whose Cotizaciones all name the folder's project, when more than one does. */
  ambiguos: string[]
}

/** A Cotización as its archived PDF names it, plus where the file sits and what the PDF says. */
export interface EntradaCotizacion extends NombreCotizacion {
  /** The `Cotizaciones/<year>/` folder it was filed under, used when the name carries no date. */
  anio: number
  rutaRelativa: string
  /** What a legacy quote's PDF says; `null` when it could not be read, absent when it was not. */
  pdf?: CotizacionDePdf | null
}

export interface EntradaCarpeta {
  /** The folder's name, or `<carpeta>/<subcarpeta>` for a subfolder the map declares a Proyecto. */
  nombre: string
  tipo: TipoUbicacion
  rutaRelativa: string
}

/**
 * A legacy Cotización naming several projects becomes one Proyecto: `elegido` if given, else
 * the first name. The names it does not become are kept in that Proyecto's notes, which is
 * the only place they survive. `nombre` is undefined when the quote names no such project.
 * A name that is `elegido` whole (a PDF's “Diseño y desarrollo”) is one project, not split.
 */
function repartirNombres(
  cotizacion: { folio: number | null; nombre: string | null },
  elegido?: string
): { nombre: string | undefined; notas: string | null } {
  if (elegido !== undefined && cotizacion.nombre !== null && clave(cotizacion.nombre) === clave(elegido)) {
    return { nombre: cotizacion.nombre, notas: null }
  }
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
 *
 * `canonico` is for a name the user wrote in the Mapa de nombres: its spelling is the Nombre
 * canónico as given, and it is never flagged as a near-duplicate.
 */
export function resolverContacto(db: Tx, nombre: string, { canonico = false } = {}): ResultadoContacto {
  const todos = db.select().from(contactos).all()
  const igual = todos.find((c) => clave(c.nombre) === clave(nombre))
  if (igual) {
    const mejor = canonico ? nombre : mejorEscrito(igual.nombre, nombre)
    if (mejor !== igual.nombre) {
      db.update(contactos).set({ nombre: mejor }).where(eq(contactos.id, igual.id)).run()
    }
    return { contactoId: igual.id, contactosCreados: [], sugerencias: 0 }
  }

  const parecido = canonico ? undefined : todos.find((c) => parecidos(c.nombre, nombre))
  const creado = db.insert(contactos).values({ nombre, importado: true }).returning().get()
  const sugerido =
    parecido !== undefined &&
    proponer(db, {
      entidad: 'contacto',
      entidadId: creado.id,
      accion: 'fusionar',
      contactoId: parecido.id,
      motivo: `nombre parecido a "${parecido.nombre}"`
    })
  return { contactoId: creado.id, contactosCreados: [creado.id], sugerencias: sugerido ? 1 : 0 }
}

/** Where a name was found on disk, which decides how it may be read. */
export type OrigenNombre = 'cotizacion' | 'clientes' | 'proyectos'

export interface Atribucion extends ResultadoContacto {
  /** The Proyecto the name delivers, when a map row or a `Cliente - Proyecto` name gives it. */
  proyecto: string | null
  clienteFinal: string | null
}

/** A legacy quote named `Cliente - Proyecto`, split at the first dash with a space on each side. */
function partirNombre(nombre: string): { contacto: string; proyecto: string } | null {
  const i = nombre.indexOf(' - ')
  return i === -1 ? null : { contacto: nombre.slice(0, i).trim(), proyecto: nombre.slice(i + 3).trim() }
}

/**
 * A name no row maps is still spelled as the map spells its Contacto, if the map names one
 * with that `clave`: the map is the user's word, and a better-accented folder must not undo it.
 */
function resolverSinFila(tx: Tx, mapa: Mapa, nombre: string): ResultadoContacto {
  const delMapa = mapa.filas.find((f) => clave(f.contacto) === clave(nombre))?.contacto
  return delMapa ? resolverContacto(tx, delMapa, { canonico: true }) : resolverContacto(tx, nombre)
}

function contactoDeFila(tx: Tx, mapa: Mapa, fila: Mapa['filas'][number]): ResultadoContacto {
  const r = resolverContacto(tx, fila.contacto, { canonico: true })
  mapa.anotar(fila, r.contactoId)
  return r
}

/**
 * Which Contacto, Proyecto and Cliente final a quote's name or a `Clientes/` folder means, in
 * this order: its row in the Mapa de nombres; for a legacy quote, the `Cliente - Proyecto`
 * split, with the Contacto part itself looked up in the map; otherwise the name as the disk
 * writes it. A `Proyectos/` folder goes through `atribuirCarpetaProyecto` instead.
 */
export function atribuir(tx: Tx, mapa: Mapa, nombre: string, origen: Exclude<OrigenNombre, 'proyectos'>): Atribucion {
  const fila = mapa.buscar(nombre)
  if (fila) return { ...contactoDeFila(tx, mapa, fila), proyecto: fila.proyecto, clienteFinal: fila.clienteFinal }

  const partido = origen === 'cotizacion' ? partirNombre(nombre) : null
  if (partido) {
    const filaContacto = mapa.buscar(partido.contacto)
    const r = filaContacto ? contactoDeFila(tx, mapa, filaContacto) : resolverSinFila(tx, mapa, partido.contacto)
    return { ...r, proyecto: partido.proyecto, clienteFinal: null }
  }

  // A legacy quote naming several projects is still one Contacto's: the first name says whose.
  const nombreContacto = origen === 'cotizacion' ? (nombresDeProyecto(nombre)[0] ?? nombre) : nombre
  return { ...resolverSinFila(tx, mapa, nombreContacto), proyecto: null, clienteFinal: null }
}

export interface AtribucionCarpeta extends Aportes {
  /** `null` for a Proyecto sin Contacto. */
  contactoId: number | null
  proyecto: string | null
  clienteFinal: string | null
  ambiguos: string[]
}

/**
 * Whose a `Proyectos/` folder is. Project folders are usually named after the project, not the
 * client, so a folder never creates a Contacto the map does not name. In order: its row in the
 * Mapa de nombres; a Contacto the map spells with the folder's name; an existing Contacto of
 * that name; the one Contacto whose Cotizaciones deliver a Proyecto of that name, with the
 * project as its Cliente final unless the map gives that quote one. Otherwise nobody's: a
 * Proyecto sin Contacto, with the Contactos that made it ambiguous, if any.
 */
export function atribuirCarpetaProyecto(tx: Tx, mapa: Mapa, nombre: string): AtribucionCarpeta {
  const sinProyecto = { proyecto: null, clienteFinal: null, ambiguos: [] }
  const fila = mapa.buscar(nombre)
  if (fila) return { ...contactoDeFila(tx, mapa, fila), proyecto: fila.proyecto, clienteFinal: fila.clienteFinal, ambiguos: [] }

  const delMapa = mapa.filas.some((f) => clave(f.contacto) === clave(nombre))
  const existe = tx.select().from(contactos).all().some((c) => clave(c.nombre) === clave(nombre))
  // Matched only, so `resolverContacto` finds it and at most improves its spelling.
  if (delMapa || existe) return { ...resolverSinFila(tx, mapa, nombre), ...sinProyecto }

  const quienes = tx
    .select()
    .from(cotizaciones)
    .orderBy(cotizaciones.folio)
    .all()
    .filter((c) => repartirNombres(c, nombre).nombre !== undefined)
  const contactoIds = [...new Set(quienes.map((c) => c.contactoId))]
  const nada = { contactosCreados: [], sugerencias: 0 }
  if (contactoIds.length === 1) {
    const clienteFinal = clienteFinalDeCotizacion(mapa, quienes[0]) ?? nombre
    return { contactoId: contactoIds[0], proyecto: null, clienteFinal, ambiguos: [], ...nada }
  }
  const ambiguos = tx
    .select()
    .from(contactos)
    .all()
    .filter((c) => contactoIds.includes(c.id))
    .map((c) => c.nombre)
    .sort((a, b) => a.localeCompare(b, 'es'))
  return { contactoId: null, proyecto: null, clienteFinal: null, ambiguos, ...nada }
}

/**
 * A name already imported keeps its Contacto (the map applies only on first import), but its
 * row still counts as found, and the Contacto it holds is the one an RFC on that row goes to.
 */
function anotarConocido(mapa: Mapa, nombre: string, contactoId: number, origen: OrigenNombre): void {
  const partido = origen === 'cotizacion' ? partirNombre(nombre) : null
  const fila = mapa.buscar(nombre) ?? (partido ? mapa.buscar(partido.contacto) : undefined)
  if (fila && mapa.contactoDe(fila) === undefined) mapa.anotar(fila, contactoId)
}

/**
 * A folder already imported under its own name: the Contacto of that name, and for a Proyectos
 * folder its Proyecto of that name too, or a Proyecto sin Contacto of that name. Such a folder
 * keeps what it was imported as.
 */
function importadoSinMapa(tx: Tx, nombre: string): { contactoId: number; nombre: string } | undefined
function importadoSinMapa(tx: Tx, nombre: string, conProyecto: true): { contactoId: number | null; nombre: string } | undefined
function importadoSinMapa(tx: Tx, nombre: string, conProyecto = false): { contactoId: number | null; nombre: string } | undefined {
  const contacto = tx.select().from(contactos).all().find((c) => clave(c.nombre) === clave(nombre))
  if (!conProyecto) return contacto && { contactoId: contacto.id, nombre: contacto.nombre }
  const deNombre = (dondeContacto: SQL | undefined) =>
    tx
      .select()
      .from(proyectos)
      .where(dondeContacto)
      .all()
      .find((p) => clave(p.nombre) === clave(nombre))
  const proyecto =
    (contacto && deNombre(eq(proyectos.contactoId, contacto.id))) ??
    deNombre(and(isNull(proyectos.contactoId), eq(proyectos.etiqueta, 'cliente')))
  return proyecto && { contactoId: proyecto.contactoId, nombre: proyecto.nombre }
}

/**
 * A `Clientes/` folder names a Contacto only. One already imported under its own name keeps
 * that Contacto; its map row, if added since, only counts as found.
 */
export function contactoDeCarpetaCliente(tx: Tx, mapa: Mapa, nombre: string): ResultadoContacto {
  const previo = importadoSinMapa(tx, nombre)
  if (!previo) return atribuir(tx, mapa, nombre, 'clientes')
  anotarConocido(mapa, nombre, previo.contactoId, 'clientes')
  return resolverSinFila(tx, mapa, nombre)
}

/** The Cliente final the map gives a legacy quote, found again from its PDF's name. */
function clienteFinalDeCotizacion(mapa: Mapa, c: { pdfRutaRelativa: string | null }): string | null {
  const nombre = c.pdfRutaRelativa ? leerNombreArchivo(posix.basename(c.pdfRutaRelativa))?.nombre : undefined
  return (nombre && mapa.consultar(nombre)?.clienteFinal) || null
}

/**
 * The Contacto behind a new-format quote, whose filename names the Proyecto rather than the
 * Contacto. Only a single known Proyecto of that name can say who it is; otherwise the quote
 * is refused (it lands in the run's errors) instead of minting a Contacto named after a project.
 */
function contactoDeProyecto(db: Tx, nombre: string): ResultadoContacto {
  const contactoIds = new Set(
    db
      .select()
      .from(proyectos)
      .all()
      .filter((p) => clave(p.nombre) === clave(nombre))
      .map((p) => p.contactoId)
      .filter((id): id is number => id !== null)
  )
  if (contactoIds.size !== 1) {
    throw new Error(`no se sabe de qué Contacto es el Proyecto "${nombre}"; regístralo y vuelve a escanear`)
  }
  return { contactoId: [...contactoIds][0], contactosCreados: [], sugerencias: 0 }
}

/**
 * One archived PDF as a Cotización, keyed by its Folio (and the letter that tells two quotes
 * sharing a Folio apart). A PDF exists, so the quote was at least sent: that is the weakest
 * status its Folio allows. Re-importing the same Folio changes nothing.
 *
 * A legacy quote's Contacto comes through `atribuir`. The Proyecto it delivers is, in order: its
 * map row's `proyecto`, the project its PDF names in curly quotes, the `Cliente - Proyecto`
 * split. That name is stored as the Cotización's `nombre`, which is what links it to a folder
 * and names its Proyecto; the full name stays in the PDF's path.
 *
 * Its fecha, items, Monto, facturación, currency and categoría come from its PDF. Every quote
 * price is before IVA, so IVA is 0 and the total is the Monto: an uninvoiced job (no IVA) can
 * then reach it. Without a readable PDF it imports from its name alone.
 */
export function importarCotizacion(db: Db, entrada: EntradaCotizacion, mapa: Mapa = mapaVacio()): ResultadoCotizacion {
  return db.transaction((tx) => {
  const sufijo = entrada.sufijo ?? ''
  const existente = tx
    .select()
    .from(cotizaciones)
    .where(and(eq(cotizaciones.folio, entrada.folio), eq(cotizaciones.folioSufijo, sufijo)))
    .get()
  if (existente) {
    if (entrada.fecha === null) anotarConocido(mapa, entrada.nombre, existente.contactoId, 'cotizacion')
    return { resultado: 'duplicado', cotizacionId: existente.id, contactosCreados: [], sugerencias: 0 }
  }

  const pdf = entrada.fecha === null ? entrada.pdf : undefined
  // The old filenames carry no date; without one from the PDF, the year it is filed under is all the disk knows.
  const fecha = entrada.fecha ?? pdf?.fecha ?? `${entrada.anio}-01-01`
  const { contactoId, proyecto, ...aportes } =
    entrada.fecha === null
      ? atribuir(tx, mapa, entrada.nombre, 'cotizacion')
      : { ...contactoDeProyecto(tx, entrada.nombre), proyecto: null }
  const nombre = (entrada.fecha === null && mapa.consultar(entrada.nombre)?.proyecto) || pdf?.proyecto || proyecto || entrada.nombre
  const cotizacion = tx
    .insert(cotizaciones)
    .values({
      folio: entrada.folio,
      folioSufijo: sufijo,
      contactoId,
      categoria: pdf?.categoria ?? 'other',
      estado: 'enviada',
      fecha,
      pdfRutaRelativa: entrada.rutaRelativa,
      nombre,
      importado: true,
      items: pdf?.partidas ?? [],
      ...(pdf && {
        moneda: pdf.moneda,
        tipoCambio: pdf.tipoCambio,
        subtotal: pdf.monto,
        iva: 0,
        total: pdf.monto,
        facturacion: pdf.facturacion
      })
    })
    .returning()
    .get()
  return {
    resultado: 'importado',
    cotizacionId: cotizacion.id,
    contactosCreados: aportes.contactosCreados,
    sugerencias: aportes.sugerencias
  }
  })
}

/**
 * One folder as a Proyecto. A folder still in `Proyectos/` is En curso; one that has left for
 * `Archivo/` or the external HDD is a finished Proyecto. The same Proyecto may be found in
 * several places, and each is recorded as its own location. Its Contacto, name and Cliente
 * final come through `atribuirCarpetaProyecto`; with no map row it is named after its folder,
 * and with no Contacto to attribute it to it is a Proyecto sin Contacto.
 */
export function importarCarpetaProyecto(
  db: Db,
  entrada: EntradaCarpeta,
  hoy = hoyLocal(),
  mapa: Mapa = mapaVacio()
): ResultadoCarpeta {
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
      const contactoId = tx.select().from(proyectos).where(eq(proyectos.id, conocida.proyectoId)).get()?.contactoId
      if (contactoId != null) anotarConocido(mapa, entrada.nombre, contactoId, 'proyectos')
      return { proyectoId: conocida.proyectoId, creado: false, sinContacto: false, ambiguos: [], contactosCreados: [], sugerencias: 0 }
    }

    // The same folder imported earlier from another root, before a map row said otherwise, is
    // that Proyecto: the map applies only on first import.
    const previo = entrada.nombre.includes('/') ? undefined : importadoSinMapa(tx, entrada.nombre, true)
    if (previo?.contactoId != null) anotarConocido(mapa, entrada.nombre, previo.contactoId, 'proyectos')
    const { contactoId, proyecto: mapeado, clienteFinal, ambiguos, ...aportes } = previo
      ? {
          ...(previo.contactoId === null
            ? { contactoId: null, contactosCreados: [], sugerencias: 0 }
            : resolverSinFila(tx, mapa, entrada.nombre)),
          proyecto: previo.nombre,
          clienteFinal: null,
          ambiguos: []
        }
      : atribuirCarpetaProyecto(tx, mapa, entrada.nombre)
    const nombre = mapeado ?? posix.basename(entrada.nombre)
    // Matched by Nombre canónico, so the same Proyecto foldered `Sonrieme` in one root and
    // `Sonríeme` in another is one Proyecto with two locations, not two Proyectos. A Proyecto
    // sin Contacto is matched among client Proyectos with none, never a personal one.
    const existente = tx
      .select()
      .from(proyectos)
      .where(
        contactoId === null
          ? and(isNull(proyectos.contactoId), eq(proyectos.etiqueta, 'cliente'))
          : eq(proyectos.contactoId, contactoId)
      )
      .all()
      .find((p) => clave(p.nombre) === clave(nombre))

    const proyecto =
      existente ??
      tx
        .insert(proyectos)
        .values({
          nombre,
          contactoId,
          clienteFinal,
          categoria: 'other',
          estado: entrada.tipo === 'proyectos' ? 'en_curso' : 'completado',
          importado: true
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

    const propuestas = existente || contactoId === null ? 0 : vincularCotizacion(tx, mapa, proyecto.id, contactoId, nombre)
    return {
      proyectoId: proyecto.id,
      creado: !existente,
      sinContacto: contactoId === null,
      ambiguos,
      contactosCreados: aportes.contactosCreados,
      sugerencias: aportes.sugerencias + propuestas
    }
  })
}

/**
 * A folder delivering a quote of the same name means that quote was accepted. The oldest
 * unlinked match is taken. The inference *is* written — that is what "inferred status" means
 * here — and a Sugerencia records that it was inferred, so rejecting it can undo the link.
 * The quote's Cliente final from the map goes onto a Proyecto that has none, and so do its
 * categoría (over `other`) and its fecha, as the fecha de inicio. A quote with
 * several prices also asks "¿Qué aceptó?": which of them the Contacto took. Returns how many
 * Sugerencias it proposed.
 */
function vincularCotizacion(db: Tx, mapa: Mapa, proyectoId: number, contactoId: number, nombre: string): number {
  const candidata = db
    .select()
    .from(cotizaciones)
    .leftJoin(proyectos, eq(proyectos.cotizacionId, cotizaciones.id))
    .where(and(eq(cotizaciones.contactoId, contactoId), isNull(proyectos.id)))
    .orderBy(cotizaciones.folio)
    .all()
    .map((r) => r.cotizaciones)
    .find((c) => repartirNombres(c, nombre).nombre !== undefined)
  if (!candidata) return 0

  const antes = db.select().from(proyectos).where(eq(proyectos.id, proyectoId)).get()
  const notasAntes = antes?.notas ?? null
  const notasEscritas = repartirNombres(candidata, nombre).notas
  // The folder's own Cliente final wins: the folder is the Proyecto.
  const clienteFinal = antes?.clienteFinal ? null : clienteFinalDeCotizacion(mapa, candidata)
  const heredado = heredarDeCotizacion(antes, candidata)
  db.update(cotizaciones).set({ estado: 'aceptada' }).where(eq(cotizaciones.id, candidata.id)).run()
  db.update(proyectos)
    .set({
      cotizacionId: candidata.id,
      notas: notasEscritas,
      ...(clienteFinal && { clienteFinal }),
      ...heredado
    })
    .where(eq(proyectos.id, proyectoId))
    .run()
  const vinculada = proponer(db, {
    entidad: 'cotizacion',
    entidadId: candidata.id,
    accion: 'vincular',
    proyectoId,
    motivo: `carpeta "${nombre}" con el mismo nombre`,
    deshacer: {
      cotizacion: { estado: candidata.estado },
      proyecto: {
        notasAntes,
        notasEscritas,
        ...(clienteFinal && { clienteFinalEscrito: clienteFinal }),
        ...(heredado.categoria && { categoriaEscrita: heredado.categoria }),
        ...(heredado.fechaInicio && { fechaInicioEscrita: heredado.fechaInicio })
      }
    }
  })
  // Only an imported quote's prices are its PDF's, before IVA; one made in the app has its own Monto.
  const precios = candidata.importado ? partidasDelMonto(partidasGuardadas(candidata.items)).length : 0
  const preguntada =
    precios >= 2 &&
    proponer(db, {
      entidad: 'cotizacion',
      entidadId: candidata.id,
      accion: 'partidas',
      motivo: `cotización ${candidata.folio}${candidata.folioSufijo} aceptada con ${precios} precios: ¿qué aceptó?`
    })
  return (vinculada ? 1 : 0) + (preguntada ? 1 : 0)
}

/**
 * An accepted Cotización with no folder anywhere was still delivered: it becomes a completed
 * Proyecto whose files are somewhere the app cannot see. Whether that is Archivado or No
 * disponible is the one thing the disk cannot say, so it is asked once. Returns the ids of the
 * Proyectos it created.
 */
export function proyectosDeCotizacionesAceptadas(
  db: Db,
  mapa: Mapa = mapaVacio()
): { proyectos: number[]; sugerencias: number } {
  const huerfanas = db
    .select()
    .from(cotizaciones)
    .leftJoin(proyectos, eq(proyectos.cotizacionId, cotizaciones.id))
    .where(and(eq(cotizaciones.estado, 'aceptada'), isNull(proyectos.id)))
    .all()
    .map((r) => r.cotizaciones)

  let sugerencias = 0
  const creados: number[] = []
  for (const c of huerfanas) {
    db.transaction((tx) => {
    const { nombre, notas } = repartirNombres(c)
    const proyecto = tx
      .insert(proyectos)
      .values({
        nombre: nombre ?? `Cotización ${c.folio}`,
        contactoId: c.contactoId,
        cotizacionId: c.id,
        clienteFinal: clienteFinalDeCotizacion(mapa, c),
        categoria: c.categoria,
        fechaInicio: c.fecha,
        estado: 'completado',
        notas,
        importado: true
      })
      .returning()
      .get()
    creados.push(proyecto.id)
    const sugerido = proponer(tx, {
      entidad: 'proyecto',
      entidadId: proyecto.id,
      accion: 'ubicacion',
      motivo: `cotización ${c.folio} aceptada sin carpeta: ¿archivado o no disponible?`
    })
    if (sugerido) sugerencias++
    })
  }
  return { proyectos: creados, sugerencias }
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
