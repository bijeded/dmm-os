import { eq, sql } from 'drizzle-orm'
import { mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { escanearCarpetas, importarFacturas } from '.'
import { guardarContacto, listarContactos } from '../contactos'
import {
  ahorroTokens,
  catalogo,
  contactos,
  costos,
  cotizaciones,
  definicionesCosto,
  definicionesIngreso,
  ingresos,
  proyectos,
  settings,
  sugerenciasImportacion,
  tareas,
  ubicacionesArchivo,
  usoTokens
} from '../db/schema'
import { ajustes, db, reiniciarDb } from '../db/test-db'
import { pendientes, responder } from '../sugerencias'
import { cfdiXml, RFC_DMM } from '../test-cfdi'
import { pdfDeTexto } from './pdf-prueba'
import { leerPdfsCotizaciones } from './pdfs'
import { bloqueos, borrarImportado, reimportar, type Entorno } from './reimportar'

// The real reader, watched so a test can see whether a refused reimport read any PDF.
vi.mock('./pdfs', async (original) => {
  const real = await original<typeof import('./pdfs')>()
  return { ...real, leerPdfsCotizaciones: vi.fn(real.leerPdfsCotizaciones) }
})

let root: string
let hdd: string

beforeEach(() => {
  reiniciarDb()
  root = mkdtempSync(join(tmpdir(), 'dmm-reimportar-'))
  hdd = mkdtempSync(join(tmpdir(), 'dmm-reimportar-hdd-'))
})
afterEach(() => {
  rmSync(root, { recursive: true, force: true })
  rmSync(hdd, { recursive: true, force: true })
})

const escribir = (rutaRelativa: string, contenido: string) => {
  const file = join(root, rutaRelativa)
  mkdirSync(join(file, '..'), { recursive: true })
  writeFileSync(file, contenido)
}
const carpeta = (...partes: string[]) => mkdirSync(join(root, ...partes), { recursive: true })
const pdf = (anio: string, nombre: string) => escribir(`Cotizaciones/${anio}/${nombre}`, '%PDF-1.4')
const CABECERA = 'en disco,contacto,proyecto,cliente final,rfc\n'
const mapa = (filas = '') => escribir('Clientes/_nombres.csv', CABECERA + filas)

const MXN = '11111111-0000-4444-8888-99aabbccddee'
const USD = '22222222-0000-4444-8888-99aabbccddee'
const CANCELADA = '33333333-0000-4444-8888-99aabbccddee'

/** The DMM OS folder as the real scan found it, and the ledger the first import made of it. */
function importado() {
  mapa()
  carpeta('Clientes', 'Frida')
  pdf('2019', 'DMM - 201 - Frida Comunicacion.pdf')
  pdf('2025', 'DMM - 475 - Clicme.pdf')
  carpeta('Proyectos', 'Clicme')
  carpeta('Archivo', 'Proyectos', 'Versa')
  escribir('Facturas/Emitidas/2026/mxn.xml', cfdiXml({ uuid: MXN }))
  escribir('Facturas/Emitidas/2026/usd.xml', cfdiXml({ uuid: USD, moneda: 'USD', tipoCambio: '17.50' }))
  escribir('Facturas/Emitidas/2026/cancelada.xml', cfdiXml({ uuid: CANCELADA }))
  escanearCarpetas(db, root)
  importarFacturas(db, root)
}

const respaldar = vi.fn()
const entorno = (extra: Partial<Entorno> = {}): Entorno => ({ root, hoy: '2026-09-24', respaldar, ...extra })

const cuantos = () =>
  Object.fromEntries(
    Object.entries({ contactos, cotizaciones, proyectos, ubicacionesArchivo, ingresos, costos, sugerenciasImportacion }).map(([k, t]) => [
      k,
      db.select().from(t).all().length
    ])
  )

beforeEach(() => respaldar.mockReset())

describe('bloqueos', () => {
  it('names nothing when every record came from the Importación', () => {
    importado()
    expect(bloqueos(db, entorno())).toEqual([])
  })

  it('names 1 Ingreso entered by hand', () => {
    importado()
    db.insert(ingresos).values({ categoria: 'sin_factura', estado: 'pagado', subtotal: 1000, total: 1000, fechaRegistro: '2026-09-01' }).run()
    expect(bloqueos(db, entorno())).toEqual([{ motivo: 'a_mano', registro: 'ingreso', cantidad: 1 }])
  })

  it('names 1 Cotización made in the app', () => {
    importado()
    const frida = db.select().from(contactos).where(eq(contactos.nombre, 'Frida')).get()!
    db.insert(cotizaciones).values({ folio: 900, contactoId: frida.id, categoria: 'website', estado: 'enviada', fecha: '2026-09-01' }).run()
    expect(bloqueos(db, entorno())).toEqual([{ motivo: 'a_mano', registro: 'cotizacion', cantidad: 1 }])
  })

  it('names 1 Contacto made in the app', () => {
    importado()
    guardarContacto(db, { nombre: 'Nuevo Cliente', empresa: null, email: null, telefono: null, direccion: null, notas: null })
    expect(bloqueos(db, entorno())).toEqual([{ motivo: 'a_mano', registro: 'contacto', cantidad: 1 }])
  })

  it('names Proyectos, Costos and definiciones made in the app, each with its count', () => {
    db.insert(proyectos).values({ nombre: 'Portafolio', categoria: 'other', etiqueta: 'personal' }).run()
    db.insert(costos).values({ nombre: 'Hosting', categoria: 'unico', estado: 'pagado', subtotal: 100, total: 100, fecha: '2026-01-01' }).run()
    db.insert(costos).values({ nombre: 'Dominio', categoria: 'unico', estado: 'pagado', subtotal: 100, total: 100, fecha: '2026-01-01' }).run()
    db.insert(definicionesIngreso).values({ tipo: 'mensual', categoria: 'sin_factura', subtotal: 100, total: 100, periodoInicio: '2026-01' }).run()
    db.insert(definicionesCosto).values({ nombre: 'Figma', tipo: 'mensual', periodoInicio: '2026-01' }).run()
    expect(bloqueos(db, entorno())).toEqual([
      { motivo: 'a_mano', registro: 'proyecto', cantidad: 1 },
      { motivo: 'a_mano', registro: 'costo', cantidad: 2 },
      { motivo: 'a_mano', registro: 'definicion_ingreso', cantidad: 1 },
      { motivo: 'a_mano', registro: 'definicion_costo', cantidad: 1 }
    ])
  })

  it('names the map file when its header is broken', () => {
    escribir('Clientes/_nombres.csv', 'nombre,cliente\nVersa,Versa\n')
    expect(bloqueos(db, entorno())).toEqual([{ motivo: 'mapa', error: expect.stringContaining('Clientes/_nombres.csv') }])
  })

  it('asks for an external HDD that is set up but not connected', () => {
    expect(bloqueos(db, entorno({ hddRoot: join(hdd, 'no-montado') }))).toEqual([{ motivo: 'hdd', ruta: join(hdd, 'no-montado') }])
    mkdirSync(join(hdd, 'Proyectos'))
    expect(bloqueos(db, entorno({ hddRoot: hdd }))).toEqual([])
  })

  it('lets an imported Contacto the user edited through', () => {
    importado()
    const frida = db.select().from(contactos).where(eq(contactos.nombre, 'Frida')).get()!
    guardarContacto(db, { id: frida.id, nombre: 'Frida Estudio', empresa: null, email: 'hola@frida.mx', telefono: null, direccion: null, notas: null })
    expect(bloqueos(db, entorno())).toEqual([])
  })

  it('stops naming legacy Cotizaciones once 0019 marks them, and still names one made in the app', () => {
    importado()
    // As an app before 0019 left them: stored with "[]" and never marked imported.
    db.run(sql`update cotizaciones set importado = 0, items = '"[]"'`)
    const frida = db.select().from(contactos).where(eq(contactos.nombre, 'Frida')).get()!
    db.insert(cotizaciones)
      .values({ folio: 900, contactoId: frida.id, categoria: 'website', estado: 'enviada', fecha: '2026-09-01', items: [{ concepto: 'Sitio', precio: 1000, cantidad: 1 }] })
      .run()
    expect(bloqueos(db, entorno())).toEqual([{ motivo: 'a_mano', registro: 'cotizacion', cantidad: 3 }])

    const migracion = readFileSync(resolve(import.meta.dirname, '../../../drizzle/0019_corregir_importado_cotizaciones.sql'), 'utf8')
    for (const stmt of migracion.split('--> statement-breakpoint')) db.run(sql.raw(stmt))

    expect(bloqueos(db, entorno())).toEqual([{ motivo: 'a_mano', registro: 'cotizacion', cantidad: 1 }])
  })
})

describe('borrarImportado', () => {
  it('removes every imported record and leaves AI usage, Tareas, the Catálogo and settings alone', () => {
    importado()
    db.insert(usoTokens)
      .values({ dia: '2026-09-01', carpeta: 'Proyectos-Aura', proveedor: 'anthropic', modelo: 'claude', tokensEntrada: 1, tokensSalida: 1, tokensCacheEscritura: 0, tokensCacheLectura: 0, costoUsd: 1 })
      .run()
    db.insert(ahorroTokens).values({ dia: '2026-09-01', tokens: 10 }).run()
    db.insert(tareas).values({ texto: 'Llamar a Frida', fechaRegistro: '2026-09-01' }).run()
    db.insert(catalogo).values({ concepto: 'Sitio web', categoria: 'website', precio: 100 }).run()
    ajustes.escribir('hdd.root', '/Volumes/HDD')
    const intactas = [usoTokens, ahorroTokens, tareas, catalogo, settings]
    const antes = intactas.map((t) => db.select().from(t).all())
    expect(cuantos()).toMatchObject({ contactos: 4, ingresos: 3, sugerenciasImportacion: 2 })

    db.transaction((tx) => borrarImportado(tx))

    expect(cuantos()).toEqual({ contactos: 0, cotizaciones: 0, proyectos: 0, ubicacionesArchivo: 0, ingresos: 0, costos: 0, sugerenciasImportacion: 0 })
    expect(intactas.map((t) => db.select().from(t).all())).toEqual(antes)
  })

  it('removes Costos an earlier run imported and keeps nothing else it made', () => {
    db.insert(costos).values({ nombre: 'Hosting', categoria: 'unico', estado: 'pagado', subtotal: 100, total: 100, fecha: '2026-01-01', cfdiUuid: 'X' }).run()
    db.transaction((tx) => borrarImportado(tx))
    expect(db.select().from(costos).all()).toEqual([])
  })
})

describe('reimportar', () => {
  const contactoDe = (folio: number) => {
    const c = db.select().from(cotizaciones).where(eq(cotizaciones.folio, folio)).get()!
    return db.select().from(contactos).where(eq(contactos.id, c.contactoId)).get()!.nombre
  }

  it('takes the Respaldo first, then imports every file again as if for the first time', async () => {
    importado()
    const alRespaldar: ReturnType<typeof cuantos>[] = []
    const r = await reimportar(db, entorno({ respaldar: () => alRespaldar.push(cuantos()) }))
    expect(alRespaldar).toEqual([expect.objectContaining({ contactos: 4, ingresos: 3 })])
    expect(r).toMatchObject({ reimportado: true, carpetas: { cotizaciones: { importadas: 2 } }, facturas: { importados: 3 } })
  })

  it('lets a map fix reach an imported quote', async () => {
    importado()
    expect(contactoDe(201)).toBe('Frida Comunicacion')
    mapa('Frida Comunicacion,Frida,,\n')
    await reimportar(db, entorno())
    expect(contactoDe(201)).toBe('Frida')
    expect(db.select().from(contactos).where(eq(contactos.nombre, 'Frida Comunicacion')).all()).toEqual([])
  })

  it('asks an accepted vincular again', async () => {
    importado()
    const vincular = () => pendientes(db).filter((s) => s.accion === 'vincular')
    const [s] = vincular()
    expect(s).toMatchObject({ registro: expect.stringContaining('475'), destino: 'Clicme' })
    responder(db, s.id, 'aceptada', '2026-09-24')
    expect(vincular()).toEqual([])

    await reimportar(db, entorno())
    expect(vincular()).toEqual([expect.objectContaining({ registro: expect.stringContaining('475'), destino: 'Clicme' })])
  })

  it('imports a USD Ingreso again with its original amount', async () => {
    importado()
    await reimportar(db, entorno())
    expect(db.select().from(ingresos).where(eq(ingresos.cfdiUuid, USD)).get()).toMatchObject({ montoOriginal: 116_000, monedaOriginal: 'USD', total: 2_030_000 })
  })

  it('keeps a Factura cancelada out', async () => {
    importado()
    mkdirSync(join(root, 'Facturas/Emitidas/2026/Canceladas'))
    renameSync(join(root, 'Facturas/Emitidas/2026/cancelada.xml'), join(root, 'Facturas/Emitidas/2026/Canceladas/cancelada.xml'))
    importarFacturas(db, root)
    expect(db.select().from(ingresos).where(eq(ingresos.cfdiUuid, CANCELADA)).get()!.estado).toBe('cancelado')

    await reimportar(db, entorno())
    expect(db.select().from(ingresos).where(eq(ingresos.cfdiUuid, CANCELADA)).all()).toEqual([])
  })

  it('brings an archived Proyecto back completed, with no Ingresos from its Cotización (ADR-0002)', async () => {
    importado()
    await reimportar(db, entorno())
    const versa = db.select().from(proyectos).where(eq(proyectos.nombre, 'Versa')).get()!
    expect(versa.estado).toBe('completado')
    expect(db.select().from(ingresos).where(eq(ingresos.proyectoId, versa.id)).all()).toEqual([])
    expect(db.select().from(definicionesIngreso).all()).toEqual([])
    expect(db.select().from(costos).all()).toEqual([])
  })

  it('leaves Estado de Contacto following the new attribution', async () => {
    importado()
    const estados = () => Object.fromEntries(listarContactos(db).contactos.map((c) => [c.nombre, c.estado]))
    expect(estados()).toMatchObject({ Frida: 'lead_frio', 'Frida Comunicacion': 'lead_caliente' })
    mapa('Frida Comunicacion,Frida,,\n')
    await reimportar(db, entorno())
    expect(estados()).toMatchObject({ Frida: 'lead_caliente' })
    expect(estados()).not.toHaveProperty('Frida Comunicacion')
  })

  it('leaves every record in place when the Respaldo fails', async () => {
    importado()
    const antes = cuantos()
    const filas = db.select().from(contactos).all()
    const falla = () => {
      throw new Error('disco lleno')
    }
    await expect(reimportar(db, entorno({ respaldar: falla }))).rejects.toThrow('disco lleno')
    expect(cuantos()).toEqual(antes)
    expect(db.select().from(contactos).all()).toEqual(filas)
  })

  it('takes no Respaldo and removes nothing when refused', async () => {
    importado()
    db.insert(costos).values({ nombre: 'Hosting', categoria: 'unico', estado: 'pagado', subtotal: 100, total: 100, fecha: '2026-01-01' }).run()
    const antes = cuantos()
    expect(await reimportar(db, entorno())).toEqual({ reimportado: false, bloqueos: [{ motivo: 'a_mano', registro: 'costo', cantidad: 1 }] })
    expect(respaldar).not.toHaveBeenCalled()
    expect(cuantos()).toEqual(antes)
  })

  it('refuses before removing anything when the map cannot be read', async () => {
    importado()
    escribir('Clientes/_nombres.csv', 'nombre,cliente\n')
    const antes = cuantos()
    expect(await reimportar(db, entorno())).toMatchObject({ reimportado: false, bloqueos: [{ motivo: 'mapa' }] })
    expect(cuantos()).toEqual(antes)
  })

  it('counts no received CFDI as a Costo', async () => {
    importado()
    escribir('Facturas/Recibidas/2026/b.xml', cfdiXml({ uuid: '44444444-0000-4444-8888-99aabbccddee', emisor: 'PRV900101QQ1', receptor: RFC_DMM }))
    const r = await reimportar(db, entorno())
    expect(r).toMatchObject({ reimportado: true, facturas: { recibidas: 1 } })
    expect(db.select().from(costos).all()).toEqual([])
  })
})

describe('Reimportar desde cero y los PDFs de las Cotizaciones', () => {
  it('reads no PDF when it is refused', async () => {
    importado()
    db.insert(costos).values({ nombre: 'Hosting', categoria: 'unico', estado: 'pagado', fecha: '2026-01-01', subtotal: 100, total: 100 }).run()
    vi.mocked(leerPdfsCotizaciones).mockClear()
    expect((await reimportar(db, entorno())).reimportado).toBe(false)
    expect(leerPdfsCotizaciones).not.toHaveBeenCalled()
  })

  it('asks again after reading the PDFs, and is refused if something was made by hand meanwhile', async () => {
    importado()
    const real = vi.mocked(leerPdfsCotizaciones).getMockImplementation()!
    vi.mocked(leerPdfsCotizaciones).mockImplementationOnce(async (...args) => {
      db.insert(costos).values({ nombre: 'Hosting', categoria: 'unico', estado: 'pagado', fecha: '2026-01-01', subtotal: 100, total: 100 }).run()
      return real(...args)
    })
    const antes = db.select().from(contactos).all().length
    let respaldado = false
    expect(await reimportar(db, entorno({ respaldar: () => (respaldado = true) }))).toEqual({
      reimportado: false,
      bloqueos: [{ motivo: 'a_mano', registro: 'costo', cantidad: 1 }]
    })
    expect(respaldado).toBe(false)
    expect(db.select().from(contactos).all()).toHaveLength(antes)
  })

  it('is not refused on account of imported Cotizaciones that have items from their PDF', async () => {
    mapa()
    carpeta('Cotizaciones', '2021')
    writeFileSync(join(root, 'Cotizaciones/2021/DMM - 250 - Flor de Letras.pdf'), pdfDeTexto(['Video “Curso”: video:', 'Costo: $ 3,000.00']))
    escanearCarpetas(db, root, undefined, '2026-09-01', await leerPdfsCotizaciones(root, db))
    expect(db.select().from(cotizaciones).get()!.items).toHaveLength(1)

    expect(bloqueos(db, { root })).toEqual([])
    expect((await reimportar(db, entorno())).reimportado).toBe(true)
    expect(db.select().from(cotizaciones).get()).toMatchObject({ total: 300000, importado: true })
  })
})
