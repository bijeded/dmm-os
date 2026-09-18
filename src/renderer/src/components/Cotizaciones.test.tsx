// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import type { DmmApi, FichaCotizacion as Ficha, FilaCotizacion, ListaCotizaciones } from '../../../shared/ipc'
import { Cotizaciones } from './Cotizaciones'
import { FichaCotizacion } from './FichaCotizacion'
import { NuevaCotizacion } from './NuevaCotizacion'

const fila = (id: number, folio: string | null, contacto: string, cambios: Partial<FilaCotizacion> = {}): FilaCotizacion => ({
  id,
  folio,
  fecha: '2026-09-10',
  contactoId: id,
  contacto,
  nombre: 'Sitio',
  categoria: 'website',
  subtotal: 3_200_000,
  estado: 'enviada',
  pdf: folio !== null,
  ...cambios
})

const lista: ListaCotizaciones = {
  cotizaciones: [
    fila(3, null, 'Grupo Terra', { estado: 'borrador', categoria: 'ai' }),
    fila(2, '520', 'Clínica Sol'),
    fila(1, '519', 'Hotel Aura', { fecha: '2025-08-20', estado: 'aceptada', categoria: 'ecommerce' })
  ],
  resumen: { total: 2, enviadas: 1, conversion: 50, montoAbiertas: 3_200_000, promedio: 3_200_000 },
  porCategoria: { website: 1, ecommerce: 1, app: 0, ai: 0, marketing: 0, other: 0 }
}

const ficha: Ficha = {
  id: 2,
  folio: '520',
  estado: 'enviada',
  contactoId: 7,
  contacto: 'Clínica Sol',
  nombre: 'Rediseño',
  categoria: 'website',
  fecha: '2026-09-10',
  validezDias: 30,
  moneda: 'MXN',
  partidas: [{ concepto: 'Sitio web', categoria: 'website', cantidad: 1, precio: 2_400_000 }],
  conIva: true,
  facturacion: 'unica',
  parcialidades: null,
  stack: null,
  terminos: null,
  notas: null,
  costosEstimados: [],
  subtotal: 2_400_000,
  iva: 384_000,
  total: 2_784_000,
  pdf: 'Cotizaciones/2026/260910-DMM520-Rediseño.pdf',
  proyectoId: null,
  acciones: ['aceptar', 'rechazar', 'cancelar']
}

let api: DmmApi['cotizaciones']
let router: ReturnType<typeof createMemoryRouter>

const montar = (ruta: string) => {
  router = createMemoryRouter(
    [
      { path: '/cotizaciones', element: <Cotizaciones /> },
      { path: '/cotizaciones/nueva', element: <NuevaCotizacion /> },
      { path: '/cotizaciones/:id', element: <FichaCotizacion /> }
    ],
    { initialEntries: [ruta] }
  )
  render(<RouterProvider router={router} />)
}

beforeEach(() => {
  api = {
    listar: vi.fn(async () => lista),
    ficha: vi.fn(async () => ficha),
    guardar: vi.fn(async () => ({ ...ficha, id: 9, estado: 'borrador' as const, acciones: ['editar' as const, 'borrar' as const, 'enviar' as const] })),
    enviar: vi.fn(async () => ficha),
    aceptar: vi.fn(async () => ({ ...ficha, estado: 'aceptada' as const, proyectoId: 4, acciones: ['cancelar' as const] })),
    rechazar: vi.fn(async () => ficha),
    cancelar: vi.fn(async () => ficha),
    borrar: vi.fn(async () => {}),
    abrirPdf: vi.fn(async () => {})
  }
  window.dmm = {
    cotizaciones: api,
    contactos: { listar: vi.fn(async () => ({ contactos: [{ id: 7, nombre: 'Clínica Sol' }], conteo: {}, top: [] })) },
    catalogo: { listar: vi.fn(async () => [{ id: 1, concepto: 'Landing page', categoria: 'website', precio: 950_000 }]) }
  } as unknown as DmmApi
})
afterEach(cleanup)

const filas = () => within(screen.getByRole('table')).getAllByRole('row').slice(1) as HTMLTableRowElement[]

