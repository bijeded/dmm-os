import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createDatabase, type Conexion } from './db'
import { contactos, costos, cotizaciones, ingresos, proyectos, vigenciasPrecio } from './db/schema'
import { MENSAJE_SIN_PAGAR } from './ciclo-proyecto'
import { crearHandlers, type HandlersOptions } from './handlers'
import { MENSAJE_MONTO } from '../shared/montos'
import { cfdiXml } from './test-cfdi'
import type { DmmHandlers } from '../shared/contrato'
import { ESTADOS_PROYECTO, type AccionCosto, type AccionCotizacion, type AccionIngreso, type AccionProyecto, type FichaCotizacion, type FichaProyecto, type FilaCosto, type FilaIngreso } from '../shared/dominio'

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
    ejecutarUso: vi.fn(async () => {
      throw new Error('no está instalado')
    }),
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

  /** Runs `accion` on the row and checks it succeeds exactly when the row offered it. */
  async function ofreceLoQueAcepta<A extends string>(acciones: readonly A[], preparar: () => Promise<{ id: number; acciones: A[] }>, hacer: (a: A, id: number) => unknown) {
    for (const accion of acciones) {
      const fila = await preparar()
      const resultado = await Promise.resolve()
        .then(() => hacer(accion, fila.id))
        .then(
          () => true,
          () => false
        )
      expect([accion, resultado]).toEqual([accion, fila.acciones.includes(accion)])
    }
  }

  const ingreso = async (pagado: boolean) => {
    await h.finanzas.nuevoIngreso({ categoria: 'sin_factura', facturado: false, contactoId: null, proyectoId: null, fecha: '2026-09-16', subtotal: 1000, conIva: false, pagado, notas: null })
    return (await h.finanzas.resumen('mes')).ingresos.reduce((a, b) => (a.id > b.id ? a : b))
  }
  const filaIngreso = async (id: number) => (await h.finanzas.resumen('mes')).ingresos.find((i) => i.id === id)!
  const hacerIngreso = (a: AccionIngreso, id: number) =>
    a === 'reembolsar' ? h.finanzas.reembolsar(id, 1) : h.finanzas[`${a}Ingreso` as const](id)
  const accionesIngreso = ['pagar', 'cancelar', 'borrar', 'reembolsar'] as const

  it.each([
    ['pendiente', () => ingreso(false)],
    ['pagado', () => ingreso(true)],
    [
      'reembolsado del todo',
      async () => {
        const { id } = await ingreso(true)
        await h.finanzas.reembolsar(id, 1000)
        return filaIngreso(id)
      }
    ]
  ] as const)('offers on a %s Ingreso exactly the actions it accepts', async (_, preparar) => {
    await ofreceLoQueAcepta(accionesIngreso, preparar, hacerIngreso)
  })

  let n = 0
  const costo = async (categoria: 'unico' | 'mensual' | 'msi', pagado = false) => {
    const nombre = `C${++n}`
    await h.finanzas.nuevoCosto({ nombre, proveedor: null, referencia: null, categoria, proyectoId: null, fecha: '2026-09-01', subtotal: 1000, conIva: false, parcialidades: categoria === 'msi' ? 3 : null, suscripcionIa: false, pagado })
    return (await h.finanzas.resumen('mes')).costos.find((c) => c.nombre === nombre)!
  }
  const accionesCosto = ['pagar', 'cancelar', 'borrar', 'detener'] as const
  const hacerCosto = (a: AccionCosto, id: number) => h.finanzas[`${a}Costo` as const](id)

  it.each([
    ['pendiente', () => costo('unico')],
    ['pagado', () => costo('unico', true)],
    ['mensual', () => costo('mensual')],
    ['MSI', () => costo('msi')],
    [
      'mensual detenido',
      async () => {
        const { id, nombre } = await costo('mensual')
        await h.finanzas.detenerCosto(id)
        return (await h.finanzas.resumen('mes')).costos.find((c) => c.nombre === nombre)!
      }
    ]
  ] as const)('offers on a %s Costo exactly the actions it accepts', async (_, preparar) => {
    await ofreceLoQueAcepta(accionesCosto, preparar, hacerCosto)
  })
})

/** A monthly Cotización for Café Luna, sent on `fecha` and valid 30 days. */
async function mensualEnviada(fecha: string) {
  const { id: contactoId } = conexion.db.insert(contactos).values({ nombre: 'Café Luna' }).returning().get()
  h = crearHandlers({ ...opciones, ahora: () => `${fecha}T10:00:00.000Z` })
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
    importacion: { facturas: 'fuera', carpetas: 'fuera', estado: 'fuera', sugerencias: 'fuera', responder: 'fuera' },
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
