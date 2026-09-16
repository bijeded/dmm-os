// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import type { DmmApi } from '../../../shared/ipc'
import { Configuracion } from './Configuracion'

const estado = { dir: '/v', frecuenciaDias: 7, conservar: 4, ultimo: null, respaldos: [] }
const rutas = { dmmOsRoot: '/Users/fv/Desktop/DMM OS', hddRoot: null, hddConectado: false, entrada: 0 }

beforeEach(() => {
  window.dmm = {
    respaldos: { estado: vi.fn(async () => estado), crear: vi.fn(), configurar: vi.fn(), restaurar: vi.fn() },
    rutas: { leer: vi.fn(async () => rutas), elegirHdd: vi.fn(), olvidarHdd: vi.fn(), abrir: vi.fn() },
    importacion: {
      facturas: vi.fn(),
      carpetas: vi.fn(),
      estado: vi.fn(async () => ({ facturas: null, carpetas: null })),
      sugerencias: vi.fn(async () => []),
      responder: vi.fn()
    }
  } as unknown as DmmApi
})
afterEach(cleanup)

describe('Configuración', () => {
  it('shows Ubicación, Logs and Exportar', async () => {
    render(<Configuracion />)
    expect(await screen.findByText('Ubicación')).toBeTruthy()
    expect(screen.getByText('Logs')).toBeTruthy()
    expect(screen.getByText('Exportar')).toBeTruthy()
  })
})
