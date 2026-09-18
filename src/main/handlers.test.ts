import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createDatabase, type Conexion } from './db'
import { contactos } from './db/schema'
import { crearHandlers, type HandlersOptions } from './handlers'
import type { DmmHandlers } from '../shared/contrato'

const migrationsFolder = resolve(import.meta.dirname, '../../drizzle')

let root: string
let conexion: Conexion
let opciones: HandlersOptions
let h: DmmHandlers

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'dmm-handlers-'))
  conexion = createDatabase(migrationsFolder).abrir(':memory:')
  opciones = {
    conexion,
    info: { version: '0.1.0', dbPath: ':memory:', dmmOsRoot: root },
    respaldos: {
      estado: vi.fn(),
      crear: vi.fn(),
      configurar: vi.fn(),
      restaurar: vi.fn(() => ({ restaurado: true }))
    } as unknown as HandlersOptions['respaldos'],
    elegirRespaldo: vi.fn(async () => undefined),
    elegirHdd: vi.fn(async () => undefined),
    abrirCarpeta: vi.fn(async () => ''),
    imprimirPdf: vi.fn(async () => new TextEncoder().encode('%PDF')),
    ahora: () => '2026-09-16T10:00:00.000Z'
  }
  h = crearHandlers(opciones)
})

describe('el disco externo', () => {
  it('remembers the chosen drive, and the folder scan reads it', async () => {
    const hdd = mkdtempSync(join(tmpdir(), 'dmm-hdd-'))
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
})

describe('finanzas', () => {
  it('reads Cobranza vencida after 30 days until another number is configured', async () => {
    expect((await h.finanzas.resumen('mes')).diasVencida).toBe(30)
    await h.finanzas.configurarVencida(45)
    expect((await h.finanzas.resumen('mes')).diasVencida).toBe(45)
    expect(() => h.finanzas.configurarVencida(0)).toThrow(/mayor a cero/)
  })
})
