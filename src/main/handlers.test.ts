import { pdfDeTexto } from './importacion/pdf-prueba'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { eq, sql } from 'drizzle-orm'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDatabase, type Conexion } from './db'
import { contactos, costos, cotizaciones, definicionesCosto, definicionesIngreso, ingresos, proyectos, sugerenciasImportacion, vigenciasPrecio } from './db/schema'
import { MENSAJE_SIN_PAGAR } from './ciclo-proyecto'
import { MENSAJE_REEMBOLSO_EXCEDIDO } from './dinero'
import { crearHandlers, type HandlersOptions } from './handlers'
import { MENSAJE_MONTO } from '../shared/montos'
import { cfdiXml } from './test-cfdi'
import type { DmmHandlers } from '../shared/contrato'
import { ESTADOS_PROYECTO, type AccionCosto, type AccionCotizacion, type AccionIngreso, type AccionProyecto, type CategoriaCosto, type FichaCotizacion, type FichaProyecto, type FilaCosto, type FilaIngreso } from '../shared/dominio'

const migrationsFolder = resolve(import.meta.dirname, '../../drizzle')

let root: string
let conexion: Conexion
let opciones: HandlersOptions
let h: DmmHandlers

/** Temp folders made by the current test, removed after it. */
const temporales: string[] = []
function temporal(prefijo: string) {
  const dir = mkdtempSync(join(tmpdir(), prefijo))
  temporales.push(dir)
  return dir
}
// Runs after each describe's own afterEach, so the connections into these folders are closed first.
afterEach(() => temporales.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })))

beforeEach(() => {
  root = temporal('dmm-handlers-')
  conexion = createDatabase(migrationsFolder).abrir(':memory:')
  opciones = {
    conexion,
    info: { version: '0.1.0', dbPath: ':memory:', dmmOsRoot: root },
    respaldos: {
      estado: vi.fn(),
      crear: vi.fn(),
      configurar: vi.fn(),
      restaurar: vi.fn(() => ({ restaurado: true })),
      antesDeReimportar: vi.fn()
    } as unknown as HandlersOptions['respaldos'],
    elegirRespaldo: vi.fn(async () => undefined),
    elegirHdd: vi.fn(async () => undefined),
    abrirCarpeta: vi.fn(async () => ''),
    imprimirPdf: vi.fn(async () => new TextEncoder().encode('%PDF')),
    ejecutarUso: vi.fn(async () => {
      throw new Error('no está instalado')
    }),
    ahora: () => '2026-09-16T10:00:00.000Z'
  }
  h = crearHandlers(opciones)
})

describe('el disco externo', () => {
  it('remembers the chosen drive, and the folder scan reads it', async () => {
    const hdd = temporal('dmm-hdd-')
    mkdirSync(join(hdd, 'Proyectos'))
    vi.mocked(opciones.elegirHdd).mockResolvedValue(hdd)

    expect(await h.rutas.elegirHdd()).toMatchObject({ hddRoot: hdd, hddConectado: true })
    expect(conexion.ajustes.leer('hdd.root')).toBe(hdd)
    expect((await h.importacion.carpetas()).hddConectado).toBe(true)
  })

  it('keeps the drive it had when the choice is cancelled', async () => {
    conexion.ajustes.escribir('hdd.root', '/Volumes/HDD')
    expect((await h.rutas.elegirHdd()).hddRoot).toBe('/Volumes/HDD')
  })

  it('forgets the drive', async () => {
    conexion.ajustes.escribir('hdd.root', '/Volumes/HDD')
    expect(await h.rutas.olvidarHdd()).toMatchObject({ hddRoot: null, hddConectado: false })
    expect((await h.importacion.carpetas()).hddConectado).toBe(false)
  })
})

describe('Logs', () => {
  it('shows nothing until an importer runs, then its last run', async () => {
    expect(await h.importacion.estado()).toEqual({ facturas: null, carpetas: null })
    const log = await h.importacion.facturas()
    expect(await h.importacion.estado()).toEqual({ facturas: { corridoEn: '2026-09-16T10:00:00.000Z', log }, carpetas: null })
  })
})

describe('Vista previa', () => {
  const enDisco = () => {
    mkdirSync(join(root, 'Clientes', 'Sublime'), { recursive: true })
    mkdirSync(join(root, 'Clientes', 'Sublime Inspiración'), { recursive: true })
    mkdirSync(join(root, 'Proyectos', 'Clicme'), { recursive: true })
    mkdirSync(join(root, 'Cotizaciones', '2023'), { recursive: true })
    writeFileSync(join(root, 'Cotizaciones', '2023', 'DMM - 312 - Appleseed Plataforma.pdf'), '%PDF-1.4')
    writeFileSync(join(root, 'Clientes', '_nombres.csv'), 'en disco,contacto,proyecto\nAppleseed Plataforma,Appleseed,Plataforma\n')
  }
  const cuenta = () =>
    [contactos, cotizaciones, proyectos, sugerenciasImportacion].map((t) => conexion.db.select().from(t).all().length)

  it('reports what a scan would add and writes nothing', async () => {
    enDisco()
    const log = await h.importacion.vistaPrevia()
    expect(log).toMatchObject({
      mapa: 'leido',
      cotizaciones: { importadas: 1 },
      contactos: { creados: 4 },
      proyectos: { creados: 1 },
      sugerencias: 1
    })
    expect(log.nuevos.contactos.map((c) => c.nombre)).toEqual(['Appleseed', 'Sublime', 'Sublime Inspiración', 'Clicme'])
    expect(cuenta()).toEqual([0, 0, 0, 0])
    expect(await h.importacion.estado()).toEqual({ facturas: null, carpetas: null })
  })

  it('leaves the last real scan in Logs, and finds nothing new after it', async () => {
    enDisco()
    const real = await h.importacion.carpetas()
    const antes = cuenta()

    const log = await h.importacion.vistaPrevia()
    expect(log.nuevos).toEqual({ contactos: [], proyectos: [], rfcs: [], cotizaciones: [] })
    expect(log).toMatchObject({ cotizaciones: { importadas: 0, duplicadas: 1 }, contactos: { creados: 0 }, sugerencias: 0 })
    expect(cuenta()).toEqual(antes)
    expect((await h.importacion.estado()).carpetas).toEqual({ corridoEn: '2026-09-16T10:00:00.000Z', log: real })
  })

  it("shows what each new Cotización takes from its PDF, and the ones it could not fully read", async () => {
    enDisco()
    writeFileSync(
      join(root, 'Cotizaciones', '2023', 'DMM - 312 - Appleseed Plataforma.pdf'),
      pdfDeTexto(['Ciudad de México, 3 de marzo, 2023.', 'Web App “Reservas”: app:', 'Costo: $ 40,000.00'])
    )
    writeFileSync(join(root, 'Cotizaciones', '2023', 'DMM - 313 - Sublime.pdf'), '%PDF-1.4')
    const log = await h.importacion.vistaPrevia()
    expect(log.nuevos.cotizaciones).toEqual([
      { folio: '312', fecha: '2023-03-03', monto: 4000000, moneda: 'MXN', categoria: 'app' },
      { folio: '313', fecha: '2023-01-01', monto: 0, moneda: 'MXN', categoria: 'other' }
    ])
    expect(log.cotizacionesIncompletas).toEqual([{ folio: '313', archivo: 'Cotizaciones/2023/DMM - 313 - Sublime.pdf', falta: ['pdf'] }])
    expect(cuenta()).toEqual([0, 0, 0, 0])
  })

  it('shows the same error a real scan would for a broken map', async () => {
    enDisco()
    writeFileSync(join(root, 'Clientes', '_nombres.csv'), 'nombre,cliente\n')
    const log = await h.importacion.vistaPrevia()
    expect(log.mapa).toEqual({ error: expect.stringContaining('_nombres.csv') })
    expect(log.nuevos.contactos).toEqual([])
  })
})

