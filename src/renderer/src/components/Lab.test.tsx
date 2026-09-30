// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { ArchivoEnLab, ArchivoLab, CarpetaLab } from '../../../shared/dominio'
import type { DmmApi } from '../../../shared/contrato'
import { dia } from '../../../shared/formato'
import { Lab } from './Lab'
import { olvidarRecordado } from './recordado'

const carpetas: CarpetaLab[] = [
  { nombre: 'Benchmarks', archivos: 2 },
  { nombre: 'Design Systems', archivos: 0 },
  { nombre: 'Newsletter', archivos: null }
]

const benchmarks: ArchivoLab[] = [
  { nombre: 'benchmark-landing-hoteles.md', tipo: 'MD', bytes: 18_432, modificado: new Date(2026, 8, 9, 12).toISOString() },
  { nombre: 'benchmark-ecommerce-mezcal.pdf', tipo: 'PDF', bytes: 2_202_010, modificado: new Date(2026, 7, 28, 12).toISOString() }
]

const encontrados: ArchivoEnLab[] = [
  { carpeta: 'Newsletter', nombre: 'boletin-hoteles.txt', tipo: 'TXT', bytes: 512, modificado: new Date(2026, 8, 12, 12).toISOString() },
  { carpeta: 'Benchmarks', ...benchmarks[0] }
]

let api: DmmApi['lab']

const montar = (lab: Partial<DmmApi['lab']> = {}) => {
  api = {
    carpetas: vi.fn(async () => carpetas),
    archivos: vi.fn(async (carpeta: string) => (carpeta === 'Benchmarks' ? benchmarks : [])),
    buscar: vi.fn(async (consulta: string) => (consulta.trim() ? encontrados : [])),
    vistaPrevia: vi.fn(async (ruta: string) => (/\.(md|txt)$/.test(ruta) ? { texto: `# Contenido de ${ruta}`, recortado: false } : null)),
    abrir: vi.fn(async () => undefined),
    ...lab
  }
  window.dmm = { lab: api } as unknown as DmmApi
  render(<Lab />)
}

const filas = () => within(screen.getByRole('table')).getAllByRole('row').slice(1)
const vistaPrevia = () => screen.getByRole('region', { name: 'Vista previa' })
const buscar = (consulta: string) => fireEvent.change(screen.getByRole('searchbox'), { target: { value: consulta } })

beforeEach(olvidarRecordado)
afterEach(cleanup)

