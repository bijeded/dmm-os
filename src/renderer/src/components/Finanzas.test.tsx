// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import type { FilaCosto, FilaIngreso, IngresoEditable, ListaContactos, ListaProyectos, ResumenFinanzas } from '../../../shared/dominio'
import type { DmmApi } from '../../../shared/contrato'
import { Finanzas } from './Finanzas'
import { NuevoCosto, NuevoIngreso } from './NuevoMovimiento'
import { olvidarRecordado } from './recordado'
import { MENSAJE_MONTO } from '../../../shared/montos'

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
  retenciones: 0,
  total: 2_088_000,
  origen: 'cfdi',
  vencida: false,
  moneda: 'MXN',
  reembolsable: 0,
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
  retenciones: 0,
  total: 289_000,
  origen: 'recurrente',
  acciones: ['pagar', 'cancelar', 'detener'],
  ...cambios
})

const resumen = (cambios: Partial<ResumenFinanzas> = {}): ResumenFinanzas => ({
  periodo: 'mes',
  rango: { desde: '2026-09-01', hasta: '2026-09-18' },
  rangoAnterior: { desde: '2025-09-01', hasta: '2025-09-18' },
  actual: { ingresos: 6_843_000, ingresosFactura: 5_900_000, ingresosSinFactura: 943_000, ivaIngresos: 944_000, retencionesIngresos: 0, costos: 1_719_000, ivaCostos: 0, retencionesCostos: 0, utilidad: 5_124_000 },
  anterior: { ingresos: 6_110_000, ingresosFactura: 6_110_000, ingresosSinFactura: 0, ivaIngresos: 0, retencionesIngresos: 0, costos: 0, ivaCostos: 0, retencionesCostos: 0, utilidad: null },
  serie: [
    { etiqueta: '1–7', ingresos: 100, costos: 50, ingresosAnterior: 80, costosAnterior: 0 },
    { etiqueta: '8–14', ingresos: 200, costos: 60, ingresosAnterior: 90, costosAnterior: 0 }
  ],
  sinDatos: [2025],
  cobrado: [ingreso(4, { contacto: 'Estudio Ocho', estado: 'pagado', acciones: ['reembolsar'] })],
  cobranza: [ingreso(1), ingreso(2, { contacto: 'Hotel Aura', vencida: true, fecha: '2026-08-05' })],
  real: 0,
  utilidadReal: null,
  cobros: { mes: [], vencidos: [], porFacturar: [] },
  costosPendientes: [costo(10)],
  ingresos: [ingreso(3, { contacto: 'Netdeckr', categoria: 'sin_factura', estadoFacturacion: null, estado: 'pagado', origen: 'manual', reembolsable: 200_000, acciones: ['borrar', 'reembolsar'] })],
  costos: [costo(10)],
  proximosPagos: [{ fecha: '2026-09-22', nombre: 'Hosting anual', proveedor: 'Hostinger', categoria: 'anual', total: 289_000 }],
  diasVencida: 30,
  ...cambios
})

/** Ingreso 884 of La Hora Zero, as Editar ingreso opens it: USD, recorded at 500,001 ÷ 26,000 pesos per USD. */
const horaZero = (cambios: Partial<IngresoEditable> = {}): IngresoEditable => ({
  id: 884,
  moneda: 'USD',
  estado: 'pagado',
  reembolsoDeId: null,
  bloqueados: [],
  fecha: '2026-09-29',
  monto: 26_000,
  tipoCambio: 500_001 / 26_000,
  categoria: 'sin_factura',
  conIva: false,
  facturado: false,
  proyectoId: null,
  contactoId: 7,
  notas: null,
  ...cambios
})

let api: DmmApi['finanzas']
let router: ReturnType<typeof createMemoryRouter>

