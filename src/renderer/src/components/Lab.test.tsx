// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { ArchivoLab, CarpetaLab } from '../../../shared/dominio'
import type { DmmApi } from '../../../shared/contrato'
import { dia } from '../../../shared/formato'
import { Lab } from './Lab'

const carpetas: CarpetaLab[] = [
  { nombre: 'Benchmarks', archivos: 2 },
  { nombre: 'Design Systems', archivos: 0 }
]

const benchmarks: ArchivoLab[] = [
  { nombre: 'benchmark-landing-hoteles.md', tipo: 'MD', bytes: 18_432, modificado: '2026-09-09T16:00:00.000Z' },
  { nombre: 'benchmark-ecommerce-mezcal.pdf', tipo: 'PDF', bytes: 2_202_010, modificado: '2026-08-28T16:00:00.000Z' }
]

let api: DmmApi['lab']

const montar = (lab: Partial<DmmApi['lab']> = {}) => {
  api = {
    carpetas: vi.fn(async () => carpetas),
    archivos: vi.fn(async (carpeta: string) => (carpeta === 'Benchmarks' ? benchmarks : [])),
    abrir: vi.fn(async () => undefined),
    ...lab
  }
  window.dmm = { lab: api } as unknown as DmmApi
  render(<Lab />)
}

const filas = () => within(screen.getByRole('table')).getAllByRole('row').slice(1)

afterEach(cleanup)
beforeEach(() => vi.clearAllMocks())

describe('Lab', () => {
  it('lists every folder with its file count, empty ones at 0', async () => {
    montar()
    const lista = await screen.findByRole('list', { name: 'Carpetas' })
    const items = within(lista).getAllByRole('button').map((b) => b.textContent)
    expect(items).toEqual(['Benchmarks2', 'Design Systems0'])
  })

  it('shows the first folder’s files with name, type, size and modified date', async () => {
    montar()
    await screen.findByText('benchmark-landing-hoteles.md')
    expect(api.archivos).toHaveBeenCalledWith('Benchmarks')
    const [primera, segunda] = filas()
    expect(within(primera).getByText('MD')).toBeTruthy()
    expect(within(primera).getByText('18 KB')).toBeTruthy()
    expect(within(primera).getByText(dia('2026-09-09'))).toBeTruthy()
    expect(within(segunda).getByText('benchmark-ecommerce-mezcal.pdf')).toBeTruthy()
    expect(within(segunda).getByText('2.1 MB')).toBeTruthy()
  })

  it('shows the files of the folder picked', async () => {
    montar()
    await screen.findByText('benchmark-landing-hoteles.md')
    fireEvent.click(screen.getByRole('button', { name: /Design Systems/ }))
    expect(await screen.findByText(/Sin archivos/i)).toBeTruthy()
    expect(api.archivos).toHaveBeenLastCalledWith('Design Systems')
  })

  it('opens a file, and the folder in Finder', async () => {
    montar()
    await screen.findByText('benchmark-landing-hoteles.md')
    fireEvent.click(within(filas()[0]).getByRole('button', { name: 'Abrir' }))
    await waitFor(() => expect(api.abrir).toHaveBeenCalledWith('Benchmarks/benchmark-landing-hoteles.md'))
    fireEvent.click(screen.getByRole('button', { name: 'Abrir en Finder' }))
    await waitFor(() => expect(api.abrir).toHaveBeenLastCalledWith('Benchmarks'))
  })

  it('has no create, edit or delete actions', async () => {
    montar()
    await screen.findByText('benchmark-landing-hoteles.md')
    const acciones = screen.getAllByRole('button').map((b) => b.textContent)
    expect(acciones.filter((a) => /nuev|edit|borr|elimin|renombr/i.test(a ?? ''))).toEqual([])
  })

  it('says why Lab/ could not be read', async () => {
    montar({
      carpetas: vi.fn(async () => {
        throw new Error("Error invoking remote method 'lab:carpetas': Error: No se encontró la carpeta Lab/ en /Users/fv/DMM OS")
      })
    })
    expect((await screen.findByRole('alert')).textContent).toBe('No se encontró la carpeta Lab/ en /Users/fv/DMM OS')
  })
})
