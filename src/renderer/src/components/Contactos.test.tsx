// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import type { DmmApi, FilaContacto, ListaContactos } from '../../../shared/ipc'
import { Contactos } from './Contactos'

const fila = (id: number, nombre: string, estado: FilaContacto['estado'] = 'lead_frio'): FilaContacto => ({
  id,
  nombre,
  empresa: null,
  email: `${nombre.toLowerCase()}@x.mx`,
  telefono: '55 1234',
  estado,
  valor: 0
})

const lista: ListaContactos = {
  contactos: [
    fila(1, 'Café Nómada', 'cliente_activo'),
    fila(2, 'Clínica Sol', 'lead_caliente'),
    ...Array.from({ length: 11 }, (_, i) => fila(10 + i, `Zeta ${String(i).padStart(2, '0')}`))
  ],
  conteo: { lead_frio: 11, lead_caliente: 1, cliente_activo: 1, cliente_inactivo: 0 },
  top: [{ id: 1, nombre: 'Café Nómada', valor: 29_600_000, porcentaje: 100 }]
}

let api: DmmApi['contactos']
let router: ReturnType<typeof createMemoryRouter>

beforeEach(() => {
  api = { listar: vi.fn(async () => lista), ficha: vi.fn(), borrar: vi.fn(), csv: vi.fn(async () => 'nombre\r\n') }
  window.dmm = { contactos: api } as unknown as DmmApi
  router = createMemoryRouter(
    [
      { path: '/contactos', element: <Contactos /> },
      { path: '/contactos/:id', element: <p>ficha</p> }
    ],
    { initialEntries: ['/contactos'] }
  )
  render(<RouterProvider router={router} />)
})
afterEach(cleanup)

const filas = () => within(screen.getByRole('table')).getAllByRole('row').slice(1) as HTMLTableRowElement[]

describe('Contactos', () => {
  it('shows a stat card per estado and the total', async () => {
    const stats = await screen.findByRole('list', { name: 'Resumen' })
    expect(within(stats).getByText('Leads fríos').nextSibling?.textContent).toBe('11')
    expect(within(stats).getByText('Total contactos').nextSibling?.textContent).toBe('13')
  })

  it('pages the table ten at a time', async () => {
    await screen.findByText('Clínica Sol')
    expect(filas()).toHaveLength(10)
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }))
    expect(filas()).toHaveLength(3)
    expect(screen.getByText('11–13 de 13')).toBeTruthy()
  })

  it('searches by name or email, and filters by estado', async () => {
    await screen.findByText('Clínica Sol')
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'clinica' } })
    expect(filas().map((r) => r.cells[0].textContent)).toEqual(['Clínica Sol'])
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: '' } })
    fireEvent.change(screen.getByRole('combobox', { name: 'Estado' }), { target: { value: 'cliente_activo' } })
    expect(filas().map((r) => r.cells[0].textContent)).toEqual(['Café Nómada'])
  })

  it('opens the record when a row is clicked', async () => {
    fireEvent.click(await screen.findByText('Clínica Sol'))
    expect(router.state.location.pathname).toBe('/contactos/2')
  })

  it('ranks the top 10 by value with their share', async () => {
    const top = await screen.findByRole('list', { name: 'Top 10 por valor' })
    expect(top.textContent).toContain('Café Nómada')
    expect(top.textContent).toContain('$296,000.00 · 100%')
  })

  it('exports the list as CSV', async () => {
    await screen.findByText('Clínica Sol')
    URL.createObjectURL = vi.fn(() => 'blob:x')
    URL.revokeObjectURL = vi.fn()
    fireEvent.click(screen.getByRole('button', { name: 'Exportar CSV' }))
    await waitFor(() => expect(api.csv).toHaveBeenCalled())
    await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalled())
  })
})
