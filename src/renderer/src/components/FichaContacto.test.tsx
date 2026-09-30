// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import type { FichaContacto as Ficha } from '../../../shared/dominio'
import type { DmmApi } from '../../../shared/contrato'
import { FichaContacto } from './FichaContacto'
import { olvidarRecordado } from './recordado'

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
  olvidarRecordado()
  api = {
    listar: vi.fn(async () => ({ contactos: [{ id: 7, nombre: 'Hotel Aura' }, { id: 9, nombre: 'Grupo Aura' }] }) as never),
    ficha: vi.fn(async () => ficha),
    guardar: vi.fn(async () => 7),
    borrar: vi.fn(async () => undefined),
    fusionar: vi.fn(async () => 9),
    previaCambio: vi.fn(),
    csv: vi.fn()
  }
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

  it('edits its data, notes included, then shows the saved record', async () => {
    fireEvent.click(await screen.findByRole('button', { name: 'Editar' }))
    const dialogo = screen.getByRole('dialog', { name: 'Editar contacto' })
    expect((within(dialogo).getByLabelText('Nombre') as HTMLInputElement).value).toBe('Hotel Aura')
    expect((within(dialogo).getByLabelText('Dirección') as HTMLInputElement).value).toBe('')
    fireEvent.change(within(dialogo).getByLabelText('Notas'), { target: { value: 'Prefiere correo.' } })
    vi.mocked(api.ficha).mockResolvedValue({ ...ficha, contacto: { ...ficha.contacto, notas: 'Prefiere correo.' } })
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Guardar' }))
    expect(await screen.findByText('Prefiere correo.')).toBeTruthy()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(api.guardar).toHaveBeenCalledWith({
      id: 7,
      nombre: 'Hotel Aura',
      empresa: 'Laura Méndez',
      email: 'reservas@hotelaura.mx',
      telefono: '998 456 7890',
      direccion: '',
      notas: 'Prefiere correo.'
    })
  })
})

describe('Fusionar en…', () => {
  it('offers the other Contactos, says what moves and that this one is deleted, then opens the destino', async () => {
    fireEvent.click(await screen.findByRole('button', { name: 'Fusionar en…' }))
    const dialogo = screen.getByRole('dialog')
    const select = await within(dialogo).findByRole('combobox', { name: 'Contacto' })
    await within(dialogo).findByRole('option', { name: 'Grupo Aura' })
    expect(within(dialogo).queryByRole('option', { name: 'Hotel Aura' })).toBeNull()
    expect((within(dialogo).getByRole('button', { name: 'Fusionar' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(select, { target: { value: '9' } })
    expect(within(dialogo).getByText(/3 cotizaciones, 1 proyecto y sus pagos pasan a Grupo Aura.*Hotel Aura se elimina/)).toBeTruthy()
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Fusionar' }))
    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/contactos/9'))
    expect(api.fusionar).toHaveBeenCalledWith(7, 9)
  })

  it('shows main’s refusal in place and stays open', async () => {
    vi.mocked(api.fusionar).mockRejectedValueOnce(new Error('No se puede fusionar: Hotel Aura tiene el RFC HAU190314XX0 y Grupo Aura el RFC GAU010101AAA'))
    fireEvent.click(await screen.findByRole('button', { name: 'Fusionar en…' }))
    const dialogo = screen.getByRole('dialog')
    await within(dialogo).findByRole('option', { name: 'Grupo Aura' })
    fireEvent.change(within(dialogo).getByRole('combobox', { name: 'Contacto' }), { target: { value: '9' } })
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Fusionar' }))
    expect(await within(dialogo).findByText(/tiene el RFC HAU190314XX0/)).toBeTruthy()
    expect(router.state.location.pathname).toBe('/contactos/7')
  })

  it('writes nothing when closed', async () => {
    fireEvent.click(await screen.findByRole('button', { name: 'Fusionar en…' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancelar' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(api.fusionar).not.toHaveBeenCalled()
  })
})

describe('Historial, 20 a page', () => {
  // 25 movements: 22 Pagos, then 3 Cotizaciones.
  const largo: Ficha = {
    ...ficha,
    historial: Array.from({ length: 25 }, (_, i) =>
      i < 22
        ? { tipo: 'pago' as const, id: i + 1, fecha: '2026-09-05', referencia: null, detalle: `Pago ${i + 1}`, monto: 100_000, estado: 'pagado' }
        : { tipo: 'cotizacion' as const, id: i + 1, fecha: '2026-08-20', referencia: String(400 + i), detalle: 'Sitio', monto: 100_000, estado: 'enviada' }
    )
  }
  const historial = () => screen.getByRole('table', { name: 'Historial' }).closest('section')!
  const siguiente = () => fireEvent.click(within(historial()).getByRole('button', { name: 'Siguiente' }))

  beforeEach(async () => {
    vi.mocked(api.ficha).mockImplementation(async (id: number) => ({ ...largo, contacto: { ...largo.contacto, id } }))
    await router.navigate('/contactos/8')
    await screen.findByText('1–20 de 25')
  })

  it('pages the Historial at 20', () => {
    expect(within(screen.getByRole('table', { name: 'Historial' })).getAllByRole('row').slice(1)).toHaveLength(20)
    siguiente()
    expect(within(historial()).getByText('21–25 de 25')).toBeTruthy()
  })

  it('goes back to page 1 when the filter changes', () => {
    siguiente()
    fireEvent.click(within(historial()).getByRole('tab', { name: 'Pagos' }))
    expect(within(historial()).getByText('1–20 de 22')).toBeTruthy()
  })

  it('does not page the previous Contacto’s Historial while the next one loads', async () => {
    siguiente()
    let cargar: (f: Ficha) => void = () => {}
    vi.mocked(api.ficha).mockImplementationOnce(() => new Promise<Ficha>((r) => (cargar = r)))
    await router.navigate('/contactos/9')
    await waitFor(() => expect(within(screen.getByRole('table', { name: 'Historial' })).getAllByRole('row')).toHaveLength(1))
    cargar({ ...largo, contacto: { ...largo.contacto, id: 9 } })
    expect(await within(historial()).findByText('1–20 de 25')).toBeTruthy()
  })

  it('keeps the filter and page per Contacto', async () => {
    fireEvent.click(within(historial()).getByRole('tab', { name: 'Pagos' }))
    siguiente()
    expect(within(historial()).getByText('21–22 de 22')).toBeTruthy()
    await router.navigate('/contactos/9')
    expect(await within(historial()).findByText('1–20 de 25')).toBeTruthy()
    expect(within(historial()).getByRole('tab', { name: 'Todo' }).getAttribute('aria-selected')).toBe('true')
    await router.navigate('/contactos/8')
    expect(await within(historial()).findByText('21–22 de 22')).toBeTruthy()
    expect(within(historial()).getByRole('tab', { name: 'Pagos' }).getAttribute('aria-selected')).toBe('true')
  })
})