describe('Reimportar desde cero', () => {
  const MAPA = join('Clientes', '_nombres.csv')
  /** Already imported without the map row for Appleseed Plataforma. */
  const importado = async () => {
    mkdirSync(join(root, 'Clientes', 'Sublime'), { recursive: true })
    mkdirSync(join(root, 'Proyectos', 'Clicme'), { recursive: true })
    mkdirSync(join(root, 'Cotizaciones', '2023'), { recursive: true })
    mkdirSync(join(root, 'Cotizaciones', '2025'), { recursive: true })
    writeFileSync(join(root, 'Cotizaciones', '2023', 'DMM - 312 - Appleseed Plataforma.pdf'), '%PDF-1.4')
    writeFileSync(join(root, 'Cotizaciones', '2025', 'DMM - 475 - Clicme.pdf'), '%PDF-1.4')
    writeFileSync(join(root, MAPA), 'en disco,contacto,proyecto\n')
    await h.importacion.carpetas()
    writeFileSync(join(root, MAPA), 'en disco,contacto,proyecto\nAppleseed Plataforma,Appleseed,Plataforma\n')
  }
  const nombres = () => conexion.db.select().from(contactos).all().map((c) => c.nombre).sort()

  it('takes a Respaldo antes de reimportar and shows both runs as the last ones', async () => {
    await importado()
    const r = await h.importacion.reimportar()
    expect(opciones.respaldos.antesDeReimportar).toHaveBeenCalledTimes(1)
    expect(r).toMatchObject({ reimportado: true, carpetas: { cotizaciones: { importadas: 2 } } })
    if (!r.reimportado) throw new Error('rechazado')
    expect(await h.importacion.estado()).toEqual({
      carpetas: { corridoEn: '2026-09-16T10:00:00.000Z', log: r.carpetas },
      facturas: { corridoEn: '2026-09-16T10:00:00.000Z', log: r.facturas }
    })
    expect(nombres()).toEqual(['Appleseed', 'Clicme', 'Sublime'])
  })

  it("reads every quote's PDF again, so the reimported Cotizaciones carry what it says", async () => {
    await importado()
    writeFileSync(join(root, 'Cotizaciones', '2025', 'DMM - 475 - Clicme.pdf'), pdfDeTexto(['Ciudad de México, 3 de marzo, 2025.', 'Sitio web: sitio:', 'Costo: $ 8,000.00']))
    const r = await h.importacion.reimportar()
    expect(r.reimportado).toBe(true)
    expect(conexion.db.select().from(cotizaciones).where(eq(cotizaciones.folio, 475)).get()).toMatchObject({ fecha: '2025-03-03', total: 800000, categoria: 'website' })
  })

  it('is refused while a hand-entered Ingreso exists, taking no Respaldo', async () => {
    await importado()
    conexion.db.insert(ingresos).values({ categoria: 'sin_factura', estado: 'pagado', subtotal: 1000, total: 1000, fechaRegistro: '2026-09-01' }).run()
    expect(await h.importacion.reimportar()).toEqual({ reimportado: false, bloqueos: [{ motivo: 'a_mano', registro: 'ingreso', cantidad: 1 }] })
    expect(opciones.respaldos.antesDeReimportar).not.toHaveBeenCalled()
    expect(nombres()).toContain('Appleseed Plataforma')
  })

  it('previews desde cero without touching the live database, its Sugerencias or Logs', async () => {
    await importado()
    const antes = { nombres: nombres(), pendientes: await h.importacion.sugerencias(), estado: structuredClone(await h.importacion.estado()) }

    const { log, bloqueos } = await h.importacion.vistaPreviaDesdeCero()
    expect(bloqueos).toEqual([])
    expect(log.nuevos.contactos.map((c) => c.nombre)).not.toContain('Appleseed Plataforma')
    expect(log.nuevos.contactos.map((c) => c.nombre)).toContain('Appleseed')
    expect(log.cotizaciones).toEqual({ importadas: 2, duplicadas: 0 })
    // Both quotes are read again although both are imported in the live database.
    expect(log.cotizacionesIncompletas.map((c) => c.folio).sort()).toEqual(['312', '475'])

    expect(nombres()).toEqual(antes.nombres)
    expect(nombres()).toContain('Appleseed Plataforma')
    expect(await h.importacion.sugerencias()).toEqual(antes.pendientes)
    expect(await h.importacion.estado()).toEqual(antes.estado)
  })

  it('previews legacy Cotizaciones as imported again once 0019 marks them, not as duplicates', async () => {
    await importado()
    // As an app before 0019 left them: stored with "[]" and never marked imported.
    conexion.db.run(sql`update cotizaciones set importado = 0, items = '"[]"'`)
    expect((await h.importacion.vistaPreviaDesdeCero()).log.cotizaciones).toEqual({ importadas: 0, duplicadas: 2 })

    const migracion = readFileSync(join(migrationsFolder, '0019_corregir_importado_cotizaciones.sql'), 'utf8')
    for (const stmt of migracion.split('--> statement-breakpoint')) conexion.db.run(sql.raw(stmt))

    const { log, bloqueos } = await h.importacion.vistaPreviaDesdeCero()
    expect(log.cotizaciones).toEqual({ importadas: 2, duplicadas: 0 })
    expect(bloqueos).toEqual([])
  })

  it('still previews while a hand-entered Ingreso points at an imported Contacto, and names the block', async () => {
    await importado()
    const sublime = conexion.db.select().from(contactos).where(eq(contactos.nombre, 'Sublime')).get()!
    conexion.db
      .insert(ingresos)
      .values({ categoria: 'sin_factura', estado: 'pagado', subtotal: 1000, total: 1000, fechaRegistro: '2026-09-01', contactoId: sublime.id })
      .run()
    const { log, bloqueos } = await h.importacion.vistaPreviaDesdeCero()
    expect(log.cotizaciones.importadas).toBe(2)
    expect(bloqueos).toEqual([{ motivo: 'a_mano', registro: 'ingreso', cantidad: 1 }])
    expect(conexion.db.select().from(ingresos).get()!.contactoId).toBe(sublime.id)
  })

  it('accepts every pending vincular from Logs', async () => {
    await importado()
    expect((await h.importacion.sugerencias()).map((s) => s.accion)).toEqual(['vincular'])
    expect(await h.importacion.aceptarVincular()).toEqual([])
    expect(conexion.db.select().from(proyectos).get()!.cotizacionId).not.toBeNull()
  })

  it('answers a Sugerencia with another Proyecto and returns what is still pending', async () => {
    const db = conexion.db
    const frida = db.insert(contactos).values({ nombre: 'Frida' }).returning().get().id
    const [web2023, web2027] = ['Web 2023', 'Web 2027'].map((nombre) => db.insert(proyectos).values({ nombre, contactoId: frida, categoria: 'website' }).returning().get().id)
    const ingreso = db.insert(ingresos).values({ categoria: 'sin_factura', subtotal: 1000, total: 1000, fechaRegistro: '2026-09-01', contactoId: frida }).returning().get().id
    const duplicado = db.insert(contactos).values({ nombre: 'Frida Comunicacion' }).returning().get().id
    db.insert(sugerenciasImportacion).values({ entidad: 'ingreso', entidadId: ingreso, accion: 'vincular', proyectoId: web2023, motivo: 'monto' }).run()
    db.insert(sugerenciasImportacion).values({ entidad: 'contacto', entidadId: duplicado, accion: 'fusionar', contactoId: frida, motivo: 'nombre' }).run()
    const [vincular] = await h.importacion.sugerencias()

    const quedan = await h.importacion.responder(vincular.id, { elegidas: [web2027] })
    expect(quedan.map((s) => s.accion)).toEqual(['fusionar'])
    expect(db.select().from(ingresos).where(eq(ingresos.id, ingreso)).get()!.proyectoId).toBe(web2027)
  })

  it('answers "¿Qué aceptó?" with several prices and returns what is still pending', async () => {
    const db = conexion.db
    const sublime = db.insert(contactos).values({ nombre: 'Sublime' }).returning().get().id
    const partida = (concepto: string, precio: number) => ({ concepto, categoria: 'website' as const, cantidad: 1, precio })
    const c = db
      .insert(cotizaciones)
      .values({
        folio: 308,
        contactoId: sublime,
        categoria: 'website',
        estado: 'aceptada',
        fecha: '2021-03-03',
        items: [partida('Sitio', 1000000), partida('Landing', 400000), partida('Logo', 250000)],
        subtotal: 1650000,
        total: 1650000
      })
      .returning()
      .get()
    const duplicado = db.insert(contactos).values({ nombre: 'Sublime Inspiracion' }).returning().get().id
    db.insert(sugerenciasImportacion).values({ entidad: 'cotizacion', entidadId: c.id, accion: 'partidas', motivo: 'precios' }).run()
    db.insert(sugerenciasImportacion).values({ entidad: 'contacto', entidadId: duplicado, accion: 'fusionar', contactoId: sublime, motivo: 'nombre' }).run()
    const [partidas] = await h.importacion.sugerencias()
    expect(partidas).toMatchObject({ accion: 'partidas', varias: true })

    const quedan = await h.importacion.responder(partidas.id, { elegidas: [0, 2] })
    expect(quedan.map((s) => s.accion)).toEqual(['fusionar'])
    expect(db.select().from(cotizaciones).where(eq(cotizaciones.id, c.id)).get()).toMatchObject({ subtotal: 1250000, iva: 0, total: 1250000 })
  })
})

describe('Restauración', () => {
  it('restores the given Respaldo without asking', async () => {
    expect(await h.respaldos.restaurar('/v/a.db')).toEqual({ restaurado: true })
    expect(opciones.elegirRespaldo).not.toHaveBeenCalled()
  })

  it('asks for a Respaldo, and restores nothing when the choice is cancelled', async () => {
    expect(await h.respaldos.restaurar()).toEqual({ restaurado: false })
    expect(opciones.respaldos.restaurar).not.toHaveBeenCalled()

    vi.mocked(opciones.elegirRespaldo).mockResolvedValue('/v/b.db')
    await h.respaldos.restaurar()
    expect(opciones.respaldos.restaurar).toHaveBeenCalledWith('/v/b.db')
  })
})

describe('abrir carpetas', () => {
  it('opens Entrada or the root', async () => {
    await h.rutas.abrir('entrada')
    await h.rutas.abrir('raiz')
    expect(opciones.abrirCarpeta).toHaveBeenNthCalledWith(1, join(root, 'Entrada'))
    expect(opciones.abrirCarpeta).toHaveBeenNthCalledWith(2, root)
  })

  it('fails with the reason the folder could not be opened', async () => {
    vi.mocked(opciones.abrirCarpeta).mockResolvedValue('No existe')
    await expect(h.rutas.abrir('entrada')).rejects.toThrow('No existe')
  })
})

describe('Lab', () => {
  it('opens a Lab file or folder under the DMM OS root', async () => {
    await h.lab.abrir('Benchmarks/benchmark.md')
    await h.lab.abrir('Benchmarks')
    expect(opciones.abrirCarpeta).toHaveBeenNthCalledWith(1, join(root, 'Lab', 'Benchmarks', 'benchmark.md'))
    expect(opciones.abrirCarpeta).toHaveBeenNthCalledWith(2, join(root, 'Lab', 'Benchmarks'))
  })

  it('refuses to open anything outside Lab/', async () => {
    await expect(h.lab.abrir('../Vault')).rejects.toThrow(/fuera de Lab/)
    expect(opciones.abrirCarpeta).not.toHaveBeenCalled()
  })

  it('lists the folders of Lab/ on disk', async () => {
    mkdirSync(join(root, 'Lab', 'Newsletter'), { recursive: true })
    expect(await h.lab.carpetas()).toEqual([{ nombre: 'Newsletter', archivos: 0 }])
  })

  it('searches Lab/ on disk and previews its text files', async () => {
    mkdirSync(join(root, 'Lab', 'Newsletter'), { recursive: true })
    writeFileSync(join(root, 'Lab', 'Newsletter', 'boletin.md'), '# Boletín')
    expect((await h.lab.buscar('BOLET')).map((a) => [a.carpeta, a.nombre])).toEqual([['Newsletter', 'boletin.md']])
    expect(await h.lab.vistaPrevia('Newsletter/boletin.md')).toEqual({ texto: '# Boletín', recortado: false })
    expect(() => h.lab.vistaPrevia('../Vault/dmm.db')).toThrow(/fuera de Lab/)
  })
})

