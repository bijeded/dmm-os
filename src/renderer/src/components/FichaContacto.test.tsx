// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import type { FichaContacto as Ficha } from '../../../shared/dominio'
import type { DmmApi } from '../../../shared/contrato'
import { FichaContacto } from './FichaContacto'

const ficha: Ficha = {
  contacto: {
    id: 7,
    nombre: 'Hotel Aura',
    empresa: 'Laura Méndez',
    rfc: 'HAU190314XX0',
    email: 'reservas@hotelaura.mx',
    telefono: '998 456 7890',
    direccion: null,
    notas: 'Prefiere WhatsApp.',
    creadoEn: '2019-03-14T10:00:00.000Z'
  },
  estado: 'cliente_activo',
  valor: 41_200_000,
  porCobrar: 2_400_000,
  proyectos: 1,
  cotizaciones: { total: 3, aceptadas: 2 },
  historial: [
    { tipo: 'pago', id: 1, fecha: '2026-09-05', referencia: null, detalle: 'Anticipo 50%', monto: 2_400_000, estado: 'pendiente' },
    { tipo: 'proyecto', id: 2, fecha: '2026-08-28', referencia: null, detalle: 'Ecommerce', monto: null, estado: 'en_curso' },
    { tipo: 'cotizacion', id: 3, fecha: '2026-08-20', referencia: '475', detalle: 'Ecommerce', monto: 4_800_000, estado: 'aceptada' }
  ],
  carpeta: 'Clientes/Hotel Aura',
  archivos: [{ nombre: 'Contrato_2026.pdf', tipo: 'PDF', modificado: '2026-08-22T10:00:00.000Z' }]
}

let api: DmmApi['contactos']
let router: ReturnType<typeof createMemoryRouter>

beforeEach(() => {
  api = { listar: vi.fn(), ficha: vi.fn(async () => ficha), borrar: vi.fn(async () => undefined), csv: vi.fn() }
  window.dmm = { contactos: api } as unknown as DmmApi
  router = createMemoryRouter(
    [
      { path: '/contactos', element: <p>lista</p> },
      { path: '/contactos/:id', element: <FichaContacto /> }
    ],
    { initialEntries: ['/contactos/7'] }
  )
  render(<RouterProvider router={router} />)
})
afterEach(cleanup)

describe('Ficha de contacto', () => {
  it('shows the data, value and derived estado', async () => {
    expect((await screen.findByRole('heading', { level: 1 })).textContent).toBe('Hotel Aura')
    expect(api.ficha).toHaveBeenCalledWith(7)
    expect(screen.getByText('Cliente activo')).toBeTruthy()
    expect(screen.getByText('$412,000.00')).toBeTruthy()
    expect(screen.getByText('3 · 67% conversión')).toBeTruthy()
    expect(screen.getByText('Prefiere WhatsApp.')).toBeTruthy()
  })

  it('filters the history by kind', async () => {
    const historial = await screen.findByRole('table', { name: 'Historial' })
    expect(within(historial).getAllByRole('row')).toHaveLength(4)
    fireEvent.click(screen.getByRole('tab', { name: 'Pagos' }))
    const filas = within(historial).getAllByRole('row').slice(1) as HTMLTableRowElement[]
    expect(filas.map((r) => r.cells[3].textContent)).toEqual(['Anticipo 50%'])
  })

  it('lists the files in its Clientes folder', async () => {
    const archivos = await screen.findByRole('table', { name: 'Archivos' })
    expect(within(archivos).getByText('Contrato_2026.pdf')).toBeTruthy()
    expect(screen.getByText('Clientes/Hotel Aura/')).toBeTruthy()
  })

  it('asks before deleting, then returns to the list', async () => {
    fireEvent.click(await screen.findByRole('button', { name: 'Eliminar' }))
    const dialogo = screen.getByRole('dialog')
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Cancelar' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(api.borrar).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Eliminar' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Sí, eliminar' }))
    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/contactos'))
    expect(api.borrar).toHaveBeenCalledWith(7)
  })

  it('says why main refused to delete', async () => {
    vi.mocked(api.borrar).mockRejectedValue(new Error("Error invoking remote method 'contactos:borrar': Error: contacto 7 tiene registros vinculados; cancélalo en lugar de borrarlo"))
    fireEvent.click(await screen.findByRole('button', { name: 'Eliminar' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Sí, eliminar' }))
    expect((await screen.findByRole('alert')).textContent).toMatch(/registros vinculados/)
    expect(router.state.location.pathname).toBe('/contactos/7')
  })
})
