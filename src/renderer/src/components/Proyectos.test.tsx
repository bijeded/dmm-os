// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import type { DmmApi, FichaProyecto as Ficha, FilaProyecto, ListaContactos, ListaProyectos } from '../../../shared/ipc'
import { FichaProyecto } from './FichaProyecto'
import { NuevoProyecto } from './NuevoProyecto'
import { Proyectos } from './Proyectos'

const fila = (id: number, nombre: string, cambios: Partial<FilaProyecto> = {}): FilaProyecto => ({
  id,
  referencia: `PRY-00${id}`,
  nombre,
  etiqueta: 'cliente',
  contactoId: id,
  contacto: 'Clínica Sol',
  clienteFinal: null,
  categoria: 'website',
  fechaInicio: '2026-09-01',
  estado: 'en_curso',
  carpeta: { estado: 'disponible', ruta: `Proyectos/${nombre}`, abrible: true },
  sinIngresosRegistrados: false,
  ...cambios
})

const lista: ListaProyectos = {
  proyectos: [
    fila(3, 'Portafolio', { etiqueta: 'personal', contactoId: null, contacto: null, categoria: 'ai' }),
    fila(2, 'Tienda', { contacto: 'Hotel Aura', contactoId: 2, estado: 'completado', fechaInicio: '2025-03-01', carpeta: { estado: 'archivado', ruta: 'Archivo/Proyectos/Tienda', abrible: false }, sinIngresosRegistrados: true }),
    fila(1, 'Campaña', { estado: 'pausado', carpeta: { estado: 'no_disponible', ruta: 'Proyectos/Campaña', abrible: false } })
  ],
  conteo: { en_curso: 1, pausado: 1, completado: 1, cancelado: 0 },
  porCategoria: { website: 2, ecommerce: 0, app: 0, ai: 1, marketing: 0, other: 0 }
}

const ficha: Ficha = {
  id: 1,
  referencia: 'PRY-001',
  nombre: 'Sitio web',
  etiqueta: 'cliente',
  estado: 'en_curso',
  contactoId: 7,
  contacto: 'Clínica Sol',
  clienteFinal: 'Hospital Jardín',
  categoria: 'website',
  cotizacionId: 4,
  folio: '520',
  fechaInicio: '2026-09-01',
  fechaEntrega: null,
  fechaFin: null,
  notas: null,
  carpeta: { estado: 'disponible', ruta: 'Proyectos/Clínica Sol - Sitio web', abrible: true },
  porCobrar: 2_400_000,
  cobrado: 0,
  falta: { pendientes: 1, faltante: 2_784_000, moneda: 'MXN' },
  acciones: ['editar', 'pausar', 'cancelar']
}

const contactos: ListaContactos = {
  contactos: [{ id: 7, nombre: 'Clínica Sol', empresa: null, email: null, telefono: null, estado: 'lead_frio', valor: 0 }],
  conteo: { lead_frio: 1, lead_caliente: 0, cliente_activo: 0, cliente_inactivo: 0 },
  top: []
}

let api: DmmApi['proyectos']
let router: ReturnType<typeof createMemoryRouter>

const montar = (ruta: string) => {
  router = createMemoryRouter(
    [
      { path: '/proyectos', element: <Proyectos /> },
      { path: '/proyectos/nuevo', element: <NuevoProyecto /> },
      { path: '/proyectos/:id', element: <FichaProyecto /> },
      { path: '/proyectos/:id/editar', element: <NuevoProyecto /> }
    ],
    { initialEntries: [ruta] }
  )
  render(<RouterProvider router={router} />)
}

beforeEach(() => {
  api = {
    listar: vi.fn(async () => lista),
    ficha: vi.fn(async () => ficha),
    guardar: vi.fn(async () => ({ ...ficha, id: 9 })),
    pausar: vi.fn(async () => ({ ...ficha, estado: 'pausado' as const, acciones: ['editar' as const, 'reanudar' as const, 'cancelar' as const] })),
    reanudar: vi.fn(async () => ficha),
    completar: vi.fn(async () => ficha),
    cancelar: vi.fn(async () => ({ ...ficha, estado: 'cancelado' as const, acciones: [] })),
    borrar: vi.fn(async () => {}),
    abrirCarpeta: vi.fn(async () => {})
  }
  window.dmm = { proyectos: api, contactos: { listar: vi.fn(async () => contactos) } } as unknown as DmmApi
})

