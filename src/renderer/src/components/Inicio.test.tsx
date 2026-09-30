// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import type { FilaCotizacion, FilaIngreso, FilaProyecto, ListaTareas, ResumenFinanzas } from '../../../shared/dominio'
import type { DmmApi } from '../../../shared/contrato'
import { Inicio } from './Inicio'
import { olvidarRecordado } from './recordado'

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
  retenciones: 0,
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
  cobrado: [],
  cobranza: [],
  real: 2_500_000,
  utilidadReal: 1_300_000,
  cobros: {
    mes: [ingreso(1, { contacto: 'Hotel Aura' }), ingreso(5, { contacto: 'Netdeckr', fecha: '2026-06-01', categoria: 'sin_factura', estadoFacturacion: null })],
    vencidos: [ingreso(2, { contacto: 'Grupo Terra', fecha: '2026-07-01', vencida: true })],
    porFacturar: [ingreso(3, { contacto: 'Mezcal Luna', fecha: null, estadoFacturacion: 'por_facturar' })]
  },
  costosPendientes: [
    { id: 7, fecha: '2026-09-22', nombre: 'Hosting anual', proveedor: 'Hostinger', proyecto: null, categoria: 'anual', estado: 'pendiente', estimado: false, subtotal: 289_000, iva: 0, retenciones: 0, total: 289_000, origen: 'manual', acciones: [] }
  ]
} as unknown as ResumenFinanzas

const proyecto = (id: number, nombre: string, estado: FilaProyecto['estado']) =>
  ({ id, referencia: `PRY-00${id}`, nombre, contacto: 'Clínica Sol', estado, fechaInicio: '2026-09-01' }) as FilaProyecto
const cotizacion = (id: number, folio: string | null, estado: FilaCotizacion['estado']) =>
  ({ id, folio, fecha: '2026-09-10', contacto: 'Hotel Aura', nombre: `Propuesta ${id}`, categoria: 'website', subtotal: 2_400_000, estado }) as FilaCotizacion

const tareas: ListaTareas = {
  pendientes: [{ id: 1, texto: 'Facturar anticipo Hotel Aura', fechaRegistro: '2026-09-10', fechaHecha: null }],
  hechas: [{ id: 2, texto: 'Revisar logs', fechaRegistro: '2026-09-01', fechaHecha: '2026-09-12' }],
  diasHechas: 14
}

let api: DmmApi

