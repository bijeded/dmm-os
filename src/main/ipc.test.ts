import { describe, expect, it, vi } from 'vitest'
import { type ResumenAi, type ResumenFinanzas } from '../shared/dominio'
import { contrato, crearApi, recorrerContrato, type DmmHandlers } from '../shared/contrato'
import { registerIpc } from './ipc'

const info = { version: '0.1.0', dbPath: '/db', dmmOsRoot: '/root' }
const estado = { dir: '/v', frecuenciaDias: 7, conservar: 4, ultimo: null, respaldos: [] }
const log = { importados: 0, duplicados: 0, ignorados: 0, sugerencias: 0, rfcsDesconocidos: [], ivasInusuales: [], errores: [], noDisponibles: [], cancelados: 0, sustituidos: 0, recibidas: 0, noCfdi: [], cambios: { cancelados: [], refechados: [], divididos: [], intactos: [] } }
const logCarpetas = {
  cotizaciones: { importadas: 0, duplicadas: 0 },
  contactos: { creados: 0 },
  proyectos: { creados: 0, actualizados: 0 },
  proyectosSinCarpeta: 0,
  sugerencias: 0,
  hddConectado: false,
  errores: [],
  noDisponibles: [],
  mapa: 'ausente' as const,
  filasMapa: [],
  subcarpetasSinProyecto: [],
  proyectosSinContacto: [],
  nuevos: { contactos: [], proyectos: [], rfcs: [], cotizaciones: [] },
  cotizacionesIncompletas: []
}

const rutas = { dmmOsRoot: '/root', hddRoot: null, hddConectado: false, entrada: 0 }

const sinFicha = vi.fn((): never => {
  throw new Error('sin ficha')
})

function handlers() {
  return {
    getAppInfo: vi.fn(() => info),
    respaldos: {
      estado: vi.fn(() => estado),
      crear: vi.fn(() => ({ archivo: 'a.db', path: '/v/a.db', creadoEn: '2026-09-13T00:00:00.000Z', motivo: 'manual' as const, bytes: 1 })),
      configurar: vi.fn(() => estado),
      restaurar: vi.fn(async () => ({ restaurado: false }))
    },
    importacion: {
      facturas: vi.fn(() => log),
      carpetas: vi.fn(() => logCarpetas),
      vistaPrevia: vi.fn(() => logCarpetas),
      vistaPreviaDesdeCero: vi.fn(() => ({ log: logCarpetas, bloqueos: [] })),
      reimportar: vi.fn(() => ({ reimportado: false as const, bloqueos: [] })),
      estado: vi.fn(() => ({ facturas: null, carpetas: null })),
      sugerencias: vi.fn(() => []),
      responder: vi.fn(() => []),
      aceptarVincular: vi.fn(() => [])
    },
    rutas: {
      leer: vi.fn(() => rutas),
      elegirHdd: vi.fn(async () => rutas),
      olvidarHdd: vi.fn(() => rutas),
      abrir: vi.fn()
    },
    contactos: {
      listar: vi.fn(() => ({ contactos: [], conteo: { lead_frio: 0, lead_caliente: 0, cliente_activo: 0, cliente_inactivo: 0 }, top: [] })),
      guardar: vi.fn(() => 1),
      ficha: vi.fn(() => {
        throw new Error('sin ficha')
      }),
      borrar: vi.fn(),
      csv: vi.fn(() => '')
    },
    catalogo: {
      listar: vi.fn(() => []),
      guardar: vi.fn(() => []),
      borrar: vi.fn(() => [])
    },
    cotizaciones: {
      listar: vi.fn(() => ({
        cotizaciones: [],
        resumen: { total: 0, enviadas: 0, conversion: 0, montoAbiertas: 0, promedio: 0 },
        porCategoria: { website: 0, ecommerce: 0, app: 0, ai: 0, marketing: 0, other: 0 }
      })),
      ficha: vi.fn(() => {
        throw new Error('sin ficha')
      }),
      guardar: vi.fn(() => {
        throw new Error('sin ficha')
      }),
      enviar: vi.fn(async () => {
        throw new Error('sin ficha')
      }),
      aceptar: vi.fn(() => {
        throw new Error('sin ficha')
      }),
      rechazar: vi.fn(() => {
        throw new Error('sin ficha')
      }),
      cancelar: vi.fn(() => {
        throw new Error('sin ficha')
      }),
      borrar: vi.fn(),
      abrirPdf: vi.fn(async () => {})
    },
    proyectos: {
      listar: vi.fn(() => ({
        proyectos: [],
        conteo: { en_curso: 0, pausado: 0, completado: 0, cancelado: 0 },
        porCategoria: { website: 0, ecommerce: 0, app: 0, ai: 0, marketing: 0, other: 0 }
      })),
      ficha: sinFicha,
      guardar: sinFicha,
      pausar: sinFicha,
      reanudar: sinFicha,
      completar: sinFicha,
      cancelar: sinFicha,
      borrar: vi.fn(),
      abrirCarpeta: vi.fn(async () => {}),
      opcionesCobro: sinFicha,
      completarConCobro: sinFicha
    },
    finanzas: {
      coberturaCostos: vi.fn(() => [{ anio: 2025, sinDatos: true }]),
      resumen: vi.fn(() => ({}) as ResumenFinanzas),
      configurarVencida: vi.fn(),
      nuevoIngreso: vi.fn(),
      nuevoCosto: vi.fn(),
      pagarIngreso: vi.fn(),
      cancelarIngreso: vi.fn(),
      borrarIngreso: vi.fn(),
      reembolsar: vi.fn(),
      pagarCosto: vi.fn(),
      cancelarCosto: vi.fn(),
      borrarCosto: vi.fn(),
      detenerCosto: vi.fn()
    },
    tareas: {
      listar: vi.fn(() => ({ pendientes: [], hechas: [], diasHechas: 30 })),
      agregar: vi.fn(() => ({ pendientes: [], hechas: [], diasHechas: 30 })),
      completar: vi.fn(() => ({ pendientes: [], hechas: [], diasHechas: 30 })),
      borrar: vi.fn(() => ({ pendientes: [], hechas: [], diasHechas: 30 }))
    },
    inicio: {
      resumen: vi.fn(() => ({ finanzas: {} as ResumenFinanzas, proyectos: [], cotizaciones: [], tareas: { pendientes: [], hechas: [], diasHechas: 30 } }))
    },
    lab: {
      carpetas: vi.fn(() => [{ nombre: 'Benchmarks', archivos: 0 }]),
      archivos: vi.fn(() => []),
      buscar: vi.fn(() => []),
      vistaPrevia: vi.fn(() => null),
      abrir: vi.fn(async () => {})
    },
    ai: {
      resumen: vi.fn(() => ({} as ResumenAi)),
      leerUso: vi.fn(async () => ({ ultimoEscaneo: null, avisos: [] })),
      agentesYSkills: vi.fn(() => []),
      abrir: vi.fn(async () => {})
    }
  } satisfies DmmHandlers
}

