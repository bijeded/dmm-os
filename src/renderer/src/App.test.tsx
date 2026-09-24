// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { tituloCls } from './components/estilos'
import type { DmmApi } from '../../shared/contrato'
import { routes } from './routes'
import { sections } from './sections'

afterEach(cleanup)

const renderAt = (path: string) => render(<RouterProvider router={createMemoryRouter(routes, { initialEntries: [path] })} />)

describe('app shell', () => {
  it('lists the sections in the sidebar, in order', () => {
    renderAt('/')
    const nav = screen.getByRole('navigation')
    const labels = within(nav).getAllByRole('link').map((a) => a.textContent)
    expect(labels).toEqual(['Inicio', 'Contactos', 'Cotizaciones', 'Proyectos', 'Finanzas', 'Lab', 'AI', 'Configuración'])
  })

  it('marks the current section and titles the page', () => {
    renderAt('/finanzas')
    expect(screen.getByRole('link', { name: 'Finanzas' }).getAttribute('aria-current')).toBe('page')
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Finanzas')
  })

  it('keeps the logo out of the window controls row', () => {
    renderAt('/')
    expect(screen.getByRole('img', { name: 'DMM Studios' }).closest('.app-drag')).toBeNull()
  })

  // The sidebar logo is placed from the title tokens, so every page title has to use them.
  it.each(sections)('titles $label in the shared title style', ({ path }) => {
    // Pages that load data get calls that never settle; only the title matters here.
    const pendiente = new Proxy({}, { get: () => () => new Promise(() => {}) })
    window.dmm = new Proxy({}, { get: () => pendiente }) as DmmApi
    renderAt(path)
    expect(screen.getByRole('heading', { level: 1 }).className).toBe(tituloCls)
  })
})
