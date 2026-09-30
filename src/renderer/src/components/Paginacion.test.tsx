// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { PiePaginacion, usePaginacion } from './Paginacion'
import { olvidarRecordado } from './recordado'

function Tabla({ total, filtro = '' }: { total: number; filtro?: string }) {
  const filas = Array.from({ length: total }, (_, i) => i + 1)
  const { visibles, pie } = usePaginacion(filas, 'prueba', [filtro])
  return (
    <>
      <ul>
        {visibles.map((n) => (
          <li key={n}>{n}</li>
        ))}
      </ul>
      <PiePaginacion pie={pie} />
    </>
  )
}

const filas = () => screen.queryAllByRole('listitem').map((li) => Number(li.textContent))
const boton = (name: string) => screen.getByRole('button', { name }) as HTMLButtonElement
const siguiente = () => fireEvent.click(boton('Siguiente'))

beforeEach(olvidarRecordado)
afterEach(cleanup)

describe('usePaginacion', () => {
  it('shows 20 rows a page and says which', () => {
    render(<Tabla total={45} />)
    expect(filas()).toHaveLength(20)
    expect(screen.getByText('1–20 de 45')).toBeTruthy()
    expect(boton('Anterior').disabled).toBe(true)
    siguiente()
    expect(screen.getByText('21–40 de 45')).toBeTruthy()
    siguiente()
    expect(filas()).toEqual([41, 42, 43, 44, 45])
    expect(screen.getByText('41–45 de 45')).toBeTruthy()
    expect(boton('Siguiente').disabled).toBe(true)
    fireEvent.click(boton('Anterior'))
    expect(screen.getByText('21–40 de 45')).toBeTruthy()
  })

  it('shows the footer, disabled, when every row fits', () => {
    render(<Tabla total={3} />)
    expect(screen.getByText('1–3 de 3')).toBeTruthy()
    expect(boton('Anterior').disabled).toBe(true)
    expect(boton('Siguiente').disabled).toBe(true)
  })

  it('shows no range and disabled buttons with no rows', () => {
    const { container } = render(<Tabla total={0} />)
    expect(container.textContent).not.toMatch(/de 0/)
    expect(boton('Anterior').disabled).toBe(true)
    expect(boton('Siguiente').disabled).toBe(true)
  })

  it('goes back to page 1 when the filters change', () => {
    const { rerender } = render(<Tabla total={45} />)
    siguiente()
    rerender(<Tabla total={45} filtro="Aceptada" />)
    expect(screen.getByText('1–20 de 45')).toBeTruthy()
  })

  it('keeps the page when the table opens again with the same filters', () => {
    const { unmount } = render(<Tabla total={45} filtro="Website" />)
    siguiente()
    siguiente()
    unmount()
    render(<Tabla total={45} filtro="Website" />)
    expect(screen.getByText('41–45 de 45')).toBeTruthy()
  })

  it('goes back to page 1 when the filters change and then change back', () => {
    const { rerender } = render(<Tabla total={45} />)
    siguiente()
    siguiente()
    rerender(<Tabla total={45} filtro="a" />)
    rerender(<Tabla total={45} />)
    expect(screen.getByText('1–20 de 45')).toBeTruthy()
  })

  it('moves to the last page with rows when the list shrinks, and stays there when it grows back', () => {
    const { rerender } = render(<Tabla total={21} />)
    siguiente()
    expect(screen.getByText('21–21 de 21')).toBeTruthy()
    rerender(<Tabla total={20} />)
    expect(screen.getByText('1–20 de 20')).toBeTruthy()
    rerender(<Tabla total={21} />)
    expect(screen.getByText('1–20 de 21')).toBeTruthy()
  })

  it('keeps the page while the list is still loading', () => {
    const { rerender } = render(<Tabla total={45} />)
    siguiente()
    rerender(<Tabla total={0} />)
    rerender(<Tabla total={45} />)
    expect(screen.getByText('21–40 de 45')).toBeTruthy()
  })
})
