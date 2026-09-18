// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import type { DmmApi, FilaCosto, FilaIngreso, ListaContactos, ListaProyectos, ResumenFinanzas } from '../../../shared/ipc'
import { Finanzas } from './Finanzas'
import { NuevoCosto, NuevoIngreso } from './NuevoMovimiento'

const ingreso = (id: number, cambios: Partial<FilaIngreso> = {}): FilaIngreso => ({
  id,
  fecha: '2026-09-02',
  contacto: 'Café Nómada',
  proyecto: null,
  categoria: 'factura',
  estadoFacturacion: 'facturado',
  estado: 'pendiente',
  subtotal: 1_800_000,
  iva: 288_000,
  total: 2_088_000,
  origen: 'cfdi',
  vencida: false,
  reembolsoDeId: null,
  notas: null,
  acciones: ['pagar', 'cancelar'],
  ...cambios
})

const costo = (id: number, cambios: Partial<FilaCosto> = {}): FilaCosto => ({
  id,
  fecha: '2026-09-22',
  nombre: 'Hosting anual',
  proveedor: 'Hostinger',
  proyecto: null,
  categoria: 'anual',
  estado: 'pendiente',
  estimado: false,
  subtotal: 289_000,
  iva: 0,
  total: 289_000,
  origen: 'recurrente',
  acciones: ['pagar', 'cancelar', 'detener'],
  ...cambios
})

const resumen = (cambios: Partial<ResumenFinanzas> = {}): ResumenFinanzas => ({
  periodo: 'mes',
  rango: { desde: '2026-09-01', hasta: '2026-09-18' },
  rangoAnterior: { desde: '2025-09-01', hasta: '2025-09-18' },
  actual: { ingresos: 6_843_000, ingresosFactura: 5_900_000, ingresosSinFactura: 943_000, ivaIngresos: 944_000, costos: 1_719_000, ivaCostos: 0, utilidad: 5_124_000 },
  anterior: { ingresos: 6_110_000, ingresosFactura: 6_110_000, ingresosSinFactura: 0, ivaIngresos: 0, costos: 0, ivaCostos: 0, utilidad: null },
  serie: [
    { etiqueta: '1–7', ingresos: 100, costos: 50, ingresosAnterior: 80, costosAnterior: 0 },
    { etiqueta: '8–14', ingresos: 200, costos: 60, ingresosAnterior: 90, costosAnterior: 0 }
  ],
  sinDatos: [2025],
  cobranza: [ingreso(1), ingreso(2, { contacto: 'Hotel Aura', vencida: true, fecha: '2026-08-05' })],
  costosPendientes: [costo(10)],
  ingresos: [ingreso(3, { contacto: 'Netdeckr', categoria: 'sin_factura', estadoFacturacion: null, estado: 'pagado', origen: 'manual', acciones: ['borrar', 'reembolsar'] })],
  costos: [costo(10)],
  proximosPagos: [{ fecha: '2026-09-22', nombre: 'Hosting anual', proveedor: 'Hostinger', categoria: 'anual', total: 289_000 }],
  diasVencida: 30,
  ...cambios
})

let api: DmmApi['finanzas']
let router: ReturnType<typeof createMemoryRouter>

const montar = (ruta = '/finanzas') => {
  router = createMemoryRouter(
    [
      { path: '/finanzas', element: <Finanzas /> },
      { path: '/finanzas/ingresos/nuevo', element: <NuevoIngreso /> },
      { path: '/finanzas/costos/nuevo', element: <NuevoCosto /> }
    ],
    { initialEntries: [ruta] }
  )
  render(<RouterProvider router={router} />)
}

const proyectos = { proyectos: [], conteo: {}, porCategoria: {} } as unknown as ListaProyectos
const contactos = { contactos: [{ id: 7, nombre: 'Clínica Sol' }], conteo: {}, top: [] } as unknown as ListaContactos

beforeEach(() => {
  api = {
    coberturaCostos: vi.fn(),
    resumen: vi.fn(async () => resumen()),
    configurarVencida: vi.fn(async () => {}),
    nuevoIngreso: vi.fn(async () => {}),
    nuevoCosto: vi.fn(async () => {}),
    pagarIngreso: vi.fn(async () => {}),
    cancelarIngreso: vi.fn(async () => {}),
    borrarIngreso: vi.fn(async () => {}),
    reembolsar: vi.fn(async () => {}),
    pagarCosto: vi.fn(async () => {}),
    cancelarCosto: vi.fn(async () => {}),
    borrarCosto: vi.fn(async () => {}),
    detenerCosto: vi.fn(async () => {})
  }
  window.dmm = {
    finanzas: api,
    rutas: { abrir: vi.fn(async () => {}) },
    proyectos: { listar: vi.fn(async () => proyectos) },
    contactos: { listar: vi.fn(async () => contactos) }
  } as unknown as DmmApi
})