describe('AI', () => {
  it('reads usage through the runner it is given, and totals this month from it', async () => {
    vi.mocked(opciones.ejecutarUso!).mockImplementation(async (fuente) =>
      fuente === 'rtk'
        ? JSON.stringify({ daily: [{ date: '2026-09-15', saved_tokens: 40 }] })
        : JSON.stringify({
            projects: {
              '-Users-dmm-Desktop-DMM-OS-Proyectos-Aura': [
                { date: '2026-09-15', modelBreakdowns: [{ modelName: 'claude-opus-5', inputTokens: 60, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0, cost: 0.5 }] },
                { date: '2026-08-31', modelBreakdowns: [{ modelName: 'claude-opus-5', inputTokens: 900, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0, cost: 9 }] }
              ]
            }
          })
    )
    expect(await h.ai.leerUso()).toEqual({ ultimoEscaneo: '2026-09-16T10:00:00.000Z', avisos: [] })
    expect(await h.ai.resumen('mes')).toMatchObject({ tokens: 60, tokensAhorrados: 40, costoApiUsd: 50, ahorro: 0.4 })
  })

  it('names a source that cannot be read', async () => {
    expect((await h.ai.leerUso()).avisos).toEqual(['CC Usage: no está instalado', 'RTK: no está instalado'])
  })

  it('lists the agents in AI/ on disk and opens their file under the DMM OS root', async () => {
    mkdirSync(join(root, 'AI', 'agents'), { recursive: true })
    writeFileSync(join(root, 'AI', 'agents', 'code-reviewer.md'), '---\nname: code-reviewer\n---\n')
    expect((await h.ai.agentesYSkills()).map((a) => [a.tipo, a.nombre, a.usadoEn])).toEqual([['agente', 'code-reviewer', []]])
    await h.ai.abrir('agents/code-reviewer.md')
    expect(opciones.abrirCarpeta).toHaveBeenCalledWith(join(root, 'AI', 'agents', 'code-reviewer.md'))
  })

  it('refuses to open anything that is not an agent or skill', async () => {
    mkdirSync(join(root, 'AI'))
    await expect(h.ai.abrir('../Vault/dmm.db')).rejects.toThrow(/no es un agente ni un skill/)
    expect(opciones.abrirCarpeta).not.toHaveBeenCalled()
  })
})

describe('Sugerencias de importación', () => {
  it('starts with none pending', async () => {
    mkdirSync(join(root, 'Entrada'))
    writeFileSync(join(root, 'Entrada', 'x.pdf'), '')
    expect(await h.importacion.sugerencias()).toEqual([])
    expect((await h.rutas.leer()).entrada).toBe(1)
  })
})

describe('contactos', () => {
  it('reads each Contacto’s folder under the DMM OS root', async () => {
    mkdirSync(join(root, 'Clientes', 'Sonrieme'), { recursive: true })
    writeFileSync(join(root, 'Clientes', 'Sonrieme', 'Brief.docx'), 'x')
    const { id } = conexion.db.insert(contactos).values({ nombre: 'Sonríeme' }).returning().get()

    expect((await h.contactos.listar()).contactos.map((c) => c.nombre)).toEqual(['Sonríeme'])
    expect((await h.contactos.ficha(id)).archivos.map((a) => a.nombre)).toEqual(['Brief.docx'])
    await h.contactos.borrar(id)
    expect(await h.contactos.csv()).toBe('nombre,empresa,email,telefono,estado\r\n')
  })
})

describe('Catálogo', () => {
  it('adds, edits and deletes concepts through the handlers', async () => {
    const [c] = await h.catalogo.guardar({ concepto: 'Chatbot AI', categoria: 'ai', precio: 1_800_000 })
    expect(await h.catalogo.guardar({ ...c, precio: 2_000_000 })).toEqual([{ ...c, precio: 2_000_000 }])
    expect(await h.catalogo.listar()).toHaveLength(1)
    expect(await h.catalogo.borrar(c.id)).toEqual([])
  })
})

describe('Tareas', () => {
  it('dates a task and its completion with today', async () => {
    const { pendientes } = await h.tareas.agregar('Llamar a Hotel Aura')
    expect(pendientes).toMatchObject([{ texto: 'Llamar a Hotel Aura', fechaRegistro: '2026-09-16', fechaHecha: null }])
    expect((await h.tareas.completar(pendientes[0].id)).hechas).toMatchObject([{ fechaHecha: '2026-09-16' }])
    expect(await h.tareas.borrar(pendientes[0].id)).toEqual(await h.tareas.listar())
  })
})

describe('cotizaciones', () => {
  it('sends a quote into the DMM OS root, accepts it on the local day, and opens its PDF', async () => {
    const { id: contactoId } = conexion.db.insert(contactos).values({ nombre: 'Clínica Sol' }).returning().get()
    const { id } = await h.cotizaciones.guardar({
      contactoId,
      nombre: 'Landing',
      categoria: 'website',
      fecha: '2026-09-16',
      validezDias: 30,
      moneda: 'MXN',
      partidas: [{ concepto: 'Landing', categoria: 'website', cantidad: 1, precio: 950_000 }],
      conIva: false,
      facturacion: 'unica',
      parcialidades: null,
      stack: null,
      terminos: null,
      notas: null,
      costosEstimados: []
    })
    const { pdf } = await h.cotizaciones.enviar(id)
    expect(readFileSync(join(root, pdf!), 'utf8')).toBe('%PDF')
    expect((await h.cotizaciones.aceptar(id)).estado).toBe('aceptada')
    await h.cotizaciones.abrirPdf(id)
    expect(opciones.abrirCarpeta).toHaveBeenCalledWith(join(root, pdf!))
    expect(existsSync(join(root, 'Proyectos/Clínica Sol - Landing'))).toBe(true)
  })
  it('expires sent quotes past their validity whenever quotes are read', async () => {
    const { id: contactoId } = conexion.db.insert(contactos).values({ nombre: 'Hotel Aura' }).returning().get()
    const { id } = await h.cotizaciones.guardar({
      contactoId,
      nombre: 'Tienda',
      categoria: 'ecommerce',
      fecha: '2026-08-01',
      validezDias: 30,
      moneda: 'MXN',
      partidas: [{ concepto: 'Tienda', categoria: 'ecommerce', cantidad: 1, precio: 100 }],
      conIva: false,
      facturacion: 'unica',
      parcialidades: null,
      stack: null,
      terminos: null,
      notas: null,
      costosEstimados: []
    })
    await h.cotizaciones.enviar(id)
    expect((await h.cotizaciones.listar()).cotizaciones[0].estado).toBe('expirada')
  })

  const borrador = async () => {
    const { id: contactoId } = conexion.db.insert(contactos).values({ nombre: 'Estudio Ocho' }).returning().get()
    return h.cotizaciones.guardar({
      contactoId,
      nombre: 'Landing',
      categoria: 'website',
      fecha: '2026-09-16',
      validezDias: 30,
      moneda: 'MXN',
      partidas: [{ concepto: 'Landing', categoria: 'website', cantidad: 1, precio: 100 }],
      conIva: false,
      facturacion: 'unica',
      parcialidades: null,
      stack: null,
      terminos: null,
      notas: null,
      costosEstimados: []
    })
  }
  const llevarA = { borrador: [], enviada: ['enviar'], aceptada: ['enviar', 'aceptar'], rechazada: ['enviar', 'rechazar'], cancelada: ['enviar', 'cancelar'] } as const
  const hacer = (a: AccionCotizacion, f: FichaCotizacion) =>
    a === 'editar' ? h.cotizaciones.guardar({ ...f, notas: 'x' }) : a === 'borrar' ? h.cotizaciones.borrar(f.id) : h.cotizaciones[a](f.id)

  it.each(Object.keys(llevarA) as (keyof typeof llevarA)[])('offers in the Ficha exactly the actions a %s Cotización accepts', async (estado) => {
    for (const accion of ['editar', 'borrar', 'enviar', 'aceptar', 'rechazar', 'cancelar'] as const) {
      let f = await borrador()
      for (const paso of llevarA[estado]) f = await h.cotizaciones[paso](f.id)
      const ofrecida = (await h.cotizaciones.ficha(f.id)).acciones.includes(accion)
      const resultado = await Promise.resolve()
        .then(() => hacer(accion, f))
        .then(
          () => true,
          () => false
        )
      expect([accion, resultado]).toEqual([accion, ofrecida])
    }
  })
})

describe('proyectos', () => {
  it('creates a personal Proyecto with its folder in the DMM OS root, and opens it', async () => {
    const f = await h.proyectos.guardar({
      nombre: 'Portafolio',
      etiqueta: 'personal',
      contactoId: null,
      clienteFinal: null,
      categoria: 'website',
      fechaInicio: '',
      fechaEntrega: null,
      notas: null
    })
    expect(f).toMatchObject({ fechaInicio: '2026-09-16', carpeta: { estado: 'disponible', ruta: 'Proyectos/Portafolio' } })
    await h.proyectos.abrirCarpeta(f.id)
    expect(opciones.abrirCarpeta).toHaveBeenCalledWith(join(root, 'Proyectos/Portafolio'))
    expect((await h.proyectos.completar(f.id)).estado).toBe('completado')
    expect((await h.proyectos.listar()).conteo.completado).toBe(1)
  })

  let n = 0
  const personal = () =>
    h.proyectos.guardar({ nombre: `P${++n}`, etiqueta: 'personal', contactoId: null, clienteFinal: null, categoria: 'website', fechaInicio: '', fechaEntrega: null, notas: null })
  const llevarA = { en_curso: [], pausado: ['pausar'], completado: ['completar'], cancelado: ['cancelar'] } as const
  const hacer = async (a: AccionProyecto, f: FichaProyecto) => (a === 'editar' ? h.proyectos.guardar({ ...f, notas: 'x' }) : h.proyectos[a](f.id))

  it.each(ESTADOS_PROYECTO)('offers in the Ficha exactly the actions a %s Proyecto accepts', async (estado) => {
    for (const accion of ['editar', 'borrar', 'pausar', 'reanudar', 'completar', 'cancelar'] as const) {
      let f = await personal()
      for (const paso of llevarA[estado]) f = await h.proyectos[paso](f.id)
      const ofrecida = (await h.proyectos.ficha(f.id)).acciones.includes(accion)
      const resultado = await hacer(accion, f).then(
        () => true,
        () => false
      )
      expect([accion, resultado]).toEqual([accion, ofrecida])
    }
  })

  it.each(['en_curso', 'pausado'] as const)('hides and refuses Completar on an unpaid %s Proyecto, and says what is unpaid', async (estado) => {
    let f = await personal()
    conexion.db.insert(ingresos).values({ fechaRegistro: '2026-09-16', subtotal: 1000, total: 1000, categoria: 'sin_factura', proyectoId: f.id, estado: 'pendiente' }).run()
    for (const paso of llevarA[estado]) f = await h.proyectos[paso](f.id)
    f = await h.proyectos.ficha(f.id)
    expect(f.acciones).not.toContain('completar')
    expect(f.falta).toEqual({ pendientes: 1, faltante: 0, moneda: 'MXN' })
    await expect(async () => h.proyectos.completar(f.id)).rejects.toThrow(MENSAJE_SIN_PAGAR)
  })
})