describe('Lab', () => {
  it('lists every folder with its file count, empty ones at 0', async () => {
    montar()
    const lista = await screen.findByRole('list', { name: 'Carpetas' })
    const items = within(lista).getAllByRole('button').map((b) => b.textContent)
    expect(items).toEqual(['Benchmarks2', 'Design Systems0', 'Newsletter—'])
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

  it('shows the files of the folder picked, re-reading the folders', async () => {
    montar()
    await screen.findByText('benchmark-landing-hoteles.md')
    vi.mocked(api.carpetas).mockResolvedValue([...carpetas, { nombre: 'Social Media', archivos: 0 }])
    fireEvent.click(screen.getByRole('button', { name: /Design Systems/ }))
    expect(await screen.findByText(/Sin archivos/i)).toBeTruthy()
    expect(api.archivos).toHaveBeenLastCalledWith('Design Systems')
    expect(screen.getByRole('button', { name: /Social Media/ })).toBeTruthy()
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

  it('searches file names across all of Lab, saying which folder each is in', async () => {
    montar()
    await screen.findByText('benchmark-landing-hoteles.md')
    buscar('  hoteles ')
    expect(await screen.findByText('boletin-hoteles.txt')).toBeTruthy()
    expect(api.buscar).toHaveBeenLastCalledWith('hoteles')
    const [primera, segunda] = filas()
    expect(within(primera).getByText('Newsletter')).toBeTruthy()
    expect(within(segunda).getByText('Benchmarks')).toBeTruthy()
    expect(screen.queryByText('benchmark-ecommerce-mezcal.pdf')).toBeNull()
  })

  it('opens a file found by the search from its own folder', async () => {
    montar()
    await screen.findByText('benchmark-landing-hoteles.md')
    buscar('hoteles')
    await screen.findByText('boletin-hoteles.txt')
    fireEvent.click(within(filas()[0]).getByRole('button', { name: 'Abrir' }))
    await waitFor(() => expect(api.abrir).toHaveBeenCalledWith('Newsletter/boletin-hoteles.txt'))
  })

  it('says when nothing matches, and shows the folder again once the search is cleared', async () => {
    montar({ buscar: vi.fn(async () => []) })
    await screen.findByText('benchmark-landing-hoteles.md')
    buscar('zzz')
    expect(await screen.findByText('Ningún archivo coincide.')).toBeTruthy()
    buscar('')
    expect(await screen.findByText('benchmark-ecommerce-mezcal.pdf')).toBeTruthy()
  })

  it('shows the latest search’s results even when an earlier one answers last', async () => {
    let lenta: (a: ArchivoEnLab[]) => void = () => {}
    montar({
      buscar: vi.fn((consulta: string) =>
        consulta === 'h' ? new Promise<ArchivoEnLab[]>((r) => (lenta = r)) : Promise.resolve([encontrados[0]])
      )
    })
    await screen.findByText('benchmark-landing-hoteles.md')
    buscar('h')
    buscar('hoteles')
    await screen.findByText('boletin-hoteles.txt')
    lenta([encontrados[1]])
    await waitFor(() => expect(filas()).toHaveLength(1))
    expect(screen.getByText('boletin-hoteles.txt')).toBeTruthy()
  })

  it('previews a text file picked from the list', async () => {
    montar()
    await screen.findByText('benchmark-landing-hoteles.md')
    fireEvent.click(screen.getByRole('button', { name: 'benchmark-landing-hoteles.md' }))
    expect(await within(vistaPrevia()).findByText('# Contenido de Benchmarks/benchmark-landing-hoteles.md')).toBeTruthy()
    expect(api.vistaPrevia).toHaveBeenCalledWith('Benchmarks/benchmark-landing-hoteles.md')
  })

  it('previews a text file found by the search', async () => {
    montar()
    await screen.findByText('benchmark-landing-hoteles.md')
    buscar('hoteles')
    fireEvent.click(await screen.findByRole('button', { name: 'boletin-hoteles.txt' }))
    expect(await within(vistaPrevia()).findByText('# Contenido de Newsletter/boletin-hoteles.txt')).toBeTruthy()
  })

  it('says when a preview is cut short', async () => {
    montar({ vistaPrevia: vi.fn(async () => ({ texto: 'inicio', recortado: true })) })
    await screen.findByText('benchmark-landing-hoteles.md')
    fireEvent.click(screen.getByRole('button', { name: 'benchmark-landing-hoteles.md' }))
    expect(await within(vistaPrevia()).findByText(/recortada/i)).toBeTruthy()
  })

  it('offers only Abrir for a file with no preview', async () => {
    montar()
    await screen.findByText('benchmark-landing-hoteles.md')
    fireEvent.click(screen.getByRole('button', { name: 'benchmark-ecommerce-mezcal.pdf' }))
    expect(await within(vistaPrevia()).findByText(/Sin vista previa/)).toBeTruthy()
    expect(vistaPrevia().querySelector('pre')).toBeNull()
    fireEvent.click(within(vistaPrevia()).getByRole('button', { name: 'Abrir' }))
    await waitFor(() => expect(api.abrir).toHaveBeenCalledWith('Benchmarks/benchmark-ecommerce-mezcal.pdf'))
  })

  it('says why a preview could not be read, and keeps the file’s Abrir', async () => {
    montar({
      vistaPrevia: vi.fn(async () => {
        throw new Error("Error invoking remote method 'lab:vistaPrevia': Error: EISDIR")
      })
    })
    await screen.findByText('benchmark-landing-hoteles.md')
    fireEvent.click(screen.getByRole('button', { name: 'benchmark-landing-hoteles.md' }))
    expect(await within(vistaPrevia()).findByText('EISDIR')).toBeTruthy()
    fireEvent.click(within(vistaPrevia()).getByRole('button', { name: 'Abrir' }))
    await waitFor(() => expect(api.abrir).toHaveBeenCalledWith('Benchmarks/benchmark-landing-hoteles.md'))
  })

  it('keeps every action usable while a preview loads', async () => {
    montar({ vistaPrevia: vi.fn(() => new Promise<null>(() => {})) })
    await screen.findByText('benchmark-landing-hoteles.md')
    fireEvent.click(screen.getByRole('button', { name: 'benchmark-landing-hoteles.md' }))
    expect(screen.getByRole('button', { name: 'Abrir en Finder' }).hasAttribute('disabled')).toBe(false)
  })
})

describe('Lab, 20 a page', () => {
  const archivo = (n: number): ArchivoLab => ({ nombre: `nota-${String(n).padStart(2, '0')}.md`, tipo: 'MD', bytes: 512, modificado: new Date(2026, 8, 1, 12).toISOString() })
  // Benchmarks holds 25 files, Design Systems 22; the search finds 21.
  const archivos = vi.fn(async (carpeta: string) => Array.from({ length: carpeta === 'Benchmarks' ? 25 : 22 }, (_, i) => archivo(i + 1)))
  const busca = vi.fn(async () => Array.from({ length: 21 }, (_, i) => ({ carpeta: 'Newsletter', ...archivo(i + 1) })))
  const siguiente = () => fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }))

  beforeEach(async () => {
    montar({ archivos, buscar: busca })
    await screen.findByText('1–20 de 25')
  })

  it('pages a folder at 20', () => {
    expect(filas()).toHaveLength(20)
    siguiente()
    expect(screen.getByText('21–25 de 25')).toBeTruthy()
  })

  it('goes back to page 1 when another folder is picked', async () => {
    siguiente()
    fireEvent.click(screen.getByRole('button', { name: /Design Systems/ }))
    expect(await screen.findByText('1–20 de 22')).toBeTruthy()
  })

  it('opens on the folder, search and page it was left on', async () => {
    fireEvent.click(screen.getByRole('button', { name: /Design Systems/ }))
    await screen.findByText('1–20 de 22')
    siguiente()
    cleanup()
    montar({ archivos, buscar: busca })
    expect(await screen.findByText('21–22 de 22')).toBeTruthy()
    expect(api.archivos).toHaveBeenLastCalledWith('Design Systems')

    buscar('nota')
    await screen.findByText('1–20 de 21')
    siguiente()
    cleanup()
    montar({ archivos, buscar: busca })
    expect(await screen.findByText('21–21 de 21')).toBeTruthy()
    expect(api.buscar).toHaveBeenCalledWith('nota')
    expect((screen.getByRole('searchbox') as HTMLInputElement).value).toBe('nota')
  })

  it('shows no folder or search it was left on once Lab/ has no folders', async () => {
    buscar('nota')
    await screen.findByText('1–20 de 21')
    cleanup()
    montar({ archivos, buscar: busca, carpetas: vi.fn(async () => []) })
    expect(await screen.findByText('Lab/ no tiene carpetas todavía.')).toBeTruthy()
    expect(screen.queryByText('Resultados en Lab')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Siguiente' })).toBeNull()
  })

  it('picks the first folder when the one it was left on is gone', async () => {
    fireEvent.click(screen.getByRole('button', { name: /Design Systems/ }))
    await screen.findByText('1–20 de 22')
    siguiente()
    cleanup()
    montar({ archivos, buscar: busca, carpetas: vi.fn(async () => carpetas.filter((c) => c.nombre !== 'Design Systems')) })
    expect(await screen.findByText('1–20 de 25')).toBeTruthy()
    expect(api.archivos).toHaveBeenLastCalledWith('Benchmarks')
  })
})