/** Wires the renderer API to main handlers through a fake IPC, as Electron would. */
function conectar(h: DmmHandlers) {
  const registrados = new Map<string, (event: unknown, ...args: unknown[]) => unknown>()
  registerIpc({ handle: (canal, fn) => registrados.set(canal, fn) }, h)
  const api = crearApi(async (canal, ...args) => registrados.get(canal)!({}, ...args))
  return { api, registrados }
}

describe('IPC contract', () => {
  it('registers exactly one channel per endpoint', () => {
    const canales: string[] = []
    recorrerContrato(contrato, (canal) => canales.push(canal))
    expect([...conectar(handlers()).registrados.keys()]).toEqual(canales)
    expect(canales).toContain('respaldos:estado')
    expect(canales).toEqual(expect.arrayContaining(['importacion:vistaPreviaDesdeCero', 'importacion:reimportar', 'importacion:aceptarVincular']))
    expect(canales).toEqual(expect.arrayContaining(['lab:carpetas', 'lab:archivos', 'lab:buscar', 'lab:vistaPrevia', 'lab:abrir', 'ai:resumen', 'ai:leerUso', 'ai:agentesYSkills', 'ai:abrir']))
  })

  it('round-trips calls and arguments from the renderer API to main handlers', async () => {
    const h = handlers()
    const { api } = conectar(h)

    expect(await api.getAppInfo()).toEqual(info)
    expect(await api.respaldos.estado()).toBe(estado)
    await api.respaldos.crear()
    await api.respaldos.configurar({ frecuenciaDias: 1, conservar: 2 })
    expect(await api.respaldos.restaurar('/v/a.db')).toEqual({ restaurado: false })

    expect(h.respaldos.crear).toHaveBeenCalled()
    expect(h.respaldos.configurar).toHaveBeenCalledWith({ frecuenciaDias: 1, conservar: 2 })
    expect(h.respaldos.restaurar).toHaveBeenCalledWith('/v/a.db')

    expect(await api.importacion.reimportar()).toEqual({ reimportado: false, bloqueos: [] })
    expect(await api.importacion.vistaPreviaDesdeCero()).toEqual({ log: logCarpetas, bloqueos: [] })
    expect(await api.importacion.aceptarVincular()).toEqual([])
    expect(h.importacion.reimportar).toHaveBeenCalled()
    expect(h.importacion.aceptarVincular).toHaveBeenCalled()

    await api.lab.abrir('Benchmarks/a.md')
    expect(h.lab.abrir).toHaveBeenCalledWith('Benchmarks/a.md')

    await api.ai.resumen('todo')
    expect(h.ai.resumen).toHaveBeenCalledWith('todo')

    expect(await api.ai.agentesYSkills()).toEqual([])
    await api.ai.abrir('agents/code-reviewer.md')
    expect(h.ai.abrir).toHaveBeenCalledWith('agents/code-reviewer.md')
  })

  it('refuses to start with an endpoint missing its handler', () => {
    const h = handlers() as unknown as { respaldos: Record<string, unknown> }
    delete h.respaldos.crear
    expect(() => registerIpc({ handle: () => {} }, h as unknown as DmmHandlers)).toThrow('respaldos:crear')
  })
})
