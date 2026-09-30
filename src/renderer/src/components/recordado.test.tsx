// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { olvidarRecordado, useRecordado } from './recordado'

function Campo({ clave }: { clave: string }) {
  const [valor, fijar] = useRecordado(clave, 'inicial')
  return <input aria-label={clave} value={valor} onChange={(e) => fijar(e.target.value)} />
}

const campo = (clave: string) => screen.getByLabelText(clave) as HTMLInputElement

beforeEach(olvidarRecordado)
afterEach(cleanup)

describe('useRecordado', () => {
  it('brings a value back after the screen closes and opens again', () => {
    const { unmount } = render(<Campo clave="cotizaciones.busqueda" />)
    fireEvent.change(campo('cotizaciones.busqueda'), { target: { value: 'Uribe' } })
    unmount()
    render(<Campo clave="cotizaciones.busqueda" />)
    expect(campo('cotizaciones.busqueda').value).toBe('Uribe')
  })

  it('keeps each clave apart', () => {
    render(
      <>
        <Campo clave="a" />
        <Campo clave="b" />
      </>
    )
    fireEvent.change(campo('a'), { target: { value: 'uno' } })
    expect(campo('a').value).toBe('uno')
    expect(campo('b').value).toBe('inicial')
  })

  it('follows a clave that changes while mounted', () => {
    function PorContacto({ id }: { id: number }) {
      const [valor, fijar] = useRecordado(`historial.${id}`, 'inicial')
      return <input aria-label="historial" value={valor} onChange={(e) => fijar(e.target.value)} />
    }
    const { rerender } = render(<PorContacto id={1} />)
    fireEvent.change(campo('historial'), { target: { value: 'uno' } })
    rerender(<PorContacto id={2} />)
    expect(campo('historial').value).toBe('inicial')
    rerender(<PorContacto id={1} />)
    expect(campo('historial').value).toBe('uno')
  })

  it('olvidarRecordado brings back the initial value', () => {
    const { unmount } = render(<Campo clave="a" />)
    fireEvent.change(campo('a'), { target: { value: 'uno' } })
    unmount()
    olvidarRecordado()
    render(<Campo clave="a" />)
    expect(campo('a').value).toBe('inicial')
  })
})
