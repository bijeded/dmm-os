// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { EstadoImportacion, Sugerencia } from '../../../shared/dominio'
import type { DmmApi } from '../../../shared/contrato'
import { Logs } from './Logs'

const vincular: Sugerencia = {
  id: 1,
  accion: 'vincular',
  entidad: 'cotizacion',
  motivo: 'carpeta "Sonrieme" con el mismo nombre',
  creadoEn: '2026-09-12T09:14:00.000Z',
  registro: 'Cotización 475 · Sonrieme',
  destino: 'Sonrieme'
}
const ubicacion: Sugerencia = {
  id: 2,
  accion: 'ubicacion',
  entidad: 'proyecto',
  motivo: 'cotización 300 aceptada sin carpeta: ¿archivado o no disponible?',
  creadoEn: '2026-09-12T09:14:01.000Z',
  registro: 'Proyecto Hotel Aura',
  destino: null
}

const estado: EstadoImportacion = {
  facturas: null,
  carpetas: {
    corridoEn: '2026-09-12T09:14:00.000Z',
    log: {
      cotizaciones: { importadas: 3, duplicadas: 211 },
      contactos: { creados: 2 },
      proyectos: { creados: 5, actualizados: 1 },
      proyectosSinCarpeta: 1,
      sugerencias: 2,
      hddConectado: false,
      errores: [{ archivo: 'Cotizaciones/2018/roto.pdf', error: 'PDF inválido' }],
      noDisponibles: ['Proyectos (HDD externo)']
    }
  }
}

let api: DmmApi['importacion']

const montar = (sugerencias: Sugerencia[] = [vincular, ubicacion], e: EstadoImportacion = estado) => {
  api = {
    facturas: vi.fn(async () => ({ importados: 0, duplicados: 0, ignorados: 0, sugerencias: 0, rfcsDesconocidos: [], errores: [], noDisponibles: [] })),
    carpetas: vi.fn(async () => e.carpetas!.log),
    estado: vi.fn(async () => e),
    sugerencias: vi.fn(async () => sugerencias),
    responder: vi.fn(async () => [])
  }
  window.dmm = { importacion: api } as unknown as DmmApi
  render(<Logs />)
}

afterEach(cleanup)
beforeEach(() => vi.clearAllMocks())

describe('Configuración → Logs', () => {
  it('shows what the last rescan found, errors included', async () => {
    montar()
    expect(await screen.findByText(/3 importadas/)).toBeTruthy()
    expect(screen.getByText(/PDF inválido/)).toBeTruthy()
    expect(screen.getByText(/Proyectos \(HDD externo\)/)).toBeTruthy()
  })

  it('runs the rescan and the CFDI import from here', async () => {
    montar()
    await screen.findByText(/3 importadas/)
    fireEvent.click(screen.getByRole('button', { name: /Re-escanear carpetas/i }))
    await waitFor(() => expect(api.carpetas).toHaveBeenCalled())
    fireEvent.click(screen.getByRole('button', { name: /Importar facturas/i }))
    await waitFor(() => expect(api.facturas).toHaveBeenCalled())
  })

  it('lists each Sugerencia with what was guessed and why', async () => {
    montar()
    expect(await screen.findByText('Cotización 475 · Sonrieme')).toBeTruthy()
    expect(screen.getByText(/carpeta "Sonrieme" con el mismo nombre/)).toBeTruthy()
  })

  it('accepts a Sugerencia once and stops asking', async () => {
    montar([vincular])
    await screen.findByText('Cotización 475 · Sonrieme')
    fireEvent.click(screen.getByRole('button', { name: 'Aceptar' }))
    await waitFor(() => expect(api.responder).toHaveBeenCalledWith(1, 'aceptada'))
    await waitFor(() => expect(screen.queryByText('Cotización 475 · Sonrieme')).toBe(null))
  })

  it('rejects a Sugerencia', async () => {
    montar([vincular])
    await screen.findByText('Cotización 475 · Sonrieme')
    fireEvent.click(screen.getByRole('button', { name: 'Rechazar' }))
    await waitFor(() => expect(api.responder).toHaveBeenCalledWith(1, 'rechazada'))
  })

  it('asks an ubicación as Archivado or No disponible', async () => {
    montar([ubicacion])
    await screen.findByText('Proyecto Hotel Aura')
    expect(screen.queryByRole('button', { name: 'Aceptar' })).toBe(null)
    fireEvent.click(screen.getByRole('button', { name: 'Archivado' }))
    await waitFor(() => expect(api.responder).toHaveBeenCalledWith(2, 'aceptada'))
  })

  it('says so when nothing is waiting', async () => {
    montar([])
    expect(await screen.findByText(/Sin sugerencias pendientes/i)).toBeTruthy()
  })
})