afterEach(cleanup)

describe('Proyectos', () => {
  it('shows the counts by estado, newest first, and each folder as it is', async () => {
    montar('/proyectos')
    const resumen = await screen.findByRole('list', { name: 'Resumen' })
    expect(within(resumen).getByText('Total proyectos').nextSibling!.textContent).toBe('3')
    const filas = screen.getAllByRole('row').slice(1)
    expect(filas.map((f) => f.querySelector('td')!.textContent)).toEqual(['PRY-003', 'PRY-002', 'PRY-001'])
    expect(within(filas[0]).getByText('Personal')).toBeTruthy()
    expect(within(filas[1]).getByText('Archivado')).toBeTruthy()
    expect(within(filas[2]).getByText('No disponible')).toBeTruthy()

    fireEvent.click(within(filas[0]).getByRole('button', { name: 'Abrir' }))
    await waitFor(() => expect(api.abrirCarpeta).toHaveBeenCalledWith(3))
  })

  it('flags a completed Proyecto whose Ingresos were never registered, and filters by it', async () => {
    montar('/proyectos')
    await screen.findByText('PRY-003')
    const filas = screen.getAllByRole('row').slice(1)
    expect(within(filas[1]).getByText('Sin ingresos registrados')).toBeTruthy()
    expect(within(filas[0]).queryByText('Sin ingresos registrados')).toBeNull()

    fireEvent.click(screen.getByRole('checkbox', { name: 'Sin ingresos registrados' }))
    expect(screen.getAllByRole('row').slice(1).map((f) => f.querySelector('td')!.textContent)).toEqual(['PRY-002'])
  })

  it('filters by estado and search', async () => {
    montar('/proyectos')
    await screen.findByText('PRY-003')
    fireEvent.change(screen.getByRole('combobox', { name: 'Estado' }), { target: { value: 'pausado' } })
    expect(screen.getAllByRole('row')).toHaveLength(2)
    fireEvent.change(screen.getByRole('combobox', { name: 'Estado' }), { target: { value: '' } })
    fireEvent.change(screen.getByPlaceholderText(/Buscar/), { target: { value: 'hotel' } })
    expect(screen.getAllByRole('row')).toHaveLength(2)
  })
})

describe('FichaProyecto', () => {
  it('shows what is still to be paid, and only the actions its estado allows', async () => {
    montar('/proyectos/1')
    expect(await screen.findByRole('heading', { name: 'Sitio web' })).toBeTruthy()
    const completar = screen.getByRole('button', { name: 'Completar' })
    expect(completar).toHaveProperty('disabled', true)
    expect(document.getElementById(completar.getAttribute('aria-describedby')!)!.textContent).toMatch(
      /1 pago pendiente por cobrar · faltan \$27,840\.00 para el total de la cotización/
    )
    fireEvent.click(screen.getByRole('button', { name: 'Pausar' }))
    expect(await screen.findByRole('button', { name: 'Reanudar' })).toBeTruthy()
  })

  it('cancels, cascading to its Cotización', async () => {
    montar('/proyectos/1')
    fireEvent.click(await screen.findByRole('button', { name: 'Cancelar proyecto' }))
    await waitFor(() => expect(api.cancelar).toHaveBeenCalledWith(1))
    expect(await screen.findByText('Cancelado')).toBeTruthy()
  })
})

describe('NuevoProyecto', () => {
  it('creates a personal Proyecto without Contacto', async () => {
    montar('/proyectos/nuevo')
    fireEvent.change(await screen.findByLabelText('Nombre'), { target: { value: 'Portafolio' } })
    fireEvent.change(screen.getByLabelText('Tipo'), { target: { value: 'personal' } })
    expect(screen.queryByLabelText('Contacto')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Crear proyecto' }))
    await waitFor(() => expect(api.guardar).toHaveBeenCalledWith(expect.objectContaining({ nombre: 'Portafolio', etiqueta: 'personal', contactoId: null })))
    await waitFor(() => expect(router.state.location.pathname).toBe('/proyectos/9'))
  })

  it('asks for a Contacto for a client Proyecto', async () => {
    montar('/proyectos/nuevo')
    fireEvent.change(await screen.findByLabelText('Nombre'), { target: { value: 'Sitio' } })
    fireEvent.click(screen.getByRole('button', { name: 'Crear proyecto' }))
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Elige un contacto')
    expect(api.guardar).not.toHaveBeenCalled()
  })
})
