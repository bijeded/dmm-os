// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { DmmApi, EstadoRespaldos } from '../../../shared/ipc'
import { Configuracion } from './Configuracion'

const estado: EstadoRespaldos = {
  dir: '/Users/fv/Desktop/Vault/Backups/DMM OS/DB',
  frecuenciaDias: 7,
  conservar: 4,
  ultimo: '2026-09-07T23:00:00.000Z',
  respaldos: [
    { archivo: 'dmm-os-2026-09-07T230000000Z-semanal.db', path: '/v/b.db', creadoEn: '2026-09-07T23:00:00.000Z', motivo: 'semanal', bytes: 2048 }
  ]
}

let api: DmmApi['respaldos']

beforeEach(() => {
  api = {
    estado: vi.fn(async () => estado),
    crear: vi.fn(async () => estado.respaldos[0]),
    configurar: vi.fn(async (c) => ({ ...estado, ...c })),
    restaurar: vi.fn(async () => ({ restaurado: false }))
  }
  window.dmm = { getAppInfo: vi.fn(), respaldos: api } as unknown as DmmApi
})
afterEach(cleanup)

describe('Configuración → Exportar', () => {
  it('shows destination, frequency, retention and existing backups', async () => {
    render(<Configuracion />)
    expect(await screen.findByText(estado.dir)).toBeTruthy()
    expect((screen.getByLabelText('Frecuencia (días)') as HTMLInputElement).value).toBe('7')
    expect((screen.getByLabelText('Respaldos a conservar') as HTMLInputElement).value).toBe('4')
    expect(screen.getByText(/semanal/i)).toBeTruthy()
  })

  it('backs up now and saves settings', async () => {
    render(<Configuracion />)
    await screen.findByText(estado.dir)
    fireEvent.click(screen.getByRole('button', { name: 'Respaldar ahora' }))
    await waitFor(() => expect(api.crear).toHaveBeenCalled())

    fireEvent.change(screen.getByLabelText('Respaldos a conservar'), { target: { value: '8' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(api.configurar).toHaveBeenCalledWith({ frecuenciaDias: 7, conservar: 8 }))
  })

  it('asks for confirmation before restoring a backup', async () => {
    render(<Configuracion />)
    await screen.findByText(estado.dir)
    fireEvent.click(screen.getByRole('button', { name: 'Restaurar' }))
    expect(api.restaurar).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Sí, restaurar' }))
    await waitFor(() => expect(api.restaurar).toHaveBeenCalledWith('/v/b.db'))
  })

  it('shows why a restore failed', async () => {
    api.restaurar = vi.fn(async () => {
      throw new Error("Error invoking remote method 'respaldos:restaurar': Error: El archivo no es un respaldo de DMM OS")
    })
    render(<Configuracion />)
    await screen.findByText(estado.dir)
    fireEvent.click(screen.getByRole('button', { name: 'Restaurar desde archivo…' }))
    fireEvent.click(screen.getByRole('button', { name: 'Sí, restaurar' }))
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'El archivo no es un respaldo de DMM OS')
  })
})
