import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { costos, cotizaciones, ingresos, proyectos, ubicacionesArchivo } from './db/schema'
import { contacto, cotizacionAceptada, db, ingresoBase, proyecto, reiniciarDb } from './db/test-db'
import { importarCarpetaProyecto } from './importacion/carpetas'
import {
  borrarProyecto,
  cancelarProyecto,
  carpetaAbrible,
  completarProyecto,
  crearCarpeta,
  fichaProyecto,
  guardarProyecto,
  listarProyectos,
  pausarProyecto,
  reanudarProyecto
} from './proyectos'
import type { ProyectoNuevo } from '../shared/ipc'

let root: string
let contactoId: number
const hoy = '2026-09-18'

beforeEach(() => {
  reiniciarDb()
  root = mkdtempSync(join(tmpdir(), 'dmm-proyectos-'))
  contactoId = contacto('Clínica Sol').id
})

const nuevo = (cambios: Partial<ProyectoNuevo> = {}): ProyectoNuevo => ({
  nombre: 'Sitio web',
  etiqueta: 'cliente',
  contactoId,
  clienteFinal: null,
  categoria: 'website',
  fechaInicio: '2026-09-01',
  fechaEntrega: null,
  notas: null,
  ...cambios
})

describe('guardar', () => {
  it('creates the Proyecto en curso and scaffolds its folder in Proyectos/', () => {
    const f = guardarProyecto(db, root, nuevo(), hoy)
    expect(f).toMatchObject({ nombre: 'Sitio web', estado: 'en_curso', contacto: 'Clínica Sol', referencia: `PRY-${String(f.id).padStart(3, '0')}` })
    expect(f.carpeta).toEqual({ estado: 'disponible', ruta: 'Proyectos/Clínica Sol - Sitio web', abrible: true })
    expect(existsSync(join(root, 'Proyectos/Clínica Sol - Sitio web'))).toBe(true)
  })

  it('creates a personal Proyecto with no Contacto, its folder named after it', () => {
    const f = guardarProyecto(db, root, nuevo({ etiqueta: 'personal', contactoId: 7, nombre: 'Portafolio' }), hoy)
    expect(f).toMatchObject({ etiqueta: 'personal', contactoId: null, contacto: null })
    expect(f.carpeta.ruta).toBe('Proyectos/Portafolio')
  })

  it('never takes over a folder that already exists', () => {
    mkdirSync(join(root, 'Proyectos/Clínica Sol - Sitio web'), { recursive: true })
    expect(guardarProyecto(db, root, nuevo(), hoy).carpeta.ruta).toBe('Proyectos/Clínica Sol - Sitio web (2)')
  })

  it('edits without touching its estado or its folder', () => {
    const { id } = guardarProyecto(db, root, nuevo(), hoy)
    const f = guardarProyecto(db, root, nuevo({ id, nombre: 'Sitio y blog', clienteFinal: 'Hospital Jardín' }), hoy)
    expect(f).toMatchObject({ nombre: 'Sitio y blog', clienteFinal: 'Hospital Jardín', estado: 'en_curso' })
    expect(f.carpeta.ruta).toBe('Proyectos/Clínica Sol - Sitio web')
  })

  it('refuses a client Proyecto without Contacto, or without a name', () => {
    expect(() => guardarProyecto(db, root, nuevo({ contactoId: null }), hoy)).toThrow(/contacto/i)
    expect(() => guardarProyecto(db, root, nuevo({ nombre: ' ' }), hoy)).toThrow(/nombre/i)
  })

  it('keeps the Contacto of a Proyecto that came from a Cotización', () => {
    const c = cotizacionAceptada(contactoId)
    const p = proyecto(contactoId, c.id)
    const otro = contacto('Hotel Aura').id
    expect(guardarProyecto(db, root, nuevo({ id: p.id, contactoId: otro }), hoy).contactoId).toBe(contactoId)
  })

  it('a rescan finds the scaffolded folder as the same Proyecto', () => {
    const f = guardarProyecto(db, root, nuevo(), hoy)
    importarCarpetaProyecto(db, { tipo: 'proyectos', nombre: 'Clínica Sol - Sitio web', rutaRelativa: 'Proyectos/Clínica Sol - Sitio web' })
    expect(db.select().from(proyectos).all().map((p) => p.id)).toEqual([f.id])
  })
})