describe('inicio', () => {
  it('reads what is current: Proyectos en curso, open Cotizaciones, the month as Finanzas reads it, and Tareas', async () => {
    const { id: contactoId } = conexion.db.insert(contactos).values({ nombre: 'Hotel Aura' }).returning().get()
    const cotizacion = async (nombre: string) =>
      (
        await h.cotizaciones.guardar({
          contactoId,
          nombre,
          categoria: 'website',
          fecha: '2026-09-16',
          validezDias: 30,
          moneda: 'MXN',
          partidas: [{ concepto: nombre, categoria: 'website', cantidad: 1, precio: 100_000 }],
          conIva: false,
          facturacion: 'unica',
          parcialidades: null,
          stack: null,
          terminos: null,
          notas: null,
          costosEstimados: []
        })
      ).id
    await cotizacion('Borrador')
    await h.cotizaciones.enviar(await cotizacion('Enviada'))
    const aceptada = await cotizacion('Aceptada')
    await h.cotizaciones.enviar(aceptada)
    await h.cotizaciones.aceptar(aceptada)
    const rechazada = await cotizacion('Rechazada')
    await h.cotizaciones.enviar(rechazada)
    await h.cotizaciones.rechazar(rechazada)
    const cancelada = await cotizacion('Cancelada')
    await h.cotizaciones.enviar(cancelada)
    await h.cotizaciones.cancelar(cancelada)

    const proyecto = (nombre: string) =>
      h.proyectos.guardar({ nombre, etiqueta: 'personal', contactoId: null, clienteFinal: null, categoria: 'website', fechaInicio: '', fechaEntrega: null, notas: null })
    await proyecto('En curso')
    await h.proyectos.pausar((await proyecto('Pausado')).id)
    await h.proyectos.completar((await proyecto('Completado')).id)
    await h.proyectos.cancelar((await proyecto('Cancelado')).id)
    await h.tareas.agregar('Llamar a Hotel Aura')

    const inicio = await h.inicio.resumen()
    expect(inicio.cotizaciones.map((c) => c.nombre).sort()).toEqual(['Borrador', 'Enviada'])
    expect(inicio.proyectos.map((p) => p.nombre).sort()).toEqual(['Aceptada', 'En curso'])
    expect(inicio.finanzas).toEqual(await h.finanzas.resumen('mes'))
    expect(inicio.tareas.pendientes.map((t) => t.texto)).toEqual(['Llamar a Hotel Aura'])
  })
})

describe('finanzas', () => {
  it('reads Cobranza vencida after 30 days until another number is configured', async () => {
    expect((await h.finanzas.resumen('mes')).diasVencida).toBe(30)
    await h.finanzas.configurarVencida(45)
    expect((await h.finanzas.resumen('mes')).diasVencida).toBe(45)
    expect(() => h.finanzas.configurarVencida(0)).toThrow(/mayor a cero/)
  })

  it('refuses a zero or fractional subtotal with the form\'s own message', async () => {
    const nuevo = { categoria: 'sin_factura', facturado: false, contactoId: null, proyectoId: null, fecha: '2026-09-16', conIva: false, pagado: false, notas: null } as const
    await expect(Promise.resolve().then(() => h.finanzas.nuevoIngreso({ ...nuevo, subtotal: 0 }))).rejects.toThrow(MENSAJE_MONTO)
    await expect(Promise.resolve().then(() => h.finanzas.nuevoIngreso({ ...nuevo, subtotal: 1.5 }))).rejects.toThrow(MENSAJE_MONTO)
  })
})

/**
 * Offered = accepted: every Ingreso and Costo kind, seeded once through the handlers. Each row's
 * actions come from Finanzas' summary; each action then runs through its command on a fresh copy
 * of the seeded data, and succeeds exactly when the row offered it, else is refused with its message.
 */
