// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ConceptoCatalogo } from '../../../shared/dominio'
import type { DmmApi } from '../../../shared/contrato'
import { Catalogo } from './Catalogo'

const sitio: ConceptoCatalogo = { id: 1, concepto: 'Sitio web · 6 secc.', categoria: 'website', precio: 2_400_000 }

let api: DmmApi['catalogo']

beforeEach(() => {
  api = {
    listar: vi.fn(async () => [sitio]),
    guardar: vi.fn(async () => [sitio]),
    borrar: vi.fn(async () => [])
  }
  window.dmm = { catalogo: api } as unknown as DmmApi
})
afterEach(cleanup)

describe('Configuración → Catálogo', () => {
  it('shows each concept with its category and default price', async () => {
    render(<Catalogo />)
    expect(await screen.findByText('Sitio web · 6 secc.')).toBeTruthy()
    expect(screen.getByText('Website')).toBeTruthy()
    expect(screen.getByText('$24,000.00')).toBeTruthy()
  })

  it('adds a concept, price in pesos stored as centavos', async () => {
    render(<Catalogo />)
    await screen.findByText(sitio.concepto)
    fireEvent.click(screen.getByRole('button', { name: 'Agregar concepto' }))
    fireEvent.change(screen.getByLabelText('Concepto'), { target: { value: 'Chatbot AI' } })
    fireEvent.change(screen.getByLabelText('Categoría'), { target: { value: 'ai' } })
    fireEvent.change(screen.getByLabelText('Precio'), { target: { value: '18000.50' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(api.guardar).toHaveBeenCalledWith({ concepto: 'Chatbot AI', categoria: 'ai', precio: 1_800_050 }))
  })

  it('edits a concept with its current values', async () => {
    render(<Catalogo />)
    await screen.findByText(sitio.concepto)
    fireEvent.click(screen.getByRole('button', { name: `Editar ${sitio.concepto}` }))
    expect((screen.getByLabelText('Precio') as HTMLInputElement).value).toBe('24000')
    fireEvent.change(screen.getByLabelText('Precio'), { target: { value: '26000' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(api.guardar).toHaveBeenCalledWith({ ...sitio, precio: 2_600_000 }))
  })

  it('deletes a concept only after confirming', async () => {
    render(<Catalogo />)
    await screen.findByText(sitio.concepto)
    fireEvent.click(screen.getByRole('button', { name: `Borrar ${sitio.concepto}` }))
    expect(api.borrar).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'No borrar' }))
    expect(screen.queryByRole('button', { name: 'Sí, borrar' })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: `Borrar ${sitio.concepto}` }))
    fireEvent.click(screen.getByRole('button', { name: 'Sí, borrar' }))
    await waitFor(() => expect(api.borrar).toHaveBeenCalledWith(1))
    await waitFor(() => expect(screen.queryByText(sitio.concepto)).toBeNull())
  })

  it('shows why main refused a concept', async () => {
    api.guardar = vi.fn(async () => {
      throw new Error("Error invoking remote method 'catalogo:guardar': Error: El concepto necesita nombre")
    })
    render(<Catalogo />)
    await screen.findByText(sitio.concepto)
    fireEvent.click(screen.getByRole('button', { name: 'Agregar concepto' }))
    fireEvent.change(screen.getByLabelText('Precio'), { target: { value: '100' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'El concepto necesita nombre')
  })
})
