// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import type { FilaCotizacion, FilaIngreso, FilaProyecto, ListaTareas, ResumenFinanzas } from '../../../shared/dominio'
import type { DmmApi } from '../../../shared/contrato'
import { Inicio } from './Inicio'

const ingreso = (id: number, cambios: Partial<FilaIngreso> = {}): FilaIngreso => ({
  id,
  fecha: '2026-09-05',
  contacto: 'Café Nómada',
  proyecto: null,
  categoria: 'factura',
  estadoFacturacion: 'facturado',
  estado: 'pendiente',
  subtotal: 1_000_000,
  iva: 160_000,
  total: 1_160_000,
  origen: 'cfdi',
  vencida: false,
  moneda: 'MXN',
  reembolsable: 0,
  reembolsoDeId: null,
  notas: null,
  acciones: ['pagar'],
  ...cambios
})

const resumen = {
  periodo: 'mes',
  rango: { desde: '2026-09-01', hasta: '2026-09-18' },
  actual: { ingresos: 5_000_000, ingresosFactura: 0, ingresosSinFactura: 0, ivaIngresos: 0, costos: 1_200_000, ivaCostos: 0, utilidad: 3_800_000 },
  cobrado: [ingreso(10, { estado: 'pagado', subtotal: 3_000_000 }), ingreso(11, { estado: 'pagado', subtotal: -500_000, reembolsoDeId: 10 })],
  cobranza: [
    ingreso(1, { contacto: 'Hotel Aura' }),
    ingreso(2, { contacto: 'Grupo Terra', fecha: '2026-07-01', vencida: true }),
    ingreso(3, { contacto: 'Mezcal Luna', fecha: null, estadoFacturacion: 'por_facturar' }),
    ingreso(4, { contacto: 'Clínica Sol', fecha: '2026-10-15' }),
    ingreso(5, { contacto: 'Netdeckr', fecha: '2026-06-01', categoria: 'sin_factura', estadoFacturacion: null })
  ],
  costosPendientes: [
    { id: 7, fecha: '2026-09-22', nombre: 'Hosting anual', proveedor: 'Hostinger', proyecto: null, categoria: 'anual', estado: 'pendiente', estimado: false, subtotal: 289_000, iva: 0, total: 289_000, origen: 'manual', acciones: [] }
  ]
} as unknown as ResumenFinanzas

const proyecto = (id: number, nombre: string, estado: FilaProyecto['estado']) =>
  ({ id, referencia: `PRY-00${id}`, nombre, contacto: 'Clínica Sol', estado, fechaInicio: '2026-09-01' }) as FilaProyecto
const cotizacion = (id: number, folio: string | null, estado: FilaCotizacion['estado']) =>
  ({ id, folio, fecha: '2026-09-10', contacto: 'Hotel Aura', nombre: `Propuesta ${id}`, categoria: 'website', subtotal: 2_400_000, estado }) as FilaCotizacion

const tareas: ListaTareas = {
  pendientes: [{ id: 1, texto: 'Facturar anticipo Hotel Aura', fechaRegistro: '2026-09-10', fechaHecha: null }],
  hechas: [{ id: 2, texto: 'Revisar logs', fechaRegistro: '2026-09-01', fechaHecha: '2026-09-12' }]
}

let api: DmmApi

beforeEach(() => {
  api = {
    finanzas: { resumen: vi.fn(async () => resumen) },
    proyectos: { listar: vi.fn(async () => ({ proyectos: [proyecto(1, 'Sitio web', 'en_curso'), proyecto(2, 'Tienda', 'completado')] })) },
    cotizaciones: {
      listar: vi.fn(async () => ({ cotizaciones: [cotizacion(1, null, 'borrador'), cotizacion(2, '520', 'enviada'), cotizacion(3, '519', 'aceptada')] }))
    },
    tareas: {
      listar: vi.fn(async () => tareas),
      agregar: vi.fn(async (texto: string) => ({ ...tareas, pendientes: [...tareas.pendientes, { id: 3, texto, fechaRegistro: '2026-09-18', fechaHecha: null }] })),
      completar: vi.fn(async () => ({ pendientes: [], hechas: tareas.hechas })),
      borrar: vi.fn(async () => ({ pendientes: [], hechas: tareas.hechas }))
    }
  } as unknown as DmmApi
  window.dmm = api
})

afterEach(cleanup)

function renderInicio() {
  const router = createMemoryRouter(
    [
      { path: '/', element: <Inicio /> },
      { path: '*', element: <p>destino</p> }
    ],
    { initialEntries: ['/'] }
  )
  render(<RouterProvider router={router} />)
  return router
}