describe('Finanzas offers on each row exactly the actions its command accepts', () => {
  const RECHAZOS_INGRESO: Record<AccionIngreso, string> = {
    pagar: 'Solo se marca pagado un ingreso pendiente',
    cancelar: 'Solo se cancela un ingreso pendiente',
    borrar: 'Este ingreso tiene registros vinculados; cancélalo en lugar de borrarlo',
    reembolsar: 'Solo se reembolsa un ingreso pagado'
  }
  const RECHAZOS_COSTO: Record<AccionCosto, string> = {
    pagar: 'Solo se marca pagado un costo pendiente',
    cancelar: 'Solo se cancela un costo pendiente',
    borrar: 'Este costo tiene registros vinculados; cancélalo en lugar de borrarlo',
    detener: 'Este costo no pertenece a una serie que se pueda detener'
  }

  /** Each seeded row, the actions it offers, and a refusal that differs from its action's usual one. */
  type Caso<A extends string> = [nombre: string, acciones: A[], opciones?: { fueraDelResumen?: true; rechazos?: Partial<Record<A, string>> }]
  const INGRESOS: Caso<AccionIngreso>[] = [
    ['pendiente', ['pagar', 'cancelar', 'borrar']],
    ['pagado', ['borrar', 'reembolsar']],
    // Finanzas lists no cancelled Ingreso; its command still accepts only what the lifecycle allows.
    ['cancelado', ['borrar'], { fueraDelResumen: true }],
    ['con un Reembolso', ['reembolsar']],
    ['Reembolso parcial', ['borrar']],
    ['reembolsado del todo', [], { rechazos: { reembolsar: MENSAJE_REEMBOLSO_EXCEDIDO } }],
    ['Reembolso total', ['borrar']],
    ['USD pagado y reembolsado en parte', ['reembolsar']],
    ['Reembolso en USD', ['borrar']],
    ['de un CFDI', ['reembolsar']],
    ['de un Periodo', ['pagar', 'cancelar']],
    ['de un Periodo cancelado', [], { fueraDelResumen: true }]
  ]
  const COSTOS: Caso<AccionCosto>[] = [
    ['único pendiente', ['pagar', 'cancelar', 'borrar']],
    ['único pagado', ['borrar']],
    ['único cancelado', ['borrar'], { fueraDelResumen: true }],
    ['de una Cotización', ['pagar', 'cancelar']],
    ['mensual', ['pagar', 'cancelar', 'detener']],
    ['mensual detenido', ['pagar', 'cancelar']],
    ['MSI', ['pagar', 'cancelar']],
    ['anual', ['pagar', 'cancelar', 'detener']]
  ]

  const hacerIngreso = (hh: DmmHandlers, a: AccionIngreso, id: number) =>
    a === 'reembolsar' ? hh.finanzas.reembolsar(id, 1) : hh.finanzas[`${a}Ingreso` as const](id)
  const hacerCosto = (hh: DmmHandlers, a: AccionCosto, id: number) => hh.finanzas[`${a}Costo` as const](id)

  /** Every seeded row by its name in the table, through the handlers as the owner would. */
  async function sembrar(): Promise<{ ingresos: Record<string, number>; costos: Record<string, number> }> {
    const ultimo = <T extends { id: number }>(filas: T[]) => filas.reduce((a, b) => (a.id > b.id ? a : b)).id
    const ultimoIngreso = () => ultimo(conexion.db.select().from(ingresos).all())
    const ultimoCosto = () => ultimo(conexion.db.select().from(costos).all())
    const i: Record<string, number> = {}
    const c: Record<string, number> = {}

    // A monthly Cotización accepted in August, with an estimated one-time Costo: its August Periodo is cancelled.
    reloj('2026-08-16')
    const { id: contactoId } = conexion.db.insert(contactos).values({ nombre: 'Café Luna' }).returning().get()
    const { id: cotizacionId } = await h.cotizaciones.guardar({
      contactoId,
      nombre: 'Mantenimiento',
      categoria: 'website',
      fecha: '2026-08-16',
      validezDias: 30,
      moneda: 'MXN',
      partidas: [{ concepto: 'Mantenimiento', categoria: 'website', cantidad: 1, precio: 100_000 }],
      conIva: false,
      facturacion: 'mensual',
      parcialidades: null,
      stack: null,
      terminos: null,
      notas: null,
      costosEstimados: [{ concepto: 'Hosting', monto: 50_000, categoria: 'unico', parcialidades: null }]
    })
    await h.cotizaciones.enviar(cotizacionId)
    await h.cotizaciones.aceptar(cotizacionId)
    c['de una Cotización'] = ultimoCosto()
    reloj('2026-09-16')
    await h.finanzas.resumen('todo')
    const periodos = conexion.db.select().from(ingresos).all().filter((x) => x.definicionId !== null)
    i['de un Periodo cancelado'] = periodos.find((x) => x.periodo === '2026-08')!.id
    i['de un Periodo'] = periodos.find((x) => x.periodo === '2026-09')!.id
    await h.finanzas.cancelarIngreso(i['de un Periodo cancelado'])

    const ingreso = async (pagado: boolean) => {
      await h.finanzas.nuevoIngreso({ categoria: 'sin_factura', facturado: false, contactoId: null, proyectoId: null, fecha: '2026-09-16', subtotal: 1000, conIva: false, pagado, notas: null })
      return ultimoIngreso()
    }
    i['pendiente'] = await ingreso(false)
    i['pagado'] = await ingreso(true)
    i['cancelado'] = await ingreso(false)
    await h.finanzas.cancelarIngreso(i['cancelado'])
    i['con un Reembolso'] = await ingreso(true)
    await h.finanzas.reembolsar(i['con un Reembolso'], 400)
    i['Reembolso parcial'] = ultimoIngreso()
    i['reembolsado del todo'] = await ingreso(true)
    await h.finanzas.reembolsar(i['reembolsado del todo'], 1000)
    i['Reembolso total'] = ultimoIngreso()

    mkdirSync(join(root, 'Facturas', 'Emitidas', '2026'), { recursive: true })
    const mxn = '11111111-0000-4444-8888-99AABBCCDDEE'
    const usd = '22222222-0000-4444-8888-99AABBCCDDEE'
    writeFileSync(join(root, 'Facturas', 'Emitidas', '2026', 'mxn.xml'), cfdiXml({ uuid: mxn, fecha: '2026-09-01' }))
    writeFileSync(join(root, 'Facturas', 'Emitidas', '2026', 'usd.xml'), cfdiXml({ uuid: usd, fecha: '2026-09-01', moneda: 'USD', tipoCambio: '17.50' }))
    await h.importacion.facturas()
    const deCfdi = (uuid: string) => conexion.db.select().from(ingresos).where(eq(ingresos.cfdiUuid, uuid.toLowerCase())).get()!.id
    i['de un CFDI'] = deCfdi(mxn)
    i['USD pagado y reembolsado en parte'] = deCfdi(usd)
    await h.finanzas.reembolsar(i['USD pagado y reembolsado en parte'], 5_000)
    i['Reembolso en USD'] = ultimoIngreso()

    const costo = async (categoria: CategoriaCosto, pagado = false) => {
      await h.finanzas.nuevoCosto({ nombre: `Costo ${categoria}`, proveedor: null, referencia: null, categoria, proyectoId: null, fecha: '2026-09-01', subtotal: 1000, conIva: false, parcialidades: categoria === 'msi' ? 3 : null, suscripcionIa: false, pagado })
      await h.finanzas.resumen('todo')
      return ultimoCosto()
    }
    c['único pendiente'] = await costo('unico')
    c['único pagado'] = await costo('unico', true)
    c['único cancelado'] = await costo('unico')
    await h.finanzas.cancelarCosto(c['único cancelado'])
    c['mensual'] = await costo('mensual')
    c['mensual detenido'] = await costo('mensual')
    await h.finanzas.detenerCosto(c['mensual detenido'])
    c['MSI'] = await costo('msi')
    c['anual'] = await costo('anual')
    return { ingresos: i, costos: c }
  }

  let mundo: { archivo: string; ids: Awaited<ReturnType<typeof sembrar>> } | undefined
  const abiertas: Conexion[] = []
  afterEach(() => abiertas.splice(0).forEach((c) => c.close()))
  // The seeded data outlives each test, so it goes once they all have run.
  afterAll(() => mundo && rmSync(dirname(mundo.archivo), { recursive: true, force: true }))

  /** The seeded rows' ids, seeding them the first time. */
  async function ids() {
    if (!mundo) {
      const ids = await sembrar()
      const archivo = join(mkdtempSync(join(tmpdir(), 'dmm-mundo-')), 'mundo.db')
      conexion.copiarA(archivo)
      mundo = { archivo, ids }
    }
    return mundo.ids
  }

  /** Handlers on hoy, over a fresh copy of the seeded data. */
  function copia(): DmmHandlers {
    const archivo = join(temporal('dmm-copia-'), 'copia.db')
    copyFileSync(mundo!.archivo, archivo)
    const c = createDatabase(migrationsFolder).abrir(archivo)
    abiertas.push(c)
    return crearHandlers({ ...opciones, conexion: c })
  }

  const filas = async () => {
    const r = await copia().finanzas.resumen('todo')
    return {
      ingresos: new Map([...r.cobrado, ...r.cobranza, ...r.ingresos].map((f) => [f.id, f])),
      costos: new Map([...r.costosPendientes, ...r.costos].map((f) => [f.id, f]))
    }
  }

  /** The error each action ends in on a fresh copy, `null` when it succeeds. */
  async function resultados<A extends string>(acciones: readonly A[], hacer: (hh: DmmHandlers, a: A) => unknown) {
    const r: Partial<Record<A, string | null>> = {}
    for (const a of acciones)
      r[a] = await Promise.resolve()
        .then(() => hacer(copia(), a))
        .then(
          () => null,
          (e: Error) => e.message
        )
    return r
  }

  it('shows every seeded row but the cancelled ones, and no other', async () => {
    const { ingresos: i, costos: c } = await ids()
    const { ingresos: fi, costos: fc } = await filas()
    const enResumen = <A extends string>(casos: Caso<A>[], ids: Record<string, number>) =>
      casos.filter(([, , o]) => !o?.fueraDelResumen).map(([n]) => ids[n]).sort((a, b) => a - b)
    expect([...fi.keys()].sort((a, b) => a - b)).toEqual(enResumen(INGRESOS, i))
    expect([...fc.keys()].sort((a, b) => a - b)).toEqual(enResumen(COSTOS, c))
  })

  it.each(INGRESOS)('an Ingreso %s', async (nombre, acciones, o) => {
    const id = (await ids()).ingresos[nombre]
    const fila = (await filas()).ingresos.get(id)
    expect(fila?.acciones).toEqual(o?.fueraDelResumen ? undefined : acciones)
    const todas = Object.keys(RECHAZOS_INGRESO) as AccionIngreso[]
    expect(await resultados(todas, (hh, a) => hacerIngreso(hh, a, id))).toEqual(
      Object.fromEntries(todas.map((a) => [a, acciones.includes(a) ? null : (o?.rechazos?.[a] ?? RECHAZOS_INGRESO[a])]))
    )
  })

  it.each(COSTOS)('a Costo %s', async (nombre, acciones, o) => {
    const id = (await ids()).costos[nombre]
    const fila = (await filas()).costos.get(id)
    expect(fila?.acciones).toEqual(o?.fueraDelResumen ? undefined : acciones)
    const todas = Object.keys(RECHAZOS_COSTO) as AccionCosto[]
    expect(await resultados(todas, (hh, a) => hacerCosto(hh, a, id))).toEqual(
      Object.fromEntries(todas.map((a) => [a, acciones.includes(a) ? null : (o?.rechazos?.[a] ?? RECHAZOS_COSTO[a])]))
    )
  })

  it('refunds exactly what the row shows is left, and not one centavo more', async () => {
    const id = (await ids()).ingresos['USD pagado y reembolsado en parte']
    const { reembolsable } = (await filas()).ingresos.get(id)!
    expect(reembolsable).toBe(116_000 - 5_000)
    const reembolsar = (monto: number) =>
      Promise.resolve()
        .then(() => copia().finanzas.reembolsar(id, monto))
        .then(
          () => null,
          (e: Error) => e.message
        )
    expect(await reembolsar(reembolsable)).toBeNull()
    expect(await reembolsar(reembolsable + 1)).toBe(MENSAJE_REEMBOLSO_EXCEDIDO)
  })
})

/** Moves the clock to `fecha`. */
function reloj(fecha: string) {
  h = crearHandlers({ ...opciones, ahora: () => `${fecha}T10:00:00.000Z` })
}

/** A monthly Cotización for Café Luna, sent on `fecha` and valid 30 days. */
async function mensualEnviada(fecha: string) {
  const { id: contactoId } = conexion.db.insert(contactos).values({ nombre: 'Café Luna' }).returning().get()
  reloj(fecha)
  const { id } = await h.cotizaciones.guardar({
    contactoId,
    nombre: 'Mantenimiento',
    categoria: 'website',
    fecha,
    validezDias: 30,
    moneda: 'MXN',
    partidas: [{ concepto: 'Mantenimiento', categoria: 'website', cantidad: 1, precio: 100_000 }],
    conIva: false,
    facturacion: 'mensual',
    parcialidades: null,
    stack: null,
    terminos: null,
    notas: null,
    costosEstimados: []
  })
  await h.cotizaciones.enviar(id)
  return id
}

describe('Completar sobre Periodos al día', () => {
  // #76: Periodos after the accept month must be there without Finanzas being opened first.
  it('reads a monthly Proyecto’s Ingresos up to hoy in the Ficha and Completar, with Finanzas never opened', async () => {
    const id = await mensualEnviada('2026-07-16')
    const { proyectoId } = await h.cotizaciones.aceptar(id)
    conexion.db.update(ingresos).set({ estado: 'pagado' }).run()

    h = crearHandlers(opciones)
    const f = await h.proyectos.ficha(proyectoId!)
    expect(f.falta).toMatchObject({ pendientes: 2 })
    expect(f.acciones).not.toContain('completar')
    await expect(async () => h.proyectos.completar(f.id)).rejects.toThrow(MENSAJE_SIN_PAGAR)
  })
})

describe('Proyectos y Cobros al día', () => {
  it('Cobros includes the current month’s Periodo', async () => {
    const id = await mensualEnviada('2026-07-16')
    await h.cotizaciones.aceptar(id)
    h = crearHandlers(opciones)
    const { cobros } = await h.finanzas.resumen('mes')
    // July (accepted), August and September (hoy).
    expect([...cobros.mes, ...cobros.vencidos, ...cobros.porFacturar].filter((i) => i.origen === 'periodo')).toHaveLength(3)
  })

  it('the Proyectos list expires Cotizaciones past their validity, as Cotizaciones does', async () => {
    const id = await mensualEnviada('2026-07-16')
    h = crearHandlers(opciones)
    await h.proyectos.listar()
    expect(conexion.db.select().from(cotizaciones).all().find((c) => c.id === id)?.estado).toBe('expirada')
  })

  it('reading twice creates no duplicate Periodos', async () => {
    const id = await mensualEnviada('2026-07-16')
    const { proyectoId } = await h.cotizaciones.aceptar(id)
    h = crearHandlers(opciones)
    await h.proyectos.listar()
    await h.proyectos.ficha(proyectoId!)
    await h.proyectos.ficha(proyectoId!)
    // July (accepted), August and September (hoy), once each.
    expect(conexion.db.select().from(ingresos).all()).toHaveLength(3)
  })
})

