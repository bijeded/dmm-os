import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { costos, cotizaciones, definicionesCosto, definicionesIngreso, ingresos, proyectos, sugerenciasImportacion, ubicacionesArchivo } from './db/schema'
import { contacto, cotizacionAceptada, db, ingresoBase, proyecto, reiniciarDb } from './db/test-db'
import { escanear } from './importacion'
import { importarCarpetaProyecto } from './importacion/carpetas'
import { resumenInicio } from './inicio'
import { pdfDeTexto } from './importacion/pdf-prueba'
import {
  borrarProyecto,
  cancelarProyecto,
  carpetaAbrible,
  completarConCobro,
  completarProyecto,
  crearCarpeta,
  fichaProyecto,
  guardarProyecto,
  listarProyectos,
  pausarProyecto,
  reanudarProyecto
} from './proyectos'
import { borrarIngreso } from './movimientos'
import { MENSAJE_SIN_PAGAR, type ProyectoNuevo } from '../shared/dominio'

let root: string
let contactoId: number
const hoy = '2026-09-18'

beforeEach(() => {
  reiniciarDb()
  root = mkdtempSync(join(tmpdir(), 'dmm-proyectos-'))
  contactoId = contacto('Clínica Sol').id
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

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

  it('from a Cotización, is completed only once paid Ingresos reach its total', () => {
    const c = db.insert(cotizaciones).values({ contactoId, folio: 7, categoria: 'website', estado: 'aceptada', fecha: hoy, subtotal: 2000, iva: 320, total: 2320 }).returning().get()
    const p = proyecto(contactoId, c.id)
    db.insert(ingresos).values({ ...ingresoBase, categoria: 'sin_factura', proyectoId: p.id, estado: 'pagado' }).run()
    expect(fichaProyecto(db, root, p.id)).toMatchObject({ falta: { pendientes: 0, faltante: 1160, moneda: 'MXN' } })
    expect(fichaProyecto(db, root, p.id).acciones).not.toContain('completar')
    expect(() => completarProyecto(db, root, p.id, hoy)).toThrow(/pagado/i)

    db.insert(ingresos).values({ ...ingresoBase, categoria: 'sin_factura', proyectoId: p.id, estado: 'pagado' }).run()
    expect(completarProyecto(db, root, p.id, hoy)).toMatchObject({ estado: 'completado', falta: null })
  })

  it('compares a USD Cotización in USD', () => {
    const c = db.insert(cotizaciones).values({ contactoId, folio: 8, categoria: 'website', estado: 'aceptada', fecha: hoy, moneda: 'USD', subtotal: 100, total: 100 }).returning().get()
    const p = proyecto(contactoId, c.id)
    db.insert(ingresos).values({ fechaRegistro: hoy, subtotal: 1800, total: 1800, montoOriginal: 100, monedaOriginal: 'USD', categoria: 'sin_factura', proyectoId: p.id, estado: 'pagado' }).run()
    expect(completarProyecto(db, root, p.id, hoy).estado).toBe('completado')
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

describe('Completar con cobro', () => {
  const lukka = () => contacto('Lukka').id
  const cotizacion = (c: number, cambios: Partial<typeof cotizaciones.$inferInsert> = {}) =>
    db.insert(cotizaciones).values({ contactoId: c, folio: 30, categoria: 'website', estado: 'aceptada', fecha: '2026-06-01', subtotal: 900_000, iva: 0, total: 900_000, ...cambios }).returning().get()
  const suyos = (proyectoId: number) => db.select().from(ingresos).where(eq(ingresos.proyectoId, proyectoId)).all()
  const sinFactura = (monto: number) => ({ tipo: 'sin_factura' as const, monto })

  it('Lukka’s web project: records the $9,000 paid without an invoice and completes it', () => {
    const c = lukka()
    const p = proyecto(c, cotizacion(c).id)
    expect(() => completarProyecto(db, root, p.id, hoy)).toThrow(MENSAJE_SIN_PAGAR)

    const f = completarConCobro(db, root, p.id, { fecha: '2026-09-15', incobrables: [], pago: sinFactura(900_000), tipoCambio: null }, hoy)
    expect(f).toMatchObject({ estado: 'completado', fechaFin: hoy, cobrado: 900_000, falta: null })
    expect(suyos(p.id)).toEqual([
      expect.objectContaining({ categoria: 'sin_factura', estado: 'pagado', subtotal: 900_000, iva: 0, total: 900_000, contactoId: c, fechaRegistro: '2026-09-15', fechaPago: '2026-09-15' })
    ])
  })

  it('a USD Cotización paid in part: the rest is Incobrable, both keep their USD amount', () => {
    const c = lukka()
    const p = proyecto(c, cotizacion(c, { moneda: 'USD', subtotal: 100_000, total: 100_000, tipoCambio: 17.9 }).id)
    completarConCobro(db, root, p.id, { fecha: hoy, incobrables: [], pago: sinFactura(90_000), tipoCambio: 18.5 }, hoy)
    expect(suyos(p.id).map(({ estado, total, montoOriginal }) => ({ estado, total, montoOriginal }))).toEqual([
      { estado: 'pagado', total: 1_665_000, montoOriginal: 90_000 },
      { estado: 'incobrable', total: 185_000, montoOriginal: 10_000 }
    ])
    expect(fichaProyecto(db, root, p.id).estado).toBe('completado')
  })

  it('con factura: links the CFDI and answers its pending Sugerencia, creating no Ingreso', () => {
    const c = lukka()
    const p = proyecto(c, cotizacion(c).id)
    const otro = proyecto(c, null)
    const factura = db
      .insert(ingresos)
      .values({ categoria: 'factura', estadoFacturacion: 'facturado', estado: 'pendiente', subtotal: 900_000, iva: 144_000, total: 1_044_000, contactoId: c, cfdiUuid: 'UUID-1', fechaRegistro: '2026-07-01' })
      .returning()
      .get()
    const s = db
      .insert(sugerenciasImportacion)
      .values({ entidad: 'ingreso', entidadId: factura.id, accion: 'vincular', proyectoId: otro.id, motivo: 'monto' })
      .returning()
      .get()

    completarConCobro(db, root, p.id, { fecha: '2026-09-10', incobrables: [], pago: { tipo: 'cfdi', cfdiUuid: 'UUID-1' }, tipoCambio: null }, hoy)
    expect(db.select().from(ingresos).all()).toEqual([{ ...factura, proyectoId: p.id, estado: 'pagado', fechaPago: '2026-09-10' }])
    expect(db.select().from(sugerenciasImportacion).where(eq(sugerenciasImportacion.id, s.id)).get()!.estado).toBe('corregida')
    expect(fichaProyecto(db, root, p.id).estado).toBe('completado')
  })

  it('a Sugerencia that guessed this Proyecto is recorded aceptada', () => {
    const c = lukka()
    const p = proyecto(c, cotizacion(c).id)
    const factura = db
      .insert(ingresos)
      .values({ categoria: 'factura', estadoFacturacion: 'facturado', estado: 'pagado', subtotal: 900_000, iva: 144_000, total: 1_044_000, contactoId: c, cfdiUuid: 'UUID-2', fechaRegistro: '2026-07-01', fechaPago: '2026-07-01' })
      .returning()
      .get()
    db.insert(sugerenciasImportacion).values({ entidad: 'ingreso', entidadId: factura.id, accion: 'vincular', proyectoId: p.id, motivo: 'monto' }).run()
    completarConCobro(db, root, p.id, { fecha: hoy, incobrables: [], pago: { tipo: 'cfdi', cfdiUuid: 'UUID-2' }, tipoCambio: null }, hoy)
    expect(db.select().from(sugerenciasImportacion).get()!.estado).toBe('aceptada')
    expect(db.select().from(ingresos).get()!.fechaPago).toBe('2026-07-01')
  })

  it('a Proyecto made in the app has its pending Parcialidades paid or marked Incobrable', () => {
    const c = lukka()
    const p = proyecto(c, cotizacion(c, { subtotal: 1_000_000, iva: 160_000, total: 1_160_000 }).id)
    const parcialidad = { categoria: 'factura' as const, estadoFacturacion: 'por_facturar' as const, estado: 'pendiente' as const, subtotal: 500_000, iva: 80_000, total: 580_000, contactoId: c, proyectoId: p.id }
    const [primera, segunda] = db.insert(ingresos).values([parcialidad, parcialidad]).returning().all()
    completarConCobro(db, root, p.id, { fecha: '2026-09-12', incobrables: [segunda.id], pago: null, tipoCambio: null }, hoy)
    expect(suyos(p.id).map(({ id, estado, fechaPago }) => ({ id, estado, fechaPago }))).toEqual([
      { id: primera.id, estado: 'pagado', fechaPago: '2026-09-12' },
      { id: segunda.id, estado: 'incobrable', fechaPago: null }
    ])
    expect(fichaProyecto(db, root, p.id)).toMatchObject({ estado: 'completado', cobrado: 500_000 })
  })

  it('a refused answer writes nothing and leaves the Proyecto en curso', () => {
    const c = lukka()
    const p = proyecto(c, cotizacion(c).id)
    db.insert(ingresos).values({ categoria: 'sin_factura', estado: 'pendiente', subtotal: 100_000, iva: 0, total: 100_000, contactoId: c, proyectoId: p.id }).run()
    const antes = db.select().from(ingresos).all()
    expect(() => completarConCobro(db, root, p.id, { fecha: hoy, incobrables: [], pago: sinFactura(900_000), tipoCambio: null }, hoy)).toThrow('El monto no puede ser mayor a lo que falta')
    expect(db.select().from(ingresos).all()).toEqual(antes)
    expect(fichaProyecto(db, root, p.id).estado).toBe('en_curso')
  })

  it('refuses a cancelled Proyecto', () => {
    const c = lukka()
    const p = proyecto(c, cotizacion(c).id)
    db.update(proyectos).set({ estado: 'cancelado' }).where(eq(proyectos.id, p.id)).run()
    expect(() => completarConCobro(db, root, p.id, { fecha: hoy, incobrables: [], pago: sinFactura(900_000), tipoCambio: null }, hoy)).toThrow(/se puede completar/)
    expect(suyos(p.id)).toEqual([])
  })

  it('plain Completar still refuses an imported Proyecto with a gap, as it does one made in the app', () => {
    const c = lukka()
    const importado = proyecto(c, cotizacion(c).id)
    const hecho = guardarProyecto(db, root, nuevo({ contactoId: c }), hoy)
    db.update(proyectos).set({ cotizacionId: cotizacion(c, { folio: 31 }).id }).where(eq(proyectos.id, hecho.id)).run()
    for (const id of [importado.id, hecho.id]) expect(() => completarProyecto(db, root, id, hoy)).toThrow(MENSAJE_SIN_PAGAR)
  })
})

describe('sin ingresos registrados', () => {
  const cotizacion = (folio: number) =>
    db.insert(cotizaciones).values({ contactoId, folio, categoria: 'website', estado: 'aceptada', fecha: hoy, subtotal: 2000, iva: 320, total: 2320 }).returning().get()
  const completado = (cotizacionId: number | null) => {
    const p = proyecto(contactoId, cotizacionId)
    db.update(proyectos).set({ estado: 'completado' }).where(eq(proyectos.id, p.id)).run()
    return p
  }
  const archivar = (proyectoId: number) =>
    db.insert(ubicacionesArchivo).values({ proyectoId, tipo: 'hdd_externo', rutaRelativa: 'Proyectos/Versa', disponible: false, verificadoEn: hoy }).run()
  const marcado = (id: number) => listarProyectos(db, root).proyectos.find((p) => p.id === id)!.sinIngresosRegistrados

  it('flags a completed Proyecto with a folder whose Ingresos do not reach its Cotización', () => {
    const p = completado(cotizacion(7).id)
    archivar(p.id)
    expect(marcado(p.id)).toBe(true)

    // Entered by hand in Finanzas, uninvoiced and without IVA: the flag clears itself.
    db.insert(ingresos).values({ fechaRegistro: hoy, subtotal: 2320, total: 2320, categoria: 'sin_factura', proyectoId: p.id, estado: 'pagado' }).run()
    expect(marcado(p.id)).toBe(false)
  })

  it('clears once paid and Incobrable reach the total, and shows again once the Incobrable is deleted', () => {
    const p = completado(cotizacion(9).id)
    archivar(p.id)
    db.insert(ingresos).values({ fechaRegistro: hoy, subtotal: 2000, total: 2000, categoria: 'sin_factura', proyectoId: p.id, estado: 'pagado' }).run()
    const resto = db
      .insert(ingresos)
      .values({ fechaRegistro: hoy, subtotal: 320, total: 320, categoria: 'sin_factura', proyectoId: p.id, estado: 'incobrable' })
      .returning()
      .get()
    expect(marcado(p.id)).toBe(false)

    borrarIngreso(db, resto.id)
    expect(marcado(p.id)).toBe(true)
    expect(fichaProyecto(db, root, p.id).estado).toBe('completado')
  })

  it('leaves out a Proyecto still en curso, one with no Cotización, one with no folder, and a monthly one', () => {
    const enCurso = proyecto(contactoId, cotizacion(1).id)
    archivar(enCurso.id)
    const sinCotizacion = completado(null)
    archivar(sinCotizacion.id)
    const sinCarpeta = completado(cotizacion(2).id)
    const c = cotizacion(3)
    db.update(cotizaciones).set({ facturacion: 'mensual' }).where(eq(cotizaciones.id, c.id)).run()
    const mensual = completado(c.id)
    archivar(mensual.id)
    expect([enCurso, sinCotizacion, sinCarpeta, mensual].map((p) => marcado(p.id))).toEqual([false, false, false, false])
  })
})

describe('sin ingresos registrados con el Monto del PDF', () => {
  /** The quote `DMM - 250 - Flor de Letras.pdf` and its delivered folder in `Archivo/Proyectos/Curso`. */
  const importarEntregada = async (precio: string) => {
    mkdirSync(join(root, 'Clientes'), { recursive: true })
    writeFileSync(join(root, 'Clientes', '_nombres.csv'), 'en disco,contacto,proyecto\nCurso,Flor de Letras,\n')
    mkdirSync(join(root, 'Cotizaciones', '2021'), { recursive: true })
    writeFileSync(
      join(root, 'Cotizaciones', '2021', 'DMM - 250 - Flor de Letras.pdf'),
      pdfDeTexto(['Ciudad de México, 29 de octubre, 2021.', 'Video “Curso” : Elaboración de video:', precio])
    )
    mkdirSync(join(root, 'Archivo', 'Proyectos', 'Curso'), { recursive: true })
    await escanear(db, root)
    const p = db.select().from(proyectos).where(eq(proyectos.nombre, 'Curso')).get()!
    expect(p.estado).toBe('completado')
    expect(db.select().from(cotizaciones).where(eq(cotizaciones.id, p.cotizacionId!)).get()!.estado).toBe('aceptada')
    return p
  }
  const marcado = (id: number) => listarProyectos(db, root).proyectos.find((p) => p.id === id)!.sinIngresosRegistrados
  const sinDinero = () =>
    [ingresos, costos, definicionesIngreso, definicionesCosto].map((t) => db.select().from(t).all().length)

  it('creates no money for an imported accepted quote, and flags it until an Ingreso reaches its Monto', async () => {
    const p = await importarEntregada('Costo: $ 3,000.00')
    expect(sinDinero()).toEqual([0, 0, 0, 0])
    expect(marcado(p.id)).toBe(true)

    // Uninvoiced and without IVA, entered by hand: it reaches the Monto before IVA, and the flag clears.
    db.insert(ingresos).values({ fechaRegistro: hoy, subtotal: 300000, total: 300000, categoria: 'sin_factura', proyectoId: p.id, estado: 'pagado' }).run()
    expect(marcado(p.id)).toBe(false)
  })

  it('stays flagged while the paid Ingresos fall short of the Monto', async () => {
    const p = await importarEntregada('Costo: $ 3,000.00')
    db.insert(ingresos).values({ fechaRegistro: hoy, subtotal: 100000, total: 100000, categoria: 'sin_factura', proyectoId: p.id, estado: 'pagado' }).run()
    expect(marcado(p.id)).toBe(true)
  })

  it('compares a USD quote with a USD invoice by its original amount', async () => {
    const p = await importarEntregada('Costo especial: $ 260.00 USD ($5,000.00 MXN)')
    expect(marcado(p.id)).toBe(true)
    db.insert(ingresos)
      .values({
        fechaRegistro: hoy,
        subtotal: 500000,
        iva: 80000,
        total: 580000,
        montoOriginal: 30160,
        monedaOriginal: 'USD',
        categoria: 'factura',
        cfdiUuid: 'U-1',
        estadoFacturacion: 'facturado',
        proyectoId: p.id,
        estado: 'pagado'
      })
      .run()
    expect(marcado(p.id)).toBe(false)
  })

  it('never flags a quote with only recurring prices, and creates no definition for it', async () => {
    const p = await importarEntregada('Costo: $ 2,000.00 mensuales')
    expect(db.select().from(cotizaciones).where(eq(cotizaciones.id, p.cotizacionId!)).get()!.facturacion).toBe('mensual')
    expect(sinDinero()).toEqual([0, 0, 0, 0])
    expect(marcado(p.id)).toBe(false)
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

  it('lists a Proyecto sin Contacto, and Inicio shows it en curso', () => {
    const p = db.insert(proyectos).values({ nombre: 'Activista', categoria: 'other', estado: 'en_curso', importado: true }).returning().get()
    expect(listarProyectos(db, root).proyectos).toEqual([expect.objectContaining({ id: p.id, etiqueta: 'cliente', contactoId: null, contacto: null })])
    expect(resumenInicio(db, root, hoy, 30).proyectos.map((f) => f.nombre)).toEqual(['Activista'])
  })
})
