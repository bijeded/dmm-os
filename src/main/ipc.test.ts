import { describe, expect, it, vi } from 'vitest'
import { contrato, crearApi, recorrerContrato, type DmmHandlers } from '../shared/ipc'
import { registerIpc } from './ipc'

const info = { version: '0.1.0', dbPath: '/db', dmmOsRoot: '/root' }
const estado = { dir: '/v', frecuenciaDias: 7, conservar: 4, ultimo: null, respaldos: [] }
const log = { importados: 0, duplicados: 0, ignorados: 0, sugerencias: 0, rfcsDesconocidos: [], errores: [], noDisponibles: [] }
const logCarpetas = {
  cotizaciones: { importadas: 0, duplicadas: 0 },
  contactos: { creados: 0 },
  proyectos: { creados: 0, actualizados: 0 },
  proyectosSinCarpeta: 0,
  sugerencias: 0,
  hddConectado: false,
  errores: [],
  noDisponibles: []
}

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
      carpetas: vi.fn(() => logCarpetas)
    },
    finanzas: {
      coberturaCostos: vi.fn(() => [{ anio: 2025, sinDatos: true }])
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
  })

  it('refuses to start with an endpoint missing its handler', () => {
    const h = handlers() as unknown as { respaldos: Record<string, unknown> }
    delete h.respaldos.crear
    expect(() => registerIpc({ handle: () => {} }, h as unknown as DmmHandlers)).toThrow('respaldos:crear')
  })
})