describe('Contactos, Cotizaciones e Inicio al día', () => {
  it('the Ficha de Contacto reads Periodos up to hoy with Finanzas never opened, and matches Finanzas', async () => {
    const id = await mensualEnviada('2026-07-16')
    await h.cotizaciones.aceptar(id)
    const [{ id: contactoId }] = conexion.db.select().from(contactos).all()
    h = crearHandlers(opciones)

    const ficha = await h.contactos.ficha(contactoId)
    const { cobros } = await h.finanzas.resumen('mes')
    const enFinanzas = [...cobros.mes, ...cobros.vencidos, ...cobros.porFacturar].reduce((s, i) => s + i.subtotal, 0)
    // July (accepted), August and September (hoy).
    expect(ficha.porCobrar).toBe(300_000)
    expect(ficha.porCobrar).toBe(enFinanzas)
  })

  it('Inicio reads the month as Finanzas does, with Finanzas never opened', async () => {
    const id = await mensualEnviada('2026-07-16')
    await h.cotizaciones.aceptar(id)
    h = crearHandlers(opciones)
    const { finanzas } = await h.inicio.resumen()
    expect(finanzas).toEqual(await h.finanzas.resumen('mes'))
  })

  it('the Ficha de Cotización expires a quote past its validity', async () => {
    const id = await mensualEnviada('2026-07-16')
    h = crearHandlers(opciones)
    expect((await h.cotizaciones.ficha(id)).estado).toBe('expirada')
  })
})

describe('Every ledger command works Al día', () => {
  it.each(['rechazar', 'cancelar'] as const)('refuses to %s a sent quote past its validity, with no read before it', async (accion) => {
    const id = await mensualEnviada('2026-07-16')
    h = crearHandlers(opciones)
    const mensaje = accion === 'rechazar' ? 'Solo una cotización enviada se puede rechazar' : 'Solo una cotización enviada o aceptada se puede cancelar'
    await expect(async () => h.cotizaciones[accion](id)).rejects.toThrow(mensaje)
    expect((await h.cotizaciones.ficha(id)).estado).toBe('expirada')
  })

  it('refuses to accept a quote past its validity, and accepting a monthly one generates its first Periodo', async () => {
    const vencida = await mensualEnviada('2026-07-16')
    const vigente = await mensualEnviada('2026-09-16')
    h = crearHandlers(opciones)
    await expect(async () => h.cotizaciones.aceptar(vencida)).rejects.toThrow('Solo una cotización enviada se puede aceptar')
    await h.cotizaciones.aceptar(vigente)
    expect(conexion.db.select().from(ingresos).all().map((i) => i.periodo)).toEqual(['2026-09'])
  })

  it('pays an Ingreso after this month’s Periodos exist, with no read before it', async () => {
    const id = await mensualEnviada('2026-08-16')
    await h.cotizaciones.aceptar(id)
    await h.finanzas.nuevoIngreso({ categoria: 'sin_factura', facturado: false, contactoId: null, proyectoId: null, fecha: '2026-08-16', subtotal: 1000, conIva: false, pagado: false, notas: null })
    const suelto = conexion.db.select().from(ingresos).all().find((i) => i.periodo === null)!
    h = crearHandlers(opciones)
    await h.finanzas.pagarIngreso(suelto.id)
    expect(conexion.db.select().from(ingresos).all().map((i) => i.periodo)).toEqual(['2026-08', null, '2026-09'])
  })

  it('a new monthly Costo has its first Periodo as soon as it is saved', async () => {
    await h.finanzas.nuevoCosto({ nombre: 'Hosting', proveedor: null, referencia: null, categoria: 'mensual', proyectoId: null, fecha: '2026-09-01', subtotal: 1000, conIva: false, parcialidades: null, suscripcionIa: false, pagado: false })
    expect(conexion.db.select().from(costos).all().map((c) => c.periodo)).toEqual(['2026-09'])
    expect((await h.finanzas.resumen('mes')).costos.map((c) => c.nombre)).toEqual(['Hosting'])
  })

  /** August, before the clock moves: a sent quote that lapses on September 9, an accepted monthly one and a monthly Costo. */
  async function agosto() {
    const enviada = await mensualEnviada('2026-08-10')
    const aceptada = await mensualEnviada('2026-08-10')
    const { contactoId, proyectoId } = await h.cotizaciones.aceptar(aceptada)
    await h.finanzas.nuevoCosto({ nombre: 'Hosting', proveedor: null, referencia: null, categoria: 'mensual', proyectoId: null, fecha: '2026-08-01', subtotal: 1000, conIva: false, parcialidades: null, suscripcionIa: false, pagado: false })
    return { enviada, contactoId, proyectoId: proyectoId! }
  }
  type Agosto = Awaited<ReturnType<typeof agosto>>

  /** A read, called on what August left; a command, called on nothing; or an entry that never touches the ledger. */
  type Uso = ((a: Agosto) => unknown) | 'orden' | 'fuera'

  // Every entry of every section over the ledger. Typed against the handlers, so a new entry does not compile until it is listed here.
  const entradas: { [S in 'importacion' | 'contactos' | 'cotizaciones' | 'proyectos' | 'finanzas' | 'inicio' | 'ai']: Record<keyof DmmHandlers[S], Uso> } = {
    // Imported history is exempt (ADR-0002): the importer writes through the connection, and the next call brings it Al día.
    importacion: {
      facturas: 'fuera',
      carpetas: 'fuera',
      vistaPrevia: 'fuera',
      vistaPreviaDesdeCero: 'fuera',
      reimportar: 'fuera',
      estado: 'fuera',
      sugerencias: 'fuera',
      responder: 'fuera',
      aceptarVincular: 'fuera'
    },
    contactos: { listar: () => h.contactos.listar(), ficha: (a) => h.contactos.ficha(a.contactoId), guardar: 'orden', borrar: 'orden', csv: () => h.contactos.csv() },
    cotizaciones: {
      listar: () => h.cotizaciones.listar(),
      ficha: (a) => h.cotizaciones.ficha(a.enviada),
      guardar: 'orden',
      enviar: 'orden',
      aceptar: 'orden',
      rechazar: 'orden',
      cancelar: 'orden',
      borrar: 'orden',
      abrirPdf: 'orden'
    },
    proyectos: {
      listar: () => h.proyectos.listar(),
      ficha: (a) => h.proyectos.ficha(a.proyectoId),
      guardar: 'orden',
      pausar: 'orden',
      reanudar: 'orden',
      completar: 'orden',
      cancelar: 'orden',
      borrar: 'orden',
      abrirCarpeta: 'orden'
    },
    finanzas: {
      coberturaCostos: () => h.finanzas.coberturaCostos(2025, 2026),
      resumen: () => h.finanzas.resumen('mes'),
      // A setting, not the ledger.
      configurarVencida: 'fuera',
      nuevoIngreso: 'orden',
      nuevoCosto: 'orden',
      pagarIngreso: 'orden',
      cancelarIngreso: 'orden',
      borrarIngreso: 'orden',
      reembolsar: 'orden',
      pagarCosto: 'orden',
      cancelarCosto: 'orden',
      borrarCosto: 'orden',
      detenerCosto: 'orden'
    },
    inicio: { resumen: () => h.inicio.resumen() },
    // Usage and files on disk, not money.
    ai: { resumen: () => h.ai.resumen('mes'), leerUso: 'fuera', agentesYSkills: 'fuera', abrir: 'fuera' }
  }
  const casos = Object.entries(entradas).flatMap(([s, e]) =>
    Object.entries(e as Record<string, Uso>).flatMap(([n, uso]) => (uso === 'fuera' ? [] : [[`${s}.${n}`, uso] as const]))
  )

  /** Where the ledger stands: the quote that lapses, and the Periodos of both monthly series. */
  const estadoDelLedger = (a: Agosto) => ({
    enviada: conexion.db.select().from(cotizaciones).all().find((c) => c.id === a.enviada)!.estado,
    ingresos: conexion.db.select().from(ingresos).all().map((i) => i.periodo),
    costos: conexion.db.select().from(costos).all().map((c) => c.periodo)
  })
  const filas = () => [cotizaciones, proyectos, ingresos, costos].map((t) => conexion.db.select().from(t).all())
  // On 2026-09-16: the quote lapsed on the 9th, and September's Periodos exist.
  const alDiaEnSeptiembre = { enviada: 'expirada', ingresos: ['2026-08', '2026-09'], costos: ['2026-08', '2026-09'] }

  it.each(casos)('%s is the first call of the day and sees the ledger Al día', async (entrada, uso) => {
    const a = await agosto()
    expect(estadoDelLedger(a)).toEqual({ enviada: 'enviada', ingresos: ['2026-08'], costos: ['2026-08'] })
    h = crearHandlers(opciones)

    if (uso === 'orden') {
      const [s, n] = entrada.split('.') as [keyof DmmHandlers, string]
      // Called on nothing, so it changes nothing; what counts is the ledger it was judged against.
      await Promise.resolve()
        .then(() => (h[s] as unknown as Record<string, (id: number) => unknown>)[n](0))
        .catch(() => undefined)
      expect(estadoDelLedger(a)).toEqual(alDiaEnSeptiembre)
      return
    }
    // The first read already sees it Al día: reading again shows the same and changes nothing.
    const primera = await uso(a)
    expect(estadoDelLedger(a)).toEqual(alDiaEnSeptiembre)
    const antes = filas()
    expect(await uso(a)).toEqual(primera)
    expect(filas()).toEqual(antes)
  })

  it.each(['completar', 'cancelar'] as const)('a Proyecto closed with %s gets no Periodo when the month turns', async (accion) => {
    const id = await mensualEnviada('2026-08-10')
    const { proyectoId } = await h.cotizaciones.aceptar(id)
    conexion.db.update(ingresos).set({ estado: 'pagado' }).run()
    await h.proyectos[accion](proyectoId!)
    h = crearHandlers(opciones)
    await h.proyectos.ficha(proyectoId!)
    expect(conexion.db.select().from(ingresos).all().map((i) => i.periodo)).toEqual(['2026-08'])
  })
})

