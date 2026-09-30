// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import type { FichaCotizacion as Ficha, FilaCotizacion, ListaCotizaciones } from '../../../shared/dominio'
import type { DmmApi } from '../../../shared/contrato'
import { Cotizaciones } from './Cotizaciones'
import { FichaCotizacion } from './FichaCotizacion'
import { NuevaCotizacion } from './NuevaCotizacion'
import { olvidarRecordado } from './recordado'

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
  olvidarRecordado()
  api = {
    listar: vi.fn(async () => lista),
    ficha: vi.fn(async () => ficha),
    guardar: vi.fn(async () => ({ ...ficha, id: 9, estado: 'borrador' as const, acciones: ['editar' as const, 'borrar' as const, 'enviar' as const] })),
    enviar: vi.fn(async () => ficha),
    aceptar: vi.fn(async () => ({ ...ficha, estado: 'aceptada' as const, proyectoId: 4, acciones: ['cancelar' as const] })),
    rechazar: vi.fn(async () => ficha),
    opcionesAceptarTarde: vi.fn(async () => ({ importado: false, moneda: 'MXN' as const, proyectos: [] })),
    aceptarTarde: vi.fn(async () => ({ ...ficha, estado: 'aceptada' as const, proyectoId: 4, acciones: ['cancelar' as const, 'cambiarContacto' as const] })),
    cancelar: vi.fn(async () => ficha),
    borrar: vi.fn(async () => {}),
    cambiarContacto: vi.fn(async () => ({ ...ficha, contactoId: 8, contacto: 'Omar Rodriguez' })),
    abrirPdf: vi.fn(async () => {})
  }
  window.dmm = {
    cotizaciones: api,
    contactos: {
      listar: vi.fn(async () => ({ contactos: [{ id: 7, nombre: 'Clínica Sol' }, { id: 8, nombre: 'Omar Rodriguez' }], conteo: {}, top: [] })),
      previaCambio: vi.fn(async () => ({ cotizaciones: 1, proyectos: 1, ingresos: 2, borraContacto: null }))
    },
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

describe('Cotizaciones, 20 a page', () => {
  // 45 Cotizaciones, each with its own Contacto: the first 25 aceptadas, the rest enviadas.
  const muchas = (sin: number[] = []): ListaCotizaciones => ({
    ...lista,
    cotizaciones: Array.from({ length: 45 }, (_, i) => fila(i + 1, String(100 + i + 1), `Contacto ${i + 1}`, { estado: i < 25 ? 'aceptada' : 'enviada' })).filter(
      (c) => !sin.includes(c.id)
    )
  })
  const rango = (texto: string) => screen.findByText(texto)
  const siguiente = () => fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }))
  const valor = (name: string) => (screen.getByRole('combobox', { name }) as HTMLSelectElement).value

  beforeEach(() => {
    vi.mocked(api.listar).mockResolvedValue(muchas())
    montar('/cotizaciones')
  })

  it('pages the list at 20', async () => {
    await rango('1–20 de 45')
    expect(filas()).toHaveLength(20)
    siguiente()
    expect(screen.getByText('21–40 de 45')).toBeTruthy()
  })

  it('goes back to page 1 when a filter changes', async () => {
    await rango('1–20 de 45')
    siguiente()
    fireEvent.change(screen.getByRole('combobox', { name: 'Estado' }), { target: { value: 'aceptada' } })
    expect(screen.getByText('1–20 de 25')).toBeTruthy()
  })

  it('opens as it was left after visiting a Cotización', async () => {
    await rango('1–20 de 45')
    fireEvent.change(screen.getByRole('combobox', { name: 'Categoría' }), { target: { value: 'website' } })
    fireEvent.change(screen.getByRole('combobox', { name: 'Estado' }), { target: { value: 'aceptada' } })
    siguiente()
    expect(screen.getByText('21–25 de 25')).toBeTruthy()
    fireEvent.click(filas()[0])
    await waitFor(() => expect(router.state.location.pathname).toBe('/cotizaciones/21'))
    await router.navigate('/cotizaciones')
    await rango('21–25 de 25')
    expect(valor('Categoría')).toBe('website')
    expect(valor('Estado')).toBe('aceptada')
  })

  it('shows Todos for a remembered Contacto no longer in the list', async () => {
    await rango('1–20 de 45')
    fireEvent.change(screen.getByRole('combobox', { name: 'Contacto' }), { target: { value: '1' } })
    expect(screen.getByText('1–1 de 1')).toBeTruthy()
    cleanup()
    vi.mocked(api.listar).mockResolvedValue(muchas([1]))
    montar('/cotizaciones')
    await rango('1–20 de 44')
    expect(valor('Contacto')).toBe('')
    // Forgotten, so it does not turn itself back on when that Contacto returns.
    cleanup()
    vi.mocked(api.listar).mockResolvedValue(muchas())
    montar('/cotizaciones')
    await rango('1–20 de 45')
    expect(valor('Contacto')).toBe('')
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
  it('marks the recurring prices of an imported quote', async () => {
    api.ficha = vi.fn(async (): Promise<Ficha> => ({
      ...ficha,
      partidas: [
        { concepto: 'Sitio web “Hospital Jardín”', categoria: 'website', cantidad: 1, precio: 1_800_000 },
        { concepto: 'Servicio webmaster', categoria: 'website', cantidad: 1, precio: 200_000, recurrente: true }
      ]
    }))
    montar('/cotizaciones/2')
    expect((await screen.findByText(/Servicio webmaster/)).textContent).toBe('Servicio webmaster · recurrente')
    expect(screen.getByText(/Hospital Jardín/).textContent).toBe('Sitio web “Hospital Jardín”')
  })

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
    expect((await screen.findByRole('link', { name: 'Ver proyecto' })).getAttribute('href')).toBe('/proyectos/4')
    expect(screen.queryByRole('button', { name: 'Aceptada' })).toBeNull()
  })

  it('moves a sent quote and its Proyecto to another Contacto with Cambiar contacto', async () => {
    api.ficha = vi.fn(async (): Promise<Ficha> => ({ ...ficha, acciones: [...ficha.acciones, 'cambiarContacto'] }))
    montar('/cotizaciones/2')
    fireEvent.click(await screen.findByRole('button', { name: 'Cambiar contacto' }))
    const dialogo = screen.getByRole('dialog')
    await within(dialogo).findByRole('option', { name: 'Omar Rodriguez' })
    fireEvent.change(within(dialogo).getByRole('combobox', { name: 'Contacto' }), { target: { value: '8' } })
    const previa = await within(dialogo).findByText(/Pasan a Omar Rodriguez: 1 cotización, 1 proyecto y 2 ingresos\.$/)
    expect(previa.textContent).not.toMatch(/se elimina/)
    expect(window.dmm.contactos.previaCambio).toHaveBeenCalledWith('cotizacion', 2, 8)
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Cambiar contacto' }))
    await waitFor(() => expect(api.cambiarContacto).toHaveBeenCalledWith(2, 8))
    expect(await screen.findByRole('link', { name: 'Omar Rodriguez' })).toBeTruthy()
  })

  describe('Marcar como aceptada', () => {
    const expirada: Ficha = { ...ficha, estado: 'expirada', acciones: ['aceptarTarde', 'cambiarContacto'] }
    const abrir = async () => {
      fireEvent.click(await screen.findByRole('button', { name: 'Marcar como aceptada…' }))
      return screen.getByRole('dialog')
    }

    it('is offered only when main allows it, beside Cambiar contacto', async () => {
      montar('/cotizaciones/2')
      await screen.findByRole('button', { name: 'Aceptada' })
      expect(screen.queryByRole('button', { name: 'Marcar como aceptada…' })).toBeNull()
      cleanup()

      api.ficha = vi.fn(async () => expirada)
      montar('/cotizaciones/2')
      expect(await screen.findByRole('button', { name: 'Marcar como aceptada…' })).toBeTruthy()
      expect(screen.queryByRole('button', { name: 'Aceptada' })).toBeNull()
    })

    it('accepts a quote made in the app with its Plan de cobro', async () => {
      api.ficha = vi.fn(async () => expirada)
      montar('/cotizaciones/2')
      const dialogo = await abrir()
      await within(dialogo).findByText(/proyecto en curso con su carpeta/)
      fireEvent.click(within(dialogo).getByRole('button', { name: 'Marcar como aceptada' }))
      await waitFor(() => expect(api.aceptarTarde).toHaveBeenCalledWith(2, {}))
      expect((await screen.findByRole('link', { name: 'Ver proyecto' })).getAttribute('href')).toBe('/proyectos/4')
      expect(screen.queryByRole('dialog')).toBeNull()
    })

    it('asks a USD quote made in the app for the tipo de cambio', async () => {
      api.ficha = vi.fn(async () => ({ ...expirada, moneda: 'USD' as const }))
      vi.mocked(api.opcionesAceptarTarde).mockResolvedValue({ importado: false, moneda: 'USD', proyectos: [] })
      montar('/cotizaciones/2')
      const dialogo = await abrir()
      const confirmar = within(dialogo).getByRole('button', { name: 'Marcar como aceptada' }) as HTMLButtonElement
      fireEvent.change(await within(dialogo).findByRole('spinbutton', { name: 'Tipo de cambio' }), { target: { value: '18.5' } })
      expect(confirmar.disabled).toBe(false)
      fireEvent.click(confirmar)
      await waitFor(() => expect(api.aceptarTarde).toHaveBeenCalledWith(2, { tipoCambio: 18.5 }))
    })

    it('asks an imported quote for its Proyecto, with no tipo de cambio', async () => {
      api.ficha = vi.fn(async () => expirada)
      vi.mocked(api.opcionesAceptarTarde).mockResolvedValue({ importado: true, moneda: 'USD', proyectos: [{ id: 5, nombre: 'Zamora Live', estado: 'completado' }] })
      montar('/cotizaciones/2')
      const dialogo = await abrir()
      await within(dialogo).findByText(/no se registran ingresos ni costos\.$/)
      expect(within(dialogo).queryByRole('spinbutton', { name: 'Tipo de cambio' })).toBeNull()
      fireEvent.change(within(dialogo).getByRole('combobox', { name: 'Proyecto' }), { target: { value: '5' } })
      fireEvent.click(within(dialogo).getByRole('button', { name: 'Marcar como aceptada' }))
      await waitFor(() => expect(api.aceptarTarde).toHaveBeenCalledWith(2, { proyectoId: 5 }))
    })

    it('waits for an imported quote’s Proyecto to be chosen, Proyecto nuevo included', async () => {
      api.ficha = vi.fn(async () => expirada)
      vi.mocked(api.opcionesAceptarTarde).mockResolvedValue({ importado: true, moneda: 'MXN', proyectos: [{ id: 5, nombre: 'Zamora Live', estado: 'completado' }] })
      montar('/cotizaciones/2')
      const dialogo = await abrir()
      const confirmar = within(dialogo).getByRole('button', { name: 'Marcar como aceptada' }) as HTMLButtonElement
      await within(dialogo).findByRole('combobox', { name: 'Proyecto' })
      expect(confirmar.disabled).toBe(true)
      fireEvent.change(within(dialogo).getByRole('combobox', { name: 'Proyecto' }), { target: { value: 'nuevo' } })
      await within(dialogo).findByText(/El proyecto nuevo queda completado/)
      fireEvent.click(confirmar)
      await waitFor(() => expect(api.aceptarTarde).toHaveBeenCalledWith(2, { proyectoId: 'nuevo' }))
    })

    it('keeps the dialog open while the acceptance is on its way', async () => {
      api.ficha = vi.fn(async () => expirada)
      let responder: (f: Ficha) => void = () => {}
      vi.mocked(api.aceptarTarde).mockReturnValue(new Promise((r) => (responder = r)))
      montar('/cotizaciones/2')
      const dialogo = await abrir()
      await within(dialogo).findByText(/proyecto en curso con su carpeta/)
      fireEvent.click(within(dialogo).getByRole('button', { name: 'Marcar como aceptada' }))
      await waitFor(() => expect((within(dialogo).getByRole('button', { name: 'Cancelar' }) as HTMLButtonElement).disabled).toBe(true))
      responder({ ...expirada, estado: 'aceptada', proyectoId: 4, acciones: [] })
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    })

    it('changes nothing when the dialog is closed', async () => {
      api.ficha = vi.fn(async () => expirada)
      montar('/cotizaciones/2')
      const dialogo = await abrir()
      fireEvent.click(within(dialogo).getByRole('button', { name: 'Cancelar' }))
      expect(screen.queryByRole('dialog')).toBeNull()
      expect(api.aceptarTarde).not.toHaveBeenCalled()
      expect(await screen.findByText('Expirada')).toBeTruthy()
    })
  })

  it('offers no Cambiar contacto on a draft', async () => {
    api.ficha = vi.fn(async (): Promise<Ficha> => ({ ...ficha, estado: 'borrador', acciones: ['editar', 'borrar', 'enviar'] }))
    montar('/cotizaciones/2')
    await screen.findByRole('button', { name: 'Editar' })
    expect(screen.queryByRole('button', { name: 'Cambiar contacto' })).toBeNull()
  })
})