const montar = (ruta = '/finanzas') => {
  router = createMemoryRouter(
    [
      { path: '/finanzas', element: <Finanzas /> },
      { path: '/finanzas/ingresos/nuevo', element: <NuevoIngreso /> },
      { path: '/finanzas/ingresos/:id/editar', element: <NuevoIngreso /> },
      { path: '/finanzas/costos/nuevo', element: <NuevoCosto /> }
    ],
    { initialEntries: [ruta] }
  )
  render(<RouterProvider router={router} />)
}

const proyectos = { proyectos: [], conteo: {}, porCategoria: {} } as unknown as ListaProyectos
const contactos = { contactos: [{ id: 7, nombre: 'Clínica Sol' }], conteo: {}, top: [] } as unknown as ListaContactos

beforeEach(() => {
  olvidarRecordado()
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
    detenerCosto: vi.fn(async () => {}),
    opcionesAsignar: vi.fn(async () => ({
      actual: null,
      sinContacto: false,
      proyectos: [
        { id: 25, nombre: 'Cantina Rooftop', contacto: 'Omar Rodriguez', estado: 'completado' as const },
        { id: 24, nombre: 'Cantina 48', contacto: 'Omar Rodriguez', estado: 'completado' as const }
      ]
    })),
    asignarProyecto: vi.fn(async () => {}),
    ingresoParaEditar: vi.fn(async () => horaZero()),
    editarIngreso: vi.fn(async () => {})
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

  it('shows Nuevo costo as secondary and Nuevo ingreso as primary in the title row', async () => {
    montar()
    await screen.findByRole('list', { name: 'Resumen' })
    const fila = screen.getByRole('heading', { level: 1 }).parentElement!
    expect(within(fila).getByRole('button', { name: 'Nuevo costo' }).className).toContain('border-border-strong')
    expect(within(fila).getByRole('button', { name: 'Nuevo ingreso' }).className).toContain('bg-primary')
  })

  it('shows subtotal KPIs with IVA apart, and profit against a year without costs as Sin datos', async () => {
    montar()
    const kpis = await screen.findByRole('list', { name: 'Resumen' })
    const [ingresos, , utilidad] = within(kpis).getAllByRole('listitem')
    expect(ingresos.textContent).toContain('+12% vs 2025')
    expect(ingresos.textContent).toContain('IVA $9,440.00')
    expect(ingresos.textContent).not.toContain('retenciones')
    expect(utilidad.textContent).toContain('vs 2025: sin datos de costos')
    expect(screen.getByRole('note').textContent).toContain('2025')
  })

  it('shows retenciones next to IVA when invoices carried them', async () => {
    const actual = { ...resumen().actual, retencionesIngresos: 20_667, retencionesCostos: 10_000 }
    api.resumen = vi.fn(async () => resumen({ actual }))
    montar()
    const kpis = await screen.findByRole('list', { name: 'Resumen' })
    const [ingresos, costos] = within(kpis).getAllByRole('listitem')
    expect(ingresos.textContent).toContain('IVA $9,440.00')
    expect(ingresos.textContent).toContain('retenciones $206.67')
    expect(costos.textContent).toContain('retenciones $100.00')
  })

  it('lists what was collected under Cobrado, and nothing pending', async () => {
    montar()
    const cobrado = (await screen.findByRole('heading', { name: 'Cobrado' })).closest('section')!
    expect(within(cobrado).getByText('Estudio Ocho')).toBeTruthy()
    expect(within(cobrado).queryByText('Café Nómada')).toBeNull()
  })

  it('splits what is still to collect into actual and vencida', async () => {
    montar()
    const cobranza = (await screen.findByRole('heading', { name: 'Por cobrar' })).closest('section')!
    expect(within(cobranza).getByText('Café Nómada')).toBeTruthy()
    expect(within(cobranza).queryByText('Hotel Aura')).toBeNull()
    fireEvent.click(within(cobranza).getByRole('button', { name: 'Vencida (1)' }))
    expect(within(cobranza).getByText('Hotel Aura')).toBeTruthy()
    expect(within(cobranza).getByText('Vencida')).toBeTruthy()
  })

  it('marks an Ingreso paid and reads Finanzas again', async () => {
    montar()
    const cobranza = (await screen.findByRole('heading', { name: 'Por cobrar' })).closest('section')!
    fireEvent.click(within(cobranza).getByRole('button', { name: 'Pagado' }))
    await waitFor(() => expect(api.pagarIngreso).toHaveBeenCalledWith(1))
    await waitFor(() => expect(api.resumen).toHaveBeenCalledTimes(2))
  })

  it('registers a Reembolso against a paid Ingreso', async () => {
    montar()
    const delPeriodo = (await screen.findByRole('heading', { name: 'Ingresos del periodo' })).closest('section')!
    fireEvent.click(within(delPeriodo).getByRole('button', { name: 'Reembolsar' }))
    expect((screen.getByRole('textbox', { name: 'Monto del reembolso' }) as HTMLInputElement).value).toBe('2000.00')
    fireEvent.change(screen.getByRole('textbox', { name: 'Monto del reembolso' }), { target: { value: '1,500.50' } })
    fireEvent.click(screen.getByRole('button', { name: 'Registrar reembolso' }))
    await waitFor(() => expect(api.reembolsar).toHaveBeenCalledWith(3, 150_050))
  })

  it('assigns an imported invoice to a Proyecto and reads Finanzas again', async () => {
    api.resumen = vi.fn(async () => resumen({ ingresos: [ingreso(481, { contacto: 'Omar Rodriguez', estado: 'pagado', acciones: ['reembolsar', 'asignarProyecto'] })] }))
    montar()
    const delPeriodo = (await screen.findByRole('heading', { name: 'Ingresos del periodo' })).closest('section')!
    fireEvent.click(await within(delPeriodo).findByRole('button', { name: 'Asignar proyecto' }))
    const dialogo = screen.getByRole('dialog')
    const select = await within(dialogo).findByRole('combobox', { name: 'Proyecto' })
    expect(api.opcionesAsignar).toHaveBeenCalledWith(481)
    expect(within(dialogo).getAllByRole('option').map((o) => o.textContent)).toEqual(['Ningún proyecto', 'Cantina Rooftop · Completado', 'Cantina 48 · Completado'])
    fireEvent.change(select, { target: { value: '24' } })
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Asignar' }))
    await waitFor(() => expect(api.asignarProyecto).toHaveBeenCalledWith(481, 24))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    await waitFor(() => expect(api.resumen).toHaveBeenCalledTimes(2))
  })

  it('names each Proyecto’s Contacto for an invoice with none, and says it takes that Contacto', async () => {
    api.resumen = vi.fn(async () => resumen({ ingresos: [ingreso(90, { contacto: null, acciones: ['asignarProyecto'] })] }))
    vi.mocked(api.opcionesAsignar).mockResolvedValueOnce({ actual: 24, sinContacto: true, proyectos: [{ id: 24, nombre: 'La Boom', contacto: 'Omar Rodriguez', estado: 'en_curso' }] })
    montar()
    fireEvent.click(await screen.findByRole('button', { name: 'Asignar proyecto' }))
    const dialogo = screen.getByRole('dialog')
    expect(await within(dialogo).findByRole('option', { name: 'La Boom · Omar Rodriguez · En curso (actual)' })).toBeTruthy()
    expect(within(dialogo).getByText(/toma el del proyecto que elijas/)).toBeTruthy()
    fireEvent.change(within(dialogo).getByRole('combobox', { name: 'Proyecto' }), { target: { value: '' } })
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Asignar' }))
    await waitFor(() => expect(api.asignarProyecto).toHaveBeenCalledWith(90, null))
  })

  it('opens Asignar proyecto from the Cobrado list too, drawn outside every card', async () => {
    api.resumen = vi.fn(async () => resumen({ cobrado: [ingreso(564, { contacto: 'Omar Rodriguez', estado: 'pagado', acciones: ['reembolsar', 'asignarProyecto'] })], ingresos: [] }))
    montar()
    const cobrado = (await screen.findByRole('heading', { name: 'Cobrado' })).closest('section')!
    fireEvent.click(await within(cobrado).findByRole('button', { name: 'Asignar proyecto' }))
    const dialogo = await screen.findByRole('dialog')
    expect(dialogo.closest('section')).toBeNull()
    expect(api.opcionesAsignar).toHaveBeenCalledWith(564)
  })

  it('selects Ningún proyecto when the invoice sits on a Proyecto it cannot be put on again', async () => {
    api.resumen = vi.fn(async () => resumen({ ingresos: [ingreso(481, { acciones: ['asignarProyecto'] })] }))
    vi.mocked(api.opcionesAsignar).mockResolvedValueOnce({ actual: 99, sinContacto: false, proyectos: [{ id: 24, nombre: 'Cantina 48', contacto: 'Omar Rodriguez', estado: 'completado' }] })
    montar()
    fireEvent.click(await screen.findByRole('button', { name: 'Asignar proyecto' }))
    const dialogo = screen.getByRole('dialog')
    const select = (await within(dialogo).findByRole('combobox', { name: 'Proyecto' })) as HTMLSelectElement
    expect(select.value).toBe('')
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Asignar' }))
    await waitFor(() => expect(api.asignarProyecto).toHaveBeenCalledWith(481, null))
  })

  it('shows main’s refusal in the dialog, and writes nothing when closed', async () => {
    api.resumen = vi.fn(async () => resumen({ ingresos: [ingreso(481, { acciones: ['asignarProyecto'] })] }))
    vi.mocked(api.asignarProyecto).mockRejectedValueOnce(new Error('La factura es de otro contacto; se asigna solo a sus proyectos'))
    montar()
    fireEvent.click(await screen.findByRole('button', { name: 'Asignar proyecto' }))
    const dialogo = screen.getByRole('dialog')
    await within(dialogo).findByRole('combobox', { name: 'Proyecto' })
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Asignar' }))
    expect(await within(dialogo).findByText('La factura es de otro contacto; se asigna solo a sus proyectos')).toBeTruthy()
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Cancelar' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(api.resumen).toHaveBeenCalledTimes(1)
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

describe('Finanzas, 20 a page', () => {
  const serie = <T,>(n: number, desde: number, f: (id: number) => T) => Array.from({ length: n }, (_, i) => f(desde + i))
  // 25 cobrados, 21 por cobrar plus 3 vencidas, 1 costo pendiente, 45 ingresos and 25 costos in the period.
  const grande = (cambios: Partial<ResumenFinanzas> = {}) =>
    resumen({
      cobrado: serie(25, 100, (id) => ingreso(id, { estado: 'pagado', acciones: [] })),
      cobranza: [...serie(21, 200, (id) => ingreso(id)), ...serie(3, 300, (id) => ingreso(id, { vencida: true, acciones: [] }))],
      costosPendientes: [costo(10)],
      ingresos: serie(45, 400, (id) => ingreso(id, { estado: 'pagado', acciones: ['borrar'] })),
      costos: serie(25, 500, (id) => costo(id, { acciones: [] })),
      ...cambios
    })
  const tarjeta = (titulo: string) => screen.getByRole('heading', { name: titulo }).closest('section')!
  const rango = (titulo: string, texto: string) => expect(within(tarjeta(titulo)).getByText(texto)).toBeTruthy()
  const siguiente = (titulo: string) => fireEvent.click(within(tarjeta(titulo)).getByRole('button', { name: 'Siguiente' }))

  beforeEach(async () => {
    api.resumen = vi.fn(async () => grande())
    montar()
    await screen.findByText('1–20 de 45')
  })

  it('gives each table its own footer, even one that fits on a page', () => {
    rango('Cobrado', '1–20 de 25')
    rango('Por cobrar', '1–20 de 21')
    rango('Ingresos del periodo', '1–20 de 45')
    rango('Costos del periodo', '1–20 de 25')
    rango('Costos pendientes', '1–1 de 1')
    for (const name of ['Anterior', 'Siguiente']) expect((within(tarjeta('Costos pendientes')).getByRole('button', { name }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('pages each table on its own', () => {
    siguiente('Ingresos del periodo')
    rango('Ingresos del periodo', '21–40 de 45')
    rango('Cobrado', '1–20 de 25')
  })

  it('goes back to page 1 of Por cobrar only when Vencida is picked', () => {
    siguiente('Ingresos del periodo')
    siguiente('Por cobrar')
    rango('Por cobrar', '21–21 de 21')
    fireEvent.click(within(tarjeta('Por cobrar')).getByRole('button', { name: 'Vencida (3)' }))
    rango('Por cobrar', '1–3 de 3')
    rango('Ingresos del periodo', '21–40 de 45')
  })

  it('goes back to page 1 of every table when the Periodo changes', async () => {
    siguiente('Cobrado')
    siguiente('Ingresos del periodo')
    fireEvent.click(screen.getByRole('button', { name: 'Este año' }))
    await waitFor(() => expect(api.resumen).toHaveBeenCalledWith('anio'))
    rango('Cobrado', '1–20 de 25')
    rango('Ingresos del periodo', '1–20 de 45')
  })

  it('keeps the page after a row action', async () => {
    siguiente('Ingresos del periodo')
    api.resumen = vi.fn(async () => grande({ ingresos: serie(44, 401, (id) => ingreso(id, { estado: 'pagado', acciones: ['borrar'] })) }))
    fireEvent.click(within(tarjeta('Ingresos del periodo')).getAllByRole('button', { name: 'Borrar' })[0])
    await waitFor(() => expect(api.borrarIngreso).toHaveBeenCalledWith(420))
    expect(await within(tarjeta('Ingresos del periodo')).findByText('21–40 de 44')).toBeTruthy()
  })

  it('shows the last page with rows when the last row of the last page leaves', async () => {
    siguiente('Por cobrar')
    rango('Por cobrar', '21–21 de 21')
    api.resumen = vi.fn(async () => grande({ cobranza: serie(20, 200, (id) => ingreso(id)) }))
    fireEvent.click(within(tarjeta('Por cobrar')).getByRole('button', { name: 'Pagado' }))
    await waitFor(() => expect(api.pagarIngreso).toHaveBeenCalledWith(220))
    expect(await within(tarjeta('Por cobrar')).findByText('1–20 de 20')).toBeTruthy()
  })

  it('opens as it was left: Periodo, search and pages', async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Este año' }))
    await waitFor(() => expect(api.resumen).toHaveBeenCalledWith('anio'))
    siguiente('Costos del periodo')
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'hosting' } })
    siguiente('Costos del periodo')
    cleanup()
    api.resumen = vi.fn(async () => grande())
    montar()
    await waitFor(() => expect(api.resumen).toHaveBeenCalledWith('anio'))
    await screen.findByRole('heading', { name: 'Costos del periodo' })
    expect(await within(tarjeta('Costos del periodo')).findByText('21–25 de 25')).toBeTruthy()
    expect(api.resumen).not.toHaveBeenCalledWith('mes')
    expect(screen.getByRole('button', { name: 'Este año' }).getAttribute('aria-pressed')).toBe('true')
    expect((screen.getByRole('searchbox') as HTMLInputElement).value).toBe('hosting')
  })
})

describe('Nuevo ingreso / costo', () => {
  it('registers uninvoiced income without IVA, in centavos', async () => {
    montar('/finanzas/ingresos/nuevo')
    fireEvent.change(await screen.findByPlaceholderText('0.00'), { target: { value: '4,500' } })
    fireEvent.click(screen.getByRole('button', { name: 'Registrar ingreso' }))
    await waitFor(() => expect(api.nuevoIngreso).toHaveBeenCalledWith(expect.objectContaining({ categoria: 'sin_factura', subtotal: 450_000, conIva: false, pagado: true })))
    await waitFor(() => expect(router.state.location.pathname).toBe('/finanzas'))
  })

  it('registers an MSI cost with its installments, and refuses one without an amount', async () => {
    montar('/finanzas/costos/nuevo')
    fireEvent.click(await screen.findByRole('button', { name: 'Registrar costo' }))
    expect((await screen.findByRole('alert')).textContent).toContain(MENSAJE_MONTO)
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

describe('Editar ingreso', () => {
  it('is on the rows that offer it, and opens the Ingreso', async () => {
    api.resumen = vi.fn(async () => resumen({ ingresos: [ingreso(3, { contacto: 'Netdeckr', origen: 'manual', acciones: ['borrar', 'editar'] }), ingreso(5, { contacto: 'Cantina 48' })] }))
    montar()
    const fila = (texto: string) => screen.getByText(texto).closest('tr')!
    await screen.findByText('Netdeckr')
    expect(within(fila('Cantina 48')).queryByRole('button', { name: 'Editar' })).toBeNull()
    fireEvent.click(within(fila('Netdeckr')).getByRole('button', { name: 'Editar' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/finanzas/ingresos/3/editar'))
    await waitFor(() => expect(api.ingresoParaEditar).toHaveBeenCalledWith(3))
  })

  it('opens a USD Ingreso in USD and saves its new fecha, the untouched rate exactly as stored', async () => {
    montar('/finanzas/ingresos/884/editar')
    const monto = await screen.findByLabelText('Monto en USD (antes de IVA)')
    await waitFor(() => expect((monto as HTMLInputElement).value).toBe('260.00'))
    expect((screen.getByLabelText('Tipo de cambio') as HTMLInputElement).value).toBe('19.2308')
    expect(screen.queryByLabelText('Pagado en esa fecha')).toBeNull()
    fireEvent.change(screen.getByLabelText('Fecha'), { target: { value: '2019-03-15' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    await waitFor(() =>
      expect(api.editarIngreso).toHaveBeenCalledWith(884, {
        fecha: '2019-03-15',
        monto: 26_000,
        tipoCambio: 500_001 / 26_000,
        categoria: 'sin_factura',
        conIva: false,
        facturado: false,
        proyectoId: null,
        contactoId: 7,
        notas: null
      })
    )
    await waitFor(() => expect(router.state.location.pathname).toBe('/finanzas'))
  })

  it('sends a typed rate', async () => {
    montar('/finanzas/ingresos/884/editar')
    const tasa = await screen.findByLabelText('Tipo de cambio')
    await waitFor(() => expect((tasa as HTMLInputElement).value).toBe('19.2308'))
    fireEvent.change(tasa, { target: { value: '17.50' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(api.editarIngreso).toHaveBeenCalledWith(884, expect.objectContaining({ tipoCambio: 17.5 })))
  })

  it('leaves disabled what the Ingreso cannot change', async () => {
    api.ingresoParaEditar = vi.fn(async () => horaZero({ moneda: 'MXN', tipoCambio: null, monto: 100_000, bloqueados: ['proyecto', 'categoria'] }))
    montar('/finanzas/ingresos/884/editar')
    await waitFor(() => expect((screen.getByLabelText('Monto (antes de IVA)') as HTMLInputElement).value).toBe('1000.00'))
    expect(screen.getByRole('combobox', { name: 'Proyecto' })).toHaveProperty('disabled', true)
    expect(screen.getByRole('combobox', { name: 'Tipo' })).toHaveProperty('disabled', true)
    expect(screen.queryByLabelText('Tipo de cambio')).toBeNull()
  })

  it('changes nothing when cancelled', async () => {
    montar('/finanzas/ingresos/884/editar')
    fireEvent.change(await screen.findByLabelText('Fecha'), { target: { value: '2019-03-15' } })
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/finanzas'))
    expect(api.editarIngreso).not.toHaveBeenCalled()
  })
})