// Regression pins (#154): what every writer of recorded amounts records today, read back through
// Finanzas. They must hold, figure for figure, through the money-module work of #143.
describe('Montos registrados, como Finanzas los muestra hoy', () => {
  const montos = ({ subtotal, iva, retenciones, total }: FilaIngreso | FilaCosto) => ({ subtotal, iva, retenciones, total })
  /** An Ingreso as Finanzas shows it, plus the USD original recorded on its row, which no screen shows. */
  const pin = (f: FilaIngreso) => {
    const { montoOriginal, monedaOriginal } = conexion.db.select().from(ingresos).all().find((i) => i.id === f.id)!
    return { ...montos(f), moneda: f.moneda, reembolsable: f.reembolsable, montoOriginal, monedaOriginal }
  }
  const ingresosDelMes = async () => (await h.finanzas.resumen('mes')).ingresos.map(pin)
  const nuevoIngreso = { facturado: false, contactoId: null, proyectoId: null, fecha: '2026-09-16', subtotal: 123_457, conIva: true, pagado: true, notas: null } as const

  it('a hand-entered invoice Ingreso with IVA gets 16% on its subtotal, rounded to the centavo', async () => {
    await h.finanzas.nuevoIngreso({ ...nuevoIngreso, categoria: 'factura', facturado: true })
    expect(await ingresosDelMes()).toEqual([
      { subtotal: 123_457, iva: 19_753, retenciones: 0, total: 143_210, moneda: 'MXN', reembolsable: 143_210, montoOriginal: null, monedaOriginal: null }
    ])
  })

  it('an uninvoiced Ingreso carries no IVA, even asked for it', async () => {
    await h.finanzas.nuevoIngreso({ ...nuevoIngreso, categoria: 'sin_factura' })
    expect(await ingresosDelMes()).toEqual([
      { subtotal: 123_457, iva: 0, retenciones: 0, total: 123_457, moneda: 'MXN', reembolsable: 123_457, montoOriginal: null, monedaOriginal: null }
    ])
  })

  it('a hand-entered one-time Costo with IVA gets 16% on its subtotal', async () => {
    await h.finanzas.nuevoCosto({ nombre: 'Licencia', proveedor: null, referencia: null, categoria: 'unico', proyectoId: null, fecha: '2026-09-16', subtotal: 123_457, conIva: true, parcialidades: null, suscripcionIa: false, pagado: true })
    expect((await h.finanzas.resumen('mes')).costos.map(montos)).toEqual([{ subtotal: 123_457, iva: 19_753, retenciones: 0, total: 143_210 }])
  })

  it('a recurring Costo records its first vigencia with IVA, and every Periodo copies it', async () => {
    await h.finanzas.nuevoCosto({ nombre: 'Hosting', proveedor: null, referencia: null, categoria: 'mensual', proyectoId: null, fecha: '2026-07-01', subtotal: 50_001, conIva: true, parcialidades: null, suscripcionIa: false, pagado: false })
    const precio = { subtotal: 50_001, iva: 8_000, retenciones: 0, total: 58_001 }
    expect(conexion.db.select().from(vigenciasPrecio).all()).toMatchObject([{ desde: '2026-07', ...precio, montoOriginal: null, monedaOriginal: null }])
    const periodos = (await h.finanzas.resumen('todo')).costos.map((c) => ({ fecha: c.fecha, ...montos(c) }))
    expect(periodos).toEqual([
      { fecha: '2026-09-01', ...precio },
      { fecha: '2026-08-01', ...precio },
      { fecha: '2026-07-01', ...precio }
    ])
  })

  it('an accepted USD Cotización in parcialidades records each in pesos at its rate, keeping the USD original', async () => {
    const { id: contactoId } = conexion.db.insert(contactos).values({ nombre: 'Northwind' }).returning().get()
    const { id } = await h.cotizaciones.guardar({
      contactoId,
      nombre: 'App',
      categoria: 'website',
      fecha: '2026-09-16',
      validezDias: 30,
      moneda: 'USD',
      partidas: [{ concepto: 'App', categoria: 'website', cantidad: 1, precio: 100_000 }],
      conIva: true,
      facturacion: 'parcialidades',
      parcialidades: 3,
      stack: null,
      terminos: null,
      notas: null,
      costosEstimados: []
    })
    await h.cotizaciones.enviar(id)
    await h.cotizaciones.aceptar(id, 18.5)
    // US$1,000 + IVA in thirds, the remainder to the first; each third converts on its own.
    const primera = { subtotal: 616_679, iva: 98_679, retenciones: 0, total: 715_358, moneda: 'USD', reembolsable: 0, montoOriginal: 38_668, monedaOriginal: 'USD' }
    const otra = { subtotal: 616_661, iva: 98_661, retenciones: 0, total: 715_322, moneda: 'USD', reembolsable: 0, montoOriginal: 38_666, monedaOriginal: 'USD' }
    expect((await h.finanzas.resumen('mes')).cobranza.map(pin)).toEqual([primera, otra, otra])
  })

  /** Imports a CFDI with retenciones and a USD CFDI, and returns them as Finanzas lists them. */
  async function importar() {
    mkdirSync(join(root, 'Facturas', 'Emitidas', '2026'), { recursive: true })
    for (const [archivo, xml] of [
      ['retenciones.xml', cfdiXml({ uuid: '11111111-0000-4444-8888-99AABBCCDDEE', retenciones: '206.67' })],
      ['usd.xml', cfdiXml({ uuid: '22222222-0000-4444-8888-99AABBCCDDEE', moneda: 'USD', tipoCambio: '17.50' })]
    ])
      writeFileSync(join(root, 'Facturas', 'Emitidas', '2026', archivo), xml)
    expect((await h.importacion.facturas()).importados).toBe(2)
    const importados = (await h.finanzas.resumen('todo')).ingresos
    return { conRetenciones: importados.find((i) => i.moneda === 'MXN')!, usd: importados.find((i) => i.moneda === 'USD')! }
  }

  it('a Facturas import keeps the CFDI’s own figures, and a USD one its USD original', async () => {
    const { conRetenciones, usd } = await importar()
    expect(pin(conRetenciones)).toEqual({ subtotal: 100_000, iva: 16_000, retenciones: 20_667, total: 95_333, moneda: 'MXN', reembolsable: 95_333, montoOriginal: null, monedaOriginal: null })
    expect(pin(usd)).toEqual({ subtotal: 1_750_000, iva: 280_000, retenciones: 0, total: 2_030_000, moneda: 'USD', reembolsable: 116_000, montoOriginal: 116_000, monedaOriginal: 'USD' })
  })

  it('a partial Reembolso of the imported Ingreso takes its IVA and retenciones in proportion, and the final one the exact remainders', async () => {
    const { conRetenciones } = await importar()
    const reembolsos = async () => (await h.finanzas.resumen('mes')).ingresos.filter((i) => i.reembolsoDeId === conRetenciones.id).map(pin)
    const original = async () => pin((await h.finanzas.resumen('todo')).ingresos.find((i) => i.id === conRetenciones.id)!)

    await h.finanzas.reembolsar(conRetenciones.id, 30_000)
    const parcial = { subtotal: -31_469, iva: -5_035, retenciones: -6_504, total: -30_000, moneda: 'MXN', reembolsable: 0, montoOriginal: null, monedaOriginal: null }
    expect(await reembolsos()).toEqual([parcial])
    expect((await original()).reembolsable).toBe(65_333)

    await h.finanzas.reembolsar(conRetenciones.id, 65_333)
    const final = { subtotal: -68_531, iva: -10_965, retenciones: -14_163, total: -65_333, moneda: 'MXN', reembolsable: 0, montoOriginal: null, monedaOriginal: null }
    expect(await reembolsos()).toEqual([final, parcial])
    expect((await original()).reembolsable).toBe(0)
  })

  it('a Reembolso of a USD Ingreso is entered in USD and converts at that Ingreso’s own rate', async () => {
    const { usd } = await importar()
    await h.finanzas.reembolsar(usd.id, 5_000)
    const [reembolso] = (await h.finanzas.resumen('mes')).ingresos.filter((i) => i.reembolsoDeId === usd.id)
    expect(pin(reembolso)).toEqual({ subtotal: -75_431, iva: -12_069, retenciones: 0, total: -87_500, moneda: 'USD', reembolsable: 0, montoOriginal: -5_000, monedaOriginal: 'USD' })
  })
})

