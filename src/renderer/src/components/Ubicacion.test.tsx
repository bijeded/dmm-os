// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { Rutas } from '../../../shared/dominio'
import type { DmmApi } from '../../../shared/contrato'
import { Ubicacion } from './Ubicacion'

const rutas: Rutas = { dmmOsRoot: '/Users/fv/Desktop/DMM OS', hddRoot: null, hddConectado: false, entrada: 12 }

let api: DmmApi['rutas']

const montar = (r: Partial<Rutas> = {}) => {
  api = {
    leer: vi.fn(async () => ({ ...rutas, ...r })),
    elegirHdd: vi.fn(async () => ({ ...rutas, ...r, hddRoot: '/Volumes/Archivo HDD', hddConectado: true })),
    olvidarHdd: vi.fn(async () => ({ ...rutas, ...r, hddRoot: null, hddConectado: false })),
    abrir: vi.fn(async () => undefined)
  }
  window.dmm = { rutas: api } as unknown as DmmApi
  render(<Ubicacion />)
}

afterEach(cleanup)
beforeEach(() => vi.clearAllMocks())

describe('Configuración → Ubicación', () => {
  it('shows the DMM OS root and what is waiting in Entrada', async () => {
    montar()
    expect(await screen.findByText(rutas.dmmOsRoot)).toBeTruthy()
    expect(screen.getByText('12')).toBeTruthy()
  })

  it('opens Entrada in Finder', async () => {
    montar()
    await screen.findByText(rutas.dmmOsRoot)
    fireEvent.click(screen.getByRole('button', { name: /Abrir Entrada/i }))
    await waitFor(() => expect(api.abrir).toHaveBeenCalledWith('entrada'))
  })

  it('says the external HDD is missing until one is chosen', async () => {
    montar()
    expect(await screen.findByText(/Sin disco externo/i)).toBeTruthy()
  })

  it('points at the external HDD', async () => {
    montar()
    await screen.findByText(rutas.dmmOsRoot)
    fireEvent.click(screen.getByRole('button', { name: /Elegir disco externo/i }))
    await waitFor(() => expect(api.elegirHdd).toHaveBeenCalled())
    expect(await screen.findByText('/Volumes/Archivo HDD')).toBeTruthy()
  })

  it('shows a chosen HDD as disconnected and can forget it', async () => {
    montar({ hddRoot: '/Volumes/Archivo HDD', hddConectado: false })
    expect(await screen.findByText(/No conectado/i)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Olvidar/i }))
    await waitFor(() => expect(api.olvidarHdd).toHaveBeenCalled())
  })
})
