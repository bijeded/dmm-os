import { describe, expect, it, vi } from 'vitest'
import { registerIpc, type RespaldosHandlers } from './ipc'
import { IPC } from '../shared/ipc'

const info = { version: '0.1.0', dbPath: '/db', dmmOsRoot: '/root' }

function register(respaldos?: RespaldosHandlers) {
  const handlers = new Map<string, (...args: unknown[]) => unknown>()
  registerIpc({ handle: (ch, fn) => handlers.set(ch, fn) }, info, respaldos)
  return handlers
}

describe('registerIpc', () => {
  it('answers app info over IPC', async () => {
    expect(await register().get(IPC.getAppInfo)!({})).toEqual(info)
  })

  it('routes backup requests, passing arguments after the event', async () => {
    const estado = { dir: '/v', frecuenciaDias: 7, conservar: 4, ultimo: null, respaldos: [] }
    const respaldos: RespaldosHandlers = {
      estado: vi.fn(() => estado),
      crear: vi.fn(() => ({ archivo: 'a.db', path: '/v/a.db', creadoEn: '2026-09-13T00:00:00.000Z', motivo: 'manual' as const, bytes: 1 })),
      configurar: vi.fn(() => estado),
      restaurar: vi.fn(async () => ({ restaurado: false }))
    }
    const h = register(respaldos)

    expect(await h.get(IPC.respaldosEstado)!({})).toBe(estado)
    await h.get(IPC.respaldosCrear)!({})
    await h.get(IPC.respaldosConfigurar)!({}, { frecuenciaDias: 1, conservar: 2 })
    await h.get(IPC.respaldosRestaurar)!({}, '/v/a.db')

    expect(respaldos.crear).toHaveBeenCalled()
    expect(respaldos.configurar).toHaveBeenCalledWith({ frecuenciaDias: 1, conservar: 2 })
    expect(respaldos.restaurar).toHaveBeenCalledWith('/v/a.db')
  })
})