beforeEach(() => {
  olvidarRecordado()
  api = {
    inicio: {
      resumen: vi.fn(async () => ({
        finanzas: resumen,
        proyectos: [proyecto(1, 'Sitio web', 'en_curso')],
        cotizaciones: [cotizacion(1, null, 'borrador'), cotizacion(2, '520', 'enviada')],
        tareas
      }))
    },
    tareas: {
      agregar: vi.fn(async (texto: string) => ({ ...tareas, pendientes: [...tareas.pendientes, { id: 3, texto, fechaRegistro: '2026-09-18', fechaHecha: null }] })),
      completar: vi.fn(async () => ({ ...tareas, pendientes: [] })),
      borrar: vi.fn(async () => ({ ...tareas, pendientes: [] }))
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
    expect(api.inicio.resumen).toHaveBeenCalledTimes(1)
    expect(valor('Ingreso proyectado')).toBe('$50,000.00')
    expect(valor('Ingreso real')).toBe('$25,000.00')
    expect(valor('Diferencia')).toBe('-$25,000.00')
    expect(valor('Costos')).toBe('$12,000.00')
    expect(valor('Utilidad')).toBe('$13,000.00')
  })

  it('shows Sin datos for profit when the month has no imported Costos', async () => {
    vi.mocked(api.inicio.resumen).mockResolvedValue({
      finanzas: { ...resumen, actual: { ...resumen.actual, utilidad: null }, utilidadReal: null },
      proyectos: [],
      cotizaciones: [],
      tareas
    })
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
    fireEvent.click(within(cobros).getByRole('button', { name: 'Vencidos · 1' }))
    expect(within(cobros).getByText('Grupo Terra')).toBeTruthy()
    fireEvent.click(within(cobros).getByRole('button', { name: 'Por facturar · 1' }))
    expect(within(cobros).getByText('Mezcal Luna')).toBeTruthy()
    expect(within(cobros).queryByText('Hotel Aura')).toBeNull()
  })

  it('lists pending Costos, and the Proyectos and Cotizaciones main says are current', async () => {
    renderInicio()
    expect(await within(await screen.findByRole('region', { name: 'Costos pendientes' })).findByText('Hosting anual')).toBeTruthy()
    const proyectos = screen.getByRole('region', { name: 'Proyectos en curso' })
    expect(await within(proyectos).findByText('Sitio web')).toBeTruthy()
    const cotizaciones = screen.getByRole('region', { name: 'Cotizaciones abiertas' })
    expect(await within(cotizaciones).findByText('Propuesta 1')).toBeTruthy()
    expect(within(cotizaciones).getByText('Propuesta 2')).toBeTruthy()
  })

  it('shows why Inicio could not load', async () => {
    vi.mocked(api.inicio.resumen).mockRejectedValue(new Error("Error invoking remote method 'inicio:resumen': Error: La base de datos está bloqueada"))
    renderInicio()
    expect((await screen.findByRole('alert')).textContent).toBe('La base de datos está bloqueada')
    expect(screen.queryByRole('list', { name: 'Resumen' })).toBeNull()
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
    fireEvent.click(within(panel).getByRole('button', { name: 'Hechas · 14 días' }))
    expect(within(panel).getByText('Revisar logs')).toBeTruthy()
  })

  it('states the window main applies to done tasks when there are none', async () => {
    vi.mocked(api.inicio.resumen).mockResolvedValue({ finanzas: resumen, proyectos: [], cotizaciones: [], tareas: { ...tareas, hechas: [] } })
    renderInicio()
    const panel = await screen.findByRole('region', { name: 'Tareas' })
    fireEvent.click(await within(panel).findByRole('button', { name: 'Hechas · 14 días' }))
    expect(within(panel).getByText('Nada hecho en los últimos 14 días.')).toBeTruthy()
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

describe('Inicio, 20 a page', () => {
  const serie = <T,>(n: number, f: (i: number) => T) => Array.from({ length: n }, (_, i) => f(i + 1))
  const abierta = (id: number) => ({ id, texto: `Tarea ${id}`, fechaRegistro: '2026-09-10', fechaHecha: null })
  // Cobros: 25 this month, 3 overdue; 1 Costo; 30 Proyectos; 5 Cotizaciones; 22 open Tareas, 3 done.
  const muchas = {
    finanzas: { ...resumen, cobros: { ...resumen.cobros, mes: serie(25, (i) => ingreso(100 + i)), vencidos: serie(3, (i) => ingreso(200 + i, { vencida: true })) } },
    proyectos: serie(30, (i) => proyecto(i, `Proyecto ${i}`, 'en_curso')),
    cotizaciones: serie(5, (i) => cotizacion(i, String(500 + i), 'enviada')),
    tareas: { ...tareas, pendientes: serie(22, abierta), hechas: serie(3, (i) => ({ id: 100 + i, texto: `Hecha ${i}`, fechaRegistro: '2026-09-01', fechaHecha: '2026-09-12' })) }
  }
  const tarjeta = (name: string) => screen.getByRole('region', { name })
  const rango = (name: string, texto: string) => expect(within(tarjeta(name)).getByText(texto)).toBeTruthy()
  const siguiente = (name: string) => fireEvent.click(within(tarjeta(name)).getByRole('button', { name: 'Siguiente' }))

  beforeEach(async () => {
    vi.mocked(api.inicio.resumen).mockResolvedValue(muchas as never)
    renderInicio()
    await screen.findByText('1–20 de 30')
  })

  it('pages each card at 20, with a footer even when it fits', () => {
    rango('Cobros', '1–20 de 25')
    rango('Costos pendientes', '1–1 de 1')
    rango('Proyectos en curso', '1–20 de 30')
    rango('Cotizaciones abiertas', '1–5 de 5')
    rango('Tareas', '1–20 de 22')
    siguiente('Proyectos en curso')
    rango('Proyectos en curso', '21–30 de 30')
    rango('Cobros', '1–20 de 25')
  })

  it('goes back to page 1 when the Cobros or Tareas tab changes', () => {
    siguiente('Cobros')
    rango('Cobros', '21–25 de 25')
    fireEvent.click(within(tarjeta('Cobros')).getByRole('button', { name: 'Vencidos · 3' }))
    rango('Cobros', '1–3 de 3')
    siguiente('Tareas')
    rango('Tareas', '21–22 de 22')
    fireEvent.click(within(tarjeta('Tareas')).getByRole('button', { name: 'Hechas · 14 días' }))
    rango('Tareas', '1–3 de 3')
    fireEvent.click(within(tarjeta('Tareas')).getByRole('button', { name: 'Pendientes · 22' }))
    rango('Tareas', '1–20 de 22')
  })

  it('keeps the page when a Tarea is marked Hecha', async () => {
    siguiente('Tareas')
    vi.mocked(api.tareas.completar).mockResolvedValue({ ...muchas.tareas, pendientes: serie(22, abierta).filter((t) => t.id !== 21) })
    fireEvent.click(within(tarjeta('Tareas')).getAllByRole('button', { name: 'Hecha' })[0])
    await waitFor(() => expect(api.tareas.completar).toHaveBeenCalledWith(21))
    expect(await within(tarjeta('Tareas')).findByText('21–21 de 21')).toBeTruthy()
  })

  it('shows the page of a Tarea just added', async () => {
    vi.mocked(api.tareas.agregar).mockResolvedValue({ ...muchas.tareas, pendientes: [...serie(22, abierta), abierta(23)] })
    fireEvent.change(within(tarjeta('Tareas')).getByPlaceholderText('Nueva tarea…'), { target: { value: 'Tarea 23' } })
    fireEvent.click(within(tarjeta('Tareas')).getByRole('button', { name: 'Agregar' }))
    expect(await within(tarjeta('Tareas')).findByText('21–23 de 23')).toBeTruthy()
    expect(within(tarjeta('Tareas')).getByText('Tarea 23')).toBeTruthy()
  })

  it('opens as it was left: tabs and pages', async () => {
    siguiente('Proyectos en curso')
    fireEvent.click(within(tarjeta('Cobros')).getByRole('button', { name: 'Vencidos · 3' }))
    fireEvent.click(within(tarjeta('Tareas')).getByRole('button', { name: 'Hechas · 14 días' }))
    cleanup()
    renderInicio()
    await screen.findByText('21–30 de 30')
    rango('Cobros', '1–3 de 3')
    expect(within(tarjeta('Tareas')).getByRole('button', { name: 'Hechas · 14 días' }).getAttribute('aria-pressed')).toBe('true')
    rango('Tareas', '1–3 de 3')
  })
})