describe('Periodos generados', () => {
  const periodos = async () => (await h.finanzas.resumen('todo')).ingresos.filter((i) => i.origen === 'periodo')
  const costo = async (nombre: string, categoria: 'mensual' | 'msi', fecha: string, proyectoId: number | null = null) =>
    h.finanzas.nuevoCosto({ nombre, proveedor: null, referencia: null, categoria, proyectoId, fecha, subtotal: 10_000, conIva: false, parcialidades: categoria === 'msi' ? 3 : null, suscripcionIa: false, pagado: false })
  const costosDe = (nombre: string) => conexion.db.select().from(costos).all().filter((c) => c.nombre === nombre)
  const proyectoPersonal = async (nombre: string) =>
    (await h.proyectos.guardar({ nombre, etiqueta: 'personal', contactoId: null, clienteFinal: null, categoria: 'website', fechaInicio: null, fechaEntrega: null, notas: null })).id

  it('a monthly Cotización’s Ingresos reach hoy’s month once each, to be invoiced', async () => {
    const id = await mensualEnviada('2026-07-16')
    await h.cotizaciones.aceptar(id)
    reloj('2026-09-16')
    await h.finanzas.resumen('todo')
    expect((await periodos()).map((i) => [i.fecha, i.estadoFacturacion])).toEqual([
      ['2026-09-01', 'por_facturar'],
      ['2026-08-01', 'por_facturar'],
      ['2026-07-01', 'por_facturar']
    ])
  })

  it('a monthly Costo on the 31st falls on the last day of shorter months', async () => {
    reloj('2026-03-16')
    await costo('Renta', 'mensual', '2026-01-31')
    expect((await h.finanzas.resumen('todo')).costosPendientes.map((c) => c.fecha)).toEqual(['2026-01-31', '2026-02-28', '2026-03-31'])
  })

  it.each([
    ['its Proyecto is completed', (_: number, proyectoId: number): unknown => h.proyectos.completar(proyectoId)],
    ['its Proyecto is cancelled', (_: number, proyectoId: number): unknown => h.proyectos.cancelar(proyectoId)],
    ['its Cotización is cancelled', (cotizacionId: number): unknown => h.cotizaciones.cancelar(cotizacionId)]
  ] as const)('a monthly Ingreso series stops once %s', async (_, cerrar) => {
    const id = await mensualEnviada('2026-07-16')
    const { proyectoId } = await h.cotizaciones.aceptar(id)
    for (const i of await periodos()) await h.finanzas.pagarIngreso(i.id)
    await cerrar(id, proyectoId!)
    reloj('2026-11-16')
    await h.finanzas.resumen('todo')
    expect(conexion.db.select().from(ingresos).all().map((i) => i.periodo)).toEqual(['2026-07'])
  })

  it('an installment Ingreso series stops once its Cotización is cancelled', async () => {
    const id = await mensualEnviada('2026-07-16')
    await h.cotizaciones.aceptar(id)
    const { id: definicionId } = conexion.db
      .insert(definicionesIngreso)
      .values({ cotizacionId: id, tipo: 'parcialidades', numeroParcialidades: 6, categoria: 'sin_factura', subtotal: 1, total: 1, periodoInicio: '2026-07' })
      .returning()
      .get()
    await h.cotizaciones.cancelar(id)
    reloj('2026-11-16')
    await h.finanzas.resumen('todo')
    expect(conexion.db.select().from(ingresos).all().filter((i) => i.definicionId === definicionId).map((i) => i.periodo)).toEqual(['2026-07'])
  })

  it('monthly Costos stop when their Proyecto closes; MSI Costos run to their end', async () => {
    reloj('2026-01-16')
    const completado = await proyectoPersonal('Completado')
    const cancelado = await proyectoPersonal('Cancelado')
    await costo('mensual completado', 'mensual', '2026-01-05', completado)
    await costo('mensual cancelado', 'mensual', '2026-01-05', cancelado)
    await costo('msi cancelado', 'msi', '2026-01-05', cancelado)
    await h.proyectos.completar(completado)
    await h.proyectos.cancelar(cancelado)
    reloj('2026-06-16')
    await h.finanzas.resumen('todo')
    expect(costosDe('mensual completado')).toHaveLength(1)
    expect(costosDe('mensual cancelado')).toHaveLength(1)
    expect(costosDe('msi cancelado').map((c) => c.periodo)).toEqual(['2026-01', '2026-02', '2026-03'])
  })

  it('limits installments and applies a Vigencia de precio from its date forward, leaving generated periods as they were', async () => {
    reloj('2026-01-16')
    await costo('Claude Max', 'msi', '2026-01-05')
    const [{ id: definicionCostoId }] = conexion.db.select().from(definicionesCosto).all()
    conexion.db.insert(vigenciasPrecio).values({ definicionCostoId, desde: '2026-02', subtotal: 20_000, total: 20_000 }).run()
    conexion.db.update(vigenciasPrecio).set({ subtotal: 99_900, total: 99_900 }).where(eq(vigenciasPrecio.desde, '2026-01')).run()
    reloj('2026-06-16')
    expect((await h.finanzas.resumen('todo')).costos.map((c) => [c.fecha, c.total])).toEqual([
      ['2026-03-05', 20_000],
      ['2026-02-05', 20_000],
      ['2026-01-05', 10_000]
    ])
  })
})

describe('the preview is a promise', () => {
  // Próximos pagos shows a Costo for next month; once the clock reaches that month, Finanzas has
  // it as a pending Costo with that date and total. What it does not show never appears.
  const costo = async (nombre: string, categoria: 'mensual' | 'msi' | 'anual', fecha = '2026-08-05', proyectoId: number | null = null) => {
    await h.finanzas.nuevoCosto({ nombre, proveedor: null, referencia: null, categoria, proyectoId, fecha, subtotal: 100_000, conIva: false, parcialidades: categoria === 'msi' ? 3 : null, suscripcionIa: false, pagado: false })
  }
  const definicion = (nombre: string) => conexion.db.select().from(definicionesCosto).all().find((d) => d.nombre === nombre)!
  const proyectoPersonal = async () =>
    (await h.proyectos.guardar({ nombre: 'Interno', etiqueta: 'personal', contactoId: null, clienteFinal: null, categoria: 'website', fechaInicio: null, fechaEntrega: null, notas: null })).id

  it.each([
    ['a monthly Costo', (n: string) => costo(n, 'mensual'), { fecha: '2026-10-05', total: 100_000 }],
    [
      'a monthly Costo of a Proyecto later completed',
      async (n: string) => {
        const proyectoId = await proyectoPersonal()
        await costo(n, 'mensual', '2026-08-05', proyectoId)
        await h.proyectos.completar(proyectoId)
      },
      null
    ],
    [
      'a monthly Costo estimated in a Cotización whose Proyecto is completed',
      async (n: string) => {
        reloj('2026-08-05')
        const { id: contactoId } = conexion.db.insert(contactos).values({ nombre: 'Café Luna' }).returning().get()
        const { id } = await h.cotizaciones.guardar({
          contactoId,
          nombre: 'Sitio',
          categoria: 'website',
          fecha: '2026-08-05',
          validezDias: 30,
          moneda: 'MXN',
          partidas: [{ concepto: 'Sitio', categoria: 'website', cantidad: 1, precio: 300_000 }],
          conIva: false,
          facturacion: 'unica',
          parcialidades: null,
          stack: null,
          terminos: null,
          notas: null,
          costosEstimados: [{ concepto: n, monto: 50_000, categoria: 'mensual', parcialidades: null }]
        })
        await h.cotizaciones.enviar(id)
        const { proyectoId } = await h.cotizaciones.aceptar(id)
        for (const i of (await h.finanzas.resumen('todo')).cobranza) await h.finanzas.pagarIngreso(i.id)
        await h.proyectos.completar(proyectoId!)
      },
      { fecha: '2026-10-05', total: 50_000 }
    ],
    ['an MSI Costo on its last parcialidad', (n: string) => costo(n, 'msi'), { fecha: '2026-10-05', total: 100_000 }],
    ['an annual Costo', (n: string) => costo(n, 'anual', '2025-10-05'), { fecha: '2026-10-05', total: 100_000 }],
    [
      'a Costo stopped this month',
      async (n: string) => {
        await costo(n, 'mensual')
        const { id } = (await h.finanzas.resumen('mes')).costos.find((c) => c.nombre === n)!
        await h.finanzas.detenerCosto(id)
      },
      null
    ],
    [
      'a price change from next month',
      async (n: string) => {
        await costo(n, 'mensual')
        conexion.db.insert(vigenciasPrecio).values({ definicionCostoId: definicion(n).id, desde: '2026-10', subtotal: 200_000, total: 200_000 }).run()
      },
      { fecha: '2026-10-05', total: 200_000 }
    ],
    [
      'a definition with no vigencia yet for the next period',
      async (n: string) => {
        await costo(n, 'mensual')
        conexion.db.update(vigenciasPrecio).set({ desde: '2026-11' }).where(eq(vigenciasPrecio.definicionCostoId, definicion(n).id)).run()
      },
      null
    ]
  ] as const)('%s', async (_, preparar, promesa) => {
    const nombre = 'Servicio'
    await preparar(nombre)
    const deOctubre = (x: { nombre: string; fecha: string }) => x.nombre === nombre && x.fecha.startsWith('2026-10')
    const promesaDe = ({ fecha, total }: { fecha: string; total: number }) => ({ fecha, total })

    reloj('2026-09-16')
    const previsto = (await h.finanzas.resumen('mes')).proximosPagos.filter(deOctubre).map(promesaDe)
    expect(previsto).toEqual(promesa ? [promesa] : [])

    reloj('2026-10-28')
    const pendientes = (await h.finanzas.resumen('mes')).costosPendientes.filter(deOctubre).map(promesaDe)
    expect(pendientes).toEqual(previsto)
  })
})

describe('when an Ingreso counts', () => {
  it('lands on the day it was paid, and a Reembolso on the day it was given back, in Finanzas, AI and the Contacto Ficha', async () => {
    const contactoId = await h.contactos.guardar({ nombre: 'Hotel Aura', empresa: null, email: null, telefono: null, direccion: null, notas: null })
    const { id: proyectoId } = await h.proyectos.guardar({ nombre: 'Chatbot', etiqueta: 'cliente', contactoId, clienteFinal: null, categoria: 'ai', fechaInicio: '', fechaEntrega: null, notas: null })
    const enCadaPantalla = async () => ({
      finanzas: (await h.finanzas.resumen('mes')).actual.ingresos,
      ai: (await h.ai.resumen('mes')).ingresoAi,
      ficha: (await h.contactos.ficha(contactoId)).historial.filter((m) => m.tipo === 'pago').map((m) => [m.fecha, m.monto])
    })

    reloj('2026-08-20')
    await h.finanzas.nuevoIngreso({ categoria: 'sin_factura', facturado: false, contactoId: null, proyectoId, fecha: '2026-08-20', subtotal: 1000, conIva: false, pagado: false, notas: null })
    const { id } = (await h.finanzas.resumen('mes')).ingresos[0]

    reloj('2026-09-16')
    await h.finanzas.pagarIngreso(id)
    expect(await enCadaPantalla()).toEqual({ finanzas: 1000, ai: 1000, ficha: [['2026-09-16', 1000]] })
    reloj('2026-08-31')
    expect(await enCadaPantalla()).toMatchObject({ finanzas: 0, ai: 0 })

    reloj('2026-10-05')
    await h.finanzas.reembolsar(id, 400)
    expect(await enCadaPantalla()).toEqual({ finanzas: -400, ai: -400, ficha: [['2026-10-05', -400], ['2026-09-16', 1000]] })
    reloj('2026-09-30')
    expect(await enCadaPantalla()).toMatchObject({ finanzas: 1000, ai: 1000 })
  })
})