describe('Inicio', () => {
  it("shows this month's projected and real income, their difference, costs and real profit", async () => {
    renderInicio()
    const cifras = await screen.findByRole('list', { name: 'Resumen' })
    const valor = (label: string) => within(cifras).getByText(label).nextSibling?.textContent
    expect(api.finanzas.resumen).toHaveBeenCalledWith('mes')
    expect(valor('Ingreso proyectado')).toBe('$50,000.00')
    expect(valor('Ingreso real')).toBe('$25,000.00')
    expect(valor('Diferencia')).toBe('-$25,000.00')
    expect(valor('Costos')).toBe('$12,000.00')
    expect(valor('Utilidad')).toBe('$13,000.00')
  })

  it('shows Sin datos for profit when the month has no imported Costos', async () => {
    vi.mocked(api.finanzas.resumen).mockResolvedValue({ ...resumen, actual: { ...resumen.actual, utilidad: null } })
    renderInicio()
    const cifras = await screen.findByRole('list', { name: 'Resumen' })
    expect(within(cifras).getByText('Utilidad').nextSibling?.textContent).toBe('Sin datos')
    expect(within(cifras).getByText('Costos').nextSibling?.textContent).toBe('Sin datos')
  })

  it('splits Cobros into this month, overdue and por facturar', async () => {
    renderInicio()
    const cobros = await screen.findByRole('region', { name: 'Cobros' })
    await within(cobros).findByText('Hotel Aura')
    expect(within(cobros).getByText('Netdeckr')).toBeTruthy()
    expect(within(cobros).queryByText('Grupo Terra')).toBeNull()
    expect(within(cobros).queryByText('Clínica Sol')).toBeNull()
    fireEvent.click(within(cobros).getByRole('button', { name: 'Vencidos · 1' }))
    expect(within(cobros).getByText('Grupo Terra')).toBeTruthy()
    fireEvent.click(within(cobros).getByRole('button', { name: 'Por facturar · 1' }))
    expect(within(cobros).getByText('Mezcal Luna')).toBeTruthy()
    expect(within(cobros).queryByText('Hotel Aura')).toBeNull()
  })

  it('lists pending Costos, Proyectos en curso and draft or sent quotes', async () => {
    renderInicio()
    expect(await within(await screen.findByRole('region', { name: 'Costos pendientes' })).findByText('Hosting anual')).toBeTruthy()
    const proyectos = screen.getByRole('region', { name: 'Proyectos en curso' })
    expect(await within(proyectos).findByText('Sitio web')).toBeTruthy()
    expect(within(proyectos).queryByText('Tienda')).toBeNull()
    const cotizaciones = screen.getByRole('region', { name: 'Cotizaciones abiertas' })
    expect(await within(cotizaciones).findByText('Propuesta 1')).toBeTruthy()
    expect(within(cotizaciones).getByText('Propuesta 2')).toBeTruthy()
    expect(within(cotizaciones).queryByText('Propuesta 3')).toBeNull()
  })

  it('adds, completes and deletes tasks, and shows those done', async () => {
    renderInicio()
    const panel = await screen.findByRole('region', { name: 'Tareas' })
    await within(panel).findByText('Facturar anticipo Hotel Aura')
    fireEvent.change(within(panel).getByPlaceholderText('Nueva tarea…'), { target: { value: 'Llamar a Grupo Terra' } })
    fireEvent.click(within(panel).getByRole('button', { name: 'Agregar' }))
    expect(await within(panel).findByText('Llamar a Grupo Terra')).toBeTruthy()
    expect(api.tareas.agregar).toHaveBeenCalledWith('Llamar a Grupo Terra')

    fireEvent.click(within(panel).getAllByRole('button', { name: 'Hecha' })[0])
    await waitFor(() => expect(api.tareas.completar).toHaveBeenCalledWith(1))
    fireEvent.click(within(panel).getByRole('button', { name: 'Hechas · 30 días' }))
    expect(within(panel).getByText('Revisar logs')).toBeTruthy()
  })

  it('deletes a pending task', async () => {
    renderInicio()
    const panel = await screen.findByRole('region', { name: 'Tareas' })
    await within(panel).findByText('Facturar anticipo Hotel Aura')
    fireEvent.click(within(panel).getByRole('button', { name: 'Borrar' }))
    await waitFor(() => expect(api.tareas.borrar).toHaveBeenCalledWith(1))
  })

  it.each([
    ['Nuevo contacto', '/contactos?nuevo'],
    ['Nueva cotización', '/cotizaciones/nueva'],
    ['Nuevo proyecto', '/proyectos/nuevo']
  ])('%s is an entry point', async (boton, destino) => {
    const router = renderInicio()
    fireEvent.click(await screen.findByRole('button', { name: boton }))
    await waitFor(() => expect(router.state.location.pathname + router.state.location.search).toBe(destino))
  })
})