afterEach(cleanup)

describe('Finanzas', () => {
  it('reads this month by default, and another period when picked', async () => {
    montar()
    await screen.findByRole('list', { name: 'Resumen' })
    expect(api.resumen).toHaveBeenCalledWith('mes')
    fireEvent.click(screen.getByRole('button', { name: 'Este año' }))
    await waitFor(() => expect(api.resumen).toHaveBeenCalledWith('anio'))
  })

  it('shows subtotal KPIs with IVA apart, and profit against a year without costs as Sin datos', async () => {
    montar()
    const kpis = await screen.findByRole('list', { name: 'Resumen' })
    const [ingresos, , utilidad] = within(kpis).getAllByRole('listitem')
    expect(ingresos.textContent).toContain('+12% vs 2025')
    expect(ingresos.textContent).toContain('IVA $9,440.00')
    expect(utilidad.textContent).toContain('vs 2025: sin datos de costos')
    expect(screen.getByRole('note').textContent).toContain('2025')
  })

  it('splits Cobranza into actual and vencida', async () => {
    montar()
    const cobranza = (await screen.findByRole('heading', { name: 'Cobranza' })).closest('section')!
    expect(within(cobranza).getByText('Café Nómada')).toBeTruthy()
    expect(within(cobranza).queryByText('Hotel Aura')).toBeNull()
    fireEvent.click(within(cobranza).getByRole('button', { name: 'Vencida (1)' }))
    expect(within(cobranza).getByText('Hotel Aura')).toBeTruthy()
    expect(within(cobranza).getByText('Vencida')).toBeTruthy()
  })

  it('marks an Ingreso paid and reads Finanzas again', async () => {
    montar()
    const cobranza = (await screen.findByRole('heading', { name: 'Cobranza' })).closest('section')!
    fireEvent.click(within(cobranza).getByRole('button', { name: 'Pagado' }))
    await waitFor(() => expect(api.pagarIngreso).toHaveBeenCalledWith(1))
    await waitFor(() => expect(api.resumen).toHaveBeenCalledTimes(2))
  })

  it('registers a Reembolso against a paid Ingreso', async () => {
    montar()
    fireEvent.click(await screen.findByRole('button', { name: 'Reembolsar' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Monto del reembolso' }), { target: { value: '1,500.50' } })
    fireEvent.click(screen.getByRole('button', { name: 'Registrar reembolso' }))
    await waitFor(() => expect(api.reembolsar).toHaveBeenCalledWith(3, 150_050, 0, expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/)))
  })

  it('searches every table at once', async () => {
    montar()
    await screen.findByText('Netdeckr')
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'cafe' } })
    expect(screen.getByText('Café Nómada')).toBeTruthy()
    expect(screen.queryByText('Netdeckr')).toBeNull()
  })

  it('shows upcoming payments and stops a recurring series', async () => {
    montar()
    const proximos = (await screen.findByRole('heading', { name: 'Próximos pagos' })).closest('section')!
    expect(within(proximos).getByText('Hosting anual')).toBeTruthy()
    fireEvent.click(screen.getAllByRole('button', { name: 'Detener serie' })[0])
    await waitFor(() => expect(api.detenerCosto).toHaveBeenCalledWith(10))
  })
})

describe('Nuevo ingreso / costo', () => {
  it('registers uninvoiced income without IVA, in centavos', async () => {
    montar('/finanzas/ingresos/nuevo')
    fireEvent.change(await screen.findByPlaceholderText('0.00'), { target: { value: '4,500' } })
    fireEvent.click(screen.getByRole('button', { name: 'Registrar ingreso' }))
    await waitFor(() => expect(api.nuevoIngreso).toHaveBeenCalledWith(expect.objectContaining({ categoria: 'sin_factura', subtotal: 450_000, iva: 0, pagado: true })))
    await waitFor(() => expect(router.state.location.pathname).toBe('/finanzas'))
  })

  it('registers an MSI cost with its installments, and refuses one without an amount', async () => {
    montar('/finanzas/costos/nuevo')
    fireEvent.click(await screen.findByRole('button', { name: 'Registrar costo' }))
    expect(await screen.findByRole('alert')).toBeTruthy()
    const [nombre] = screen.getAllByRole('textbox')
    fireEvent.change(nombre, { target: { value: 'MacBook Pro' } })
    fireEvent.change(screen.getByRole('combobox', { name: 'Tipo' }), { target: { value: 'msi' } })
    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '2500' } })
    fireEvent.click(screen.getByRole('button', { name: 'Registrar costo' }))
    await waitFor(() =>
      expect(api.nuevoCosto).toHaveBeenCalledWith(expect.objectContaining({ nombre: 'MacBook Pro', categoria: 'msi', parcialidades: 12, subtotal: 250_000, pagado: false }))
    )
  })
})