describe('crearCarpeta', () => {
  it('scaffolds the folder of a Proyecto created by accepting a Cotización, once', () => {
    const p = proyecto(contactoId, cotizacionAceptada(contactoId).id)
    crearCarpeta(db, root, p.id, hoy)
    crearCarpeta(db, root, p.id, hoy)
    expect(db.select().from(ubicacionesArchivo).all()).toHaveLength(1)
    expect(existsSync(join(root, 'Proyectos/Clínica Sol - Hospital Jardín'))).toBe(true)
  })
})

describe('estado', () => {
  it('pauses and resumes', () => {
    const { id } = guardarProyecto(db, root, nuevo(), hoy)
    expect(pausarProyecto(db, root, id).estado).toBe('pausado')
    expect(reanudarProyecto(db, root, id).estado).toBe('en_curso')
  })

  it('is only completed once fully paid', () => {
    const { id } = guardarProyecto(db, root, nuevo(), hoy)
    db.insert(ingresos).values({ ...ingresoBase, categoria: 'sin_factura', proyectoId: id, estado: 'pendiente' }).run()
    expect(fichaProyecto(db, root, id).acciones).not.toContain('completar')
    expect(() => completarProyecto(db, root, id, hoy)).toThrow(/pagado/i)

    db.update(ingresos).set({ estado: 'pagado' }).run()
    const f = completarProyecto(db, root, id, hoy)
    expect(f).toMatchObject({ estado: 'completado', fechaFin: hoy, porCobrar: 0, cobrado: 1000 })
  })

  it('cancelling cascades to its Cotización (Cancelación con pagos)', () => {
    const c = cotizacionAceptada(contactoId)
    const p = proyecto(contactoId, c.id)
    db.insert(ingresos).values([
      { ...ingresoBase, categoria: 'sin_factura', proyectoId: p.id, estado: 'pagado' },
      { ...ingresoBase, categoria: 'sin_factura', proyectoId: p.id, estado: 'pendiente' }
    ]).run()
    db.insert(costos).values({ nombre: 'Hosting', categoria: 'unico', estimado: true, subtotal: 500, total: 500, fecha: hoy, proyectoId: p.id }).run()

    expect(cancelarProyecto(db, root, p.id, hoy)).toMatchObject({ estado: 'cancelado', fechaFin: hoy, acciones: [] })
    expect(db.select().from(cotizaciones).get()!.estado).toBe('cancelada')
    expect(db.select().from(ingresos).all().map((i) => i.estado)).toEqual(['pagado', 'cancelado'])
    expect(db.select().from(costos).get()!.estado).toBe('cancelado')
  })

  it('lists the actions each estado allows', () => {
    const { id } = guardarProyecto(db, root, nuevo(), hoy)
    expect(fichaProyecto(db, root, id).acciones).toEqual(['editar', 'borrar', 'pausar', 'completar', 'cancelar'])
    expect(pausarProyecto(db, root, id).acciones).toEqual(['editar', 'borrar', 'reanudar', 'completar', 'cancelar'])
    expect(completarProyecto(db, root, id, hoy).acciones).toEqual(['editar'])
  })
})

describe('borrar', () => {
  it('deletes a Proyecto with nothing linked, leaving its folder on disk', () => {
    const { id } = guardarProyecto(db, root, nuevo(), hoy)
    borrarProyecto(db, id)
    expect(db.select().from(proyectos).all()).toEqual([])
    expect(existsSync(join(root, 'Proyectos/Clínica Sol - Sitio web'))).toBe(true)
  })

  it('refuses one with linked records; it is cancelled instead', () => {
    const { id } = guardarProyecto(db, root, nuevo(), hoy)
    db.insert(ingresos).values({ ...ingresoBase, categoria: 'sin_factura', proyectoId: id }).run()
    expect(() => borrarProyecto(db, id)).toThrow(/cancélalo/)
    expect(db.select().from(ubicacionesArchivo).where(eq(ubicacionesArchivo.proyectoId, id)).all()).toHaveLength(1)
  })
})