describe('Cotizaciones', () => {
  beforeEach(() => montar('/cotizaciones'))

  it('shows the stat cards and the categories doughnut', async () => {
    const stats = await screen.findByRole('list', { name: 'Resumen' })
    expect(within(stats).getByText('Tasa de conversión').nextSibling?.textContent).toBe('50%')
    expect(within(stats).getByText('Monto en abiertas').nextSibling?.textContent).toBe('$32,000.00')
    expect(screen.getByRole('img', { name: '2 cotizaciones por categoría' })).toBeTruthy()
  })

  it('filters by client, year, category and status', async () => {
    await screen.findByRole('cell', { name: 'Clínica Sol' })
    expect(filas()).toHaveLength(3)
    fireEvent.change(screen.getByRole('combobox', { name: 'Año' }), { target: { value: '2025' } })
    expect(filas().map((r) => r.cells[2].textContent)).toEqual(['Hotel Aura'])
    fireEvent.change(screen.getByRole('combobox', { name: 'Año' }), { target: { value: '' } })
    fireEvent.change(screen.getByRole('combobox', { name: 'Estado' }), { target: { value: 'borrador' } })
    expect(filas().map((r) => r.cells[2].textContent)).toEqual(['Grupo Terra'])
    fireEvent.change(screen.getByRole('combobox', { name: 'Estado' }), { target: { value: '' } })
    fireEvent.change(screen.getByRole('combobox', { name: 'Categoría' }), { target: { value: 'ecommerce' } })
    fireEvent.change(screen.getByRole('combobox', { name: 'Contacto' }), { target: { value: '1' } })
    expect(filas().map((r) => r.cells[0].textContent)).toEqual(['DMM519'])
  })

  it('opens the PDF without opening the record', async () => {
    await screen.findByRole('cell', { name: 'Clínica Sol' })
    fireEvent.click(within(filas()[1]).getByRole('button', { name: 'PDF' }))
    await waitFor(() => expect(api.abrirPdf).toHaveBeenCalledWith(2))
    expect(router.state.location.pathname).toBe('/cotizaciones')
  })
})

describe('Nueva cotización', () => {
  beforeEach(() => montar('/cotizaciones/nueva'))

  it('adds items from the Catálogo with their price, then saves and archives the PDF', async () => {
    fireEvent.click(await screen.findByRole('button', { name: 'Agregar Landing page' }))
    expect((screen.getByRole('spinbutton', { name: 'Precio' }) as HTMLInputElement).value).toBe('9500')
    expect(screen.getByLabelText('Totales').textContent).toContain('$11,020.00')

    fireEvent.change(screen.getByRole('combobox', { name: 'Contacto' }), { target: { value: '7' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'Título' }), { target: { value: 'Landing' } })
    fireEvent.click(screen.getByRole('button', { name: 'Generar PDF y archivar' }))

    await waitFor(() => expect(api.enviar).toHaveBeenCalledWith(9))
    expect(api.guardar).toHaveBeenCalledWith(
      expect.objectContaining({ contactoId: 7, nombre: 'Landing', partidas: [{ concepto: 'Landing page', categoria: 'website', cantidad: 1, precio: 950_000 }] })
    )
    await waitFor(() => expect(router.state.location.pathname).toBe('/cotizaciones/9'))
  })

  it('asks for a client before saving', async () => {
    await screen.findByRole('button', { name: 'Agregar Landing page' })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar borrador' }))
    expect((await screen.findByRole('alert')).textContent).toBe('Elige un cliente')
    expect(api.guardar).not.toHaveBeenCalled()
  })
})

describe('Ficha de cotización', () => {
  it('asks for the exchange rate when accepting a USD quote', async () => {
    vi.mocked(api.ficha).mockResolvedValue({ ...ficha, moneda: 'USD' })
    montar('/cotizaciones/2')
    fireEvent.change(await screen.findByRole('spinbutton', { name: 'Tipo de cambio' }), { target: { value: '18.5' } })
    fireEvent.click(screen.getByRole('button', { name: 'Aceptada' }))
    await waitFor(() => expect(api.aceptar).toHaveBeenCalledWith(2, 18.5))
  })

  it('accepts a sent quote', async () => {
    montar('/cotizaciones/2')
    fireEvent.click(await screen.findByRole('button', { name: 'Aceptada' }))
    await waitFor(() => expect(api.aceptar).toHaveBeenCalledWith(2))
    expect(await screen.findByText('Creado al aceptarse')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Aceptada' })).toBeNull()
  })
})
