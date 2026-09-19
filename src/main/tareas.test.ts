import { beforeEach, describe, expect, it } from 'vitest'
import { agregarTarea, borrarTarea, completarTarea, listarTareas } from './tareas'
import { db, reiniciarDb } from './db/test-db'

beforeEach(reiniciarDb)

describe('Tareas', () => {
  it('lists pending tasks oldest first, dated the day they were registered', () => {
    agregarTarea(db, 'Enviar factura a Clínica Sol', '2026-09-10')
    agregarTarea(db, '  Llamar a Hotel Aura ', '2026-09-12')
    expect(listarTareas(db, '2026-09-18').pendientes.map((t) => [t.texto, t.fechaRegistro])).toEqual([
      ['Enviar factura a Clínica Sol', '2026-09-10'],
      ['Llamar a Hotel Aura', '2026-09-12']
    ])
  })

  it('refuses a task without text', () => {
    expect(() => agregarTarea(db, '   ', '2026-09-18')).toThrow('La tarea necesita texto')
  })

  it('a done task moves to hechas with its done date, newest first, for 30 days', () => {
    const [a, b, c] = ['Vieja', 'Reciente', 'Hoy'].map((t) => agregarTarea(db, t, '2026-08-01').pendientes.at(-1)!)
    completarTarea(db, a.id, '2026-08-18')
    completarTarea(db, b.id, '2026-08-19')
    completarTarea(db, c.id, '2026-09-18')
    const { pendientes, hechas } = listarTareas(db, '2026-09-18')
    expect(pendientes).toEqual([])
    expect(hechas.map((t) => [t.texto, t.fechaHecha])).toEqual([
      ['Hoy', '2026-09-18'],
      ['Reciente', '2026-08-19']
    ])
  })

  it('reports its window, and keeps a task done exactly that many days ago', () => {
    const [a, b] = ['Justo', 'Fuera'].map((t) => agregarTarea(db, t, '2026-08-01').pendientes.at(-1)!)
    completarTarea(db, a.id, '2026-08-19')
    completarTarea(db, b.id, '2026-08-18')
    const lista = listarTareas(db, '2026-09-18')
    expect(lista.dias).toBe(30)
    expect(lista.hechas.map((t) => t.texto)).toEqual(['Justo'])
  })

  it('completing twice keeps the first done date', () => {
    const [t] = agregarTarea(db, 'Una', '2026-09-01').pendientes
    completarTarea(db, t.id, '2026-09-02')
    expect(completarTarea(db, t.id, '2026-09-05').hechas[0].fechaHecha).toBe('2026-09-02')
  })

  it('deletes a task', () => {
    const [t] = agregarTarea(db, 'Una', '2026-09-01').pendientes
    expect(borrarTarea(db, t.id, '2026-09-01')).toMatchObject({ pendientes: [], hechas: [] })
  })

  it('cannot complete a task that does not exist', () => {
    expect(() => completarTarea(db, 999, '2026-09-01')).toThrow('No existe la tarea')
  })
})
