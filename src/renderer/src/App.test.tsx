// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { routes } from './routes'

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
})
