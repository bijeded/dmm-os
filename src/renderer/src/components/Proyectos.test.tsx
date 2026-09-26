// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import type { FichaProyecto as Ficha, FilaProyecto, ListaContactos, ListaProyectos, OpcionesCobro } from '../../../shared/dominio'
import type { DmmApi } from '../../../shared/contrato'
import { hoy } from '../../../shared/fechas'
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

const opciones: OpcionesCobro = {
  moneda: 'MXN',
  subtotalCotizacion: 900_000,
  totalCotizacion: 900_000,
  saldado: 0,
  pendientes: [],
  falta: 900_000,
  tipoCambio: null,
  facturas: []
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
    abrirCarpeta: vi.fn(async () => {}),
    opcionesCobro: vi.fn(async () => opciones),
    completarConCobro: vi.fn(async () => ({ ...ficha, estado: 'completado' as const, falta: null, acciones: ['editar' as const] }))
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

describe('Proyecto sin Contacto', () => {
  const activista = fila(4, 'Activista', { contactoId: null, contacto: null, fechaInicio: null })
  const fichaSinContacto: Ficha = { ...ficha, id: 4, nombre: 'Activista', contactoId: null, contacto: null, clienteFinal: null, cotizacionId: null, folio: null }

  it('shows Sin Contacto in the list and filters by it, leaving personal Proyectos out', async () => {
    api.listar = vi.fn(async () => ({ ...lista, proyectos: [activista, ...lista.proyectos] }))
    montar('/proyectos')
    await screen.findByText('PRY-004')
    const filaActivista = screen.getAllByRole('row').find((r) => r.textContent?.includes('Activista'))!
    expect(within(filaActivista).getByText('Sin Contacto')).toBeTruthy()

    fireEvent.change(screen.getByRole('combobox', { name: 'Contacto' }), { target: { value: 'sin_contacto' } })
    expect(screen.getAllByRole('row').slice(1).map((f) => f.querySelector('td')!.textContent)).toEqual(['PRY-004'])
  })

  it('shows Sin Contacto in its Ficha, not Personal', async () => {
    api.ficha = vi.fn(async () => fichaSinContacto)
    montar('/proyectos/4')
    await screen.findByRole('heading', { name: 'Activista' })
    expect(screen.getByText('Sin Contacto')).toBeTruthy()
    expect(screen.queryByText('Personal')).toBeNull()
  })

  it('requires a Contacto to save it from its Ficha, and assigns the one chosen', async () => {
    api.ficha = vi.fn(async () => fichaSinContacto)
    montar('/proyectos/4/editar')
    await screen.findByDisplayValue('Activista')
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Elige un contacto')
    expect(api.guardar).not.toHaveBeenCalled()

    fireEvent.change(screen.getByLabelText('Contacto'), { target: { value: '7' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(api.guardar).toHaveBeenCalledWith(expect.objectContaining({ id: 4, etiqueta: 'cliente', contactoId: 7 })))
  })
})

describe('FichaProyecto', () => {
  it('shows what is still to be paid, and only the actions its estado allows', async () => {
    montar('/proyectos/1')
    expect(await screen.findByRole('heading', { name: 'Sitio web' })).toBeTruthy()
    const completar = screen.getByRole('button', { name: 'Completar' })
    expect(completar).toHaveProperty('disabled', false)
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

describe('Completar con cobro', () => {
  const abrir = async (cambios: Partial<OpcionesCobro> = {}) => {
    vi.mocked(api.opcionesCobro).mockResolvedValue({ ...opciones, ...cambios })
    montar('/proyectos/1')
    fireEvent.click(await screen.findByRole('button', { name: 'Completar' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Completar con cobro' })
    await within(dialogo).findByText(/falta/)
    return dialogo
  }
  const confirmar = (dialogo: HTMLElement) => fireEvent.click(within(dialogo).getByRole('button', { name: 'Completar' }))
  const cobro = (cambios: object) => expect.objectContaining({ fecha: hoy(), incobrables: [], tipoCambio: null, ...cambios })

  it('sin factura records the whole gap as paid and shows the Proyecto completed', async () => {
    const dialogo = await abrir()
    expect(api.completar).not.toHaveBeenCalled()
    fireEvent.click(within(dialogo).getByLabelText('No'))
    expect((within(dialogo).getByLabelText('Monto recibido (MXN)') as HTMLInputElement).value).toBe('9000.00')
    confirmar(dialogo)
    await waitFor(() => expect(api.completarConCobro).toHaveBeenCalledWith(1, cobro({ pago: { tipo: 'sin_factura', monto: 900_000 } })))
    expect(await screen.findByText('Completado')).toBeTruthy()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('a partial amount says what stays Incobrable', async () => {
    const dialogo = await abrir()
    fireEvent.click(within(dialogo).getByLabelText('No'))
    fireEvent.change(within(dialogo).getByLabelText('Monto recibido (MXN)'), { target: { value: '8,000' } })
    expect(within(dialogo).getByText('$1,000.00 quedará como incobrable.')).toBeTruthy()
    confirmar(dialogo)
    await waitFor(() => expect(api.completarConCobro).toHaveBeenCalledWith(1, cobro({ pago: { tipo: 'sin_factura', monto: 800_000 } })))
  })

  it('a USD Cotización asks for the tipo de cambio, filled with the quote’s', async () => {
    const dialogo = await abrir({ moneda: 'USD', subtotalCotizacion: 100_000, totalCotizacion: 100_000, falta: 100_000, tipoCambio: 17.9 })
    const tasa = within(dialogo).getByLabelText('Tipo de cambio') as HTMLInputElement
    expect(tasa.value).toBe('17.9')
    fireEvent.change(tasa, { target: { value: '18.5' } })
    fireEvent.click(within(dialogo).getByLabelText('No'))
    confirmar(dialogo)
    await waitFor(() => expect(api.completarConCobro).toHaveBeenCalledWith(1, cobro({ pago: { tipo: 'sin_factura', monto: 100_000 }, tipoCambio: 18.5 })))
  })

  it('con factura links the chosen CFDI', async () => {
    const dialogo = await abrir({ facturas: [{ cfdiUuid: 'ABCDEF12-0000', fecha: '2026-07-01', subtotal: 900_000, total: 1_044_000, pendiente: false, coincide: true }] })
    fireEvent.click(within(dialogo).getByLabelText('Sí'))
    fireEvent.click(within(dialogo).getByLabelText(/coincide con la cotización/))
    confirmar(dialogo)
    await waitFor(() => expect(api.completarConCobro).toHaveBeenCalledWith(1, cobro({ pago: { tipo: 'cfdi', cfdiUuid: 'ABCDEF12-0000' } })))
  })

  it('an invoice not on disk is entered with its amount, IVA included', async () => {
    const dialogo = await abrir()
    fireEvent.click(within(dialogo).getByLabelText('Sí'))
    expect(within(dialogo).getByText('El contacto no tiene facturas sin proyecto.')).toBeTruthy()
    fireEvent.click(within(dialogo).getByLabelText('La factura no está en Facturas/Emitidas'))
    confirmar(dialogo)
    await waitFor(() => expect(api.completarConCobro).toHaveBeenCalledWith(1, cobro({ pago: { tipo: 'factura_fuera_de_disco', monto: 900_000, conIva: true } })))
  })

  it('pending Ingresos are Cobrado or Incobrable, with no ¿Con factura? when they cover the gap', async () => {
    const pendientes = [
      { id: 11, fecha: '2026-09-01', categoria: 'factura' as const, monto: 580_000 },
      { id: 12, fecha: '2026-10-01', categoria: 'factura' as const, monto: 580_000 }
    ]
    const dialogo = await abrir({ pendientes, falta: 0 })
    expect(within(dialogo).queryByText('¿Con factura?')).toBeNull()
    fireEvent.change(within(dialogo).getAllByLabelText('Pago de $5,800.00')[1], { target: { value: 'incobrable' } })
    confirmar(dialogo)
    await waitFor(() => expect(api.completarConCobro).toHaveBeenCalledWith(1, cobro({ incobrables: [12], pago: null })))
  })

  it('refuses a future Fecha de pago without asking main', async () => {
    const dialogo = await abrir()
    fireEvent.change(within(dialogo).getByLabelText('Fecha de pago'), { target: { value: '2999-01-01' } })
    fireEvent.click(within(dialogo).getByLabelText('No'))
    confirmar(dialogo)
    expect(await within(dialogo).findByText('La fecha de pago no puede ser futura')).toBeTruthy()
    expect(api.completarConCobro).not.toHaveBeenCalled()
  })

  it('shows why main refused, and closing writes nothing', async () => {
    vi.mocked(api.completarConCobro).mockRejectedValue(new Error('El monto no puede ser mayor a lo que falta'))
    const dialogo = await abrir()
    confirmar(dialogo)
    expect(await within(dialogo).findByText('Indica si el pago fue con factura')).toBeTruthy()
    fireEvent.click(within(dialogo).getByLabelText('No'))
    confirmar(dialogo)
    expect(await within(dialogo).findByText('El monto no puede ser mayor a lo que falta')).toBeTruthy()
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Cancelar' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(api.completar).not.toHaveBeenCalled()
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