describe('carpeta', () => {
  const ubicar = (proyectoId: number, tipo: 'proyectos' | 'archivo' | 'hdd_externo', ruta: string, disponible = true) =>
    db.insert(ubicacionesArchivo).values({ proyectoId, tipo, rutaRelativa: ruta, disponible }).run()

  it('shows a completed Proyecto whose files left for Archivo/ as Archivado, not a broken link', () => {
    const p = proyecto(contactoId, null)
    ubicar(p.id, 'archivo', 'Archivo/Proyectos/Hospital Jardín', false)
    expect(fichaProyecto(db, root, p.id).carpeta).toEqual({ estado: 'archivado', ruta: 'Archivo/Proyectos/Hospital Jardín', abrible: false })
  })

  it('opens an archived folder that is on disk', () => {
    const p = proyecto(contactoId, null)
    mkdirSync(join(root, 'Archivo/Proyectos/Hospital Jardín'), { recursive: true })
    ubicar(p.id, 'archivo', 'Archivo/Proyectos/Hospital Jardín')
    expect(fichaProyecto(db, root, p.id).carpeta.abrible).toBe(true)
    expect(carpetaAbrible(db, root, p.id)).toBe(join(root, 'Archivo/Proyectos/Hospital Jardín'))
  })

  it('shows a working folder the app cannot reach as No disponible', () => {
    const { id } = guardarProyecto(db, root, nuevo(), hoy)
    rmSync(join(root, 'Proyectos'), { recursive: true })
    expect(fichaProyecto(db, root, id).carpeta).toEqual({ estado: 'no_disponible', ruta: 'Proyectos/Clínica Sol - Sitio web', abrible: false })
    expect(() => carpetaAbrible(db, root, id)).toThrow(/no disponible/i)
  })

  it('shows Archivado, not No disponible, once the working folder left for Archivo/', () => {
    const { id } = guardarProyecto(db, root, nuevo(), hoy)
    rmSync(join(root, 'Proyectos'), { recursive: true })
    ubicar(id, 'archivo', 'Archivo/Proyectos/Clínica Sol - Sitio web', false)
    expect(fichaProyecto(db, root, id).carpeta).toEqual({ estado: 'archivado', ruta: 'Archivo/Proyectos/Clínica Sol - Sitio web', abrible: false })
  })

  it('shows only an external HDD location as Archivado', () => {
    const p = proyecto(contactoId, null)
    ubicar(p.id, 'hdd_externo', 'Proyectos/Hospital Jardín', false)
    expect(fichaProyecto(db, root, p.id).carpeta.estado).toBe('archivado')
  })

  it('has no folder when none was ever recorded', () => {
    const p = proyecto(contactoId, null)
    expect(fichaProyecto(db, root, p.id).carpeta).toEqual({ estado: 'sin_carpeta', ruta: null, abrible: false })
  })
})

describe('listar', () => {
  it('lists newest first with counts by estado and category', () => {
    const a = guardarProyecto(db, root, nuevo(), hoy)
    const b = guardarProyecto(db, root, nuevo({ etiqueta: 'personal', contactoId: null, nombre: 'Lab', categoria: 'ai' }), hoy)
    pausarProyecto(db, root, a.id)
    const l = listarProyectos(db, root)
    expect(l.proyectos.map((p) => p.id)).toEqual([b.id, a.id])
    expect(l.proyectos[0]).toMatchObject({ contacto: null, etiqueta: 'personal', carpeta: { estado: 'disponible' } })
    expect(l.conteo).toEqual({ en_curso: 1, pausado: 1, completado: 0, cancelado: 0 })
    expect(l.porCategoria).toMatchObject({ website: 1, ai: 1, app: 0 })
  })
})
