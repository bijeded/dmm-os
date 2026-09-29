import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { borrarContacto, contactosCsv, fichaContacto, guardarContacto, listarContactos } from './contactos'
import { cambiarContacto, fusionarContacto } from './atribucion'
import { contacto, cotizacionAceptada, db, ingresoBase, proyecto, reiniciarDb } from './db/test-db'
import { contactos, cotizaciones, ingresos, proyectos } from './db/schema'

beforeEach(reiniciarDb)

const cotizacion = (contactoId: number, estado: 'borrador' | 'enviada' | 'rechazada' | 'expirada', folio: number | null = 200) =>
  db
    .insert(cotizaciones)
    .values({ contactoId, folio: estado === 'borrador' ? null : folio, categoria: 'website', estado, fecha: '2026-03-01', subtotal: 5000, total: 5000 })
    .returning()
    .get()

const ingreso = (contactoId: number, subtotal: number, estado: 'pendiente' | 'pagado' = 'pagado') =>
  db
    .insert(ingresos)
    .values({ ...ingresoBase, categoria: 'sin_factura', contactoId, subtotal, iva: 0, total: subtotal, estado })
    .run()

describe('Estado de Contacto', () => {
  it('is derived from Cotizaciones and Proyectos', () => {
    const frio = contacto('Frío')
    cotizacion(frio.id, 'rechazada', 1)
    const caliente = contacto('Caliente')
    cotizacion(caliente.id, 'enviada', 2)
    const activo = contacto('Activo')
    proyecto(activo.id, cotizacionAceptada(activo.id, 3).id)
    const pausado = contacto('Pausado')
    const p = proyecto(pausado.id, cotizacionAceptada(pausado.id, 4).id)
    db.update(proyectos).set({ estado: 'pausado' }).where(eq(proyectos.id, p.id)).run()
    const inactivo = contacto('Inactivo')
    const q = proyecto(inactivo.id, cotizacionAceptada(inactivo.id, 5).id)
    db.update(proyectos).set({ estado: 'completado' }).where(eq(proyectos.id, q.id)).run()

    const estados = Object.fromEntries(listarContactos(db).contactos.map((c) => [c.nombre, c.estado]))
    expect(estados).toEqual({
      Activo: 'cliente_activo',
      Caliente: 'lead_caliente',
      Frío: 'lead_frio',
      Inactivo: 'cliente_inactivo',
      Pausado: 'cliente_activo'
    })
  })

  it('an accepted Cotización makes an active client, even before its Proyecto exists', () => {
    cotizacionAceptada(contacto('Aceptó').id)
    expect(listarContactos(db).contactos[0].estado).toBe('cliente_activo')
  })

  it('a Contacto whose only Proyecto was cancelled is not an inactive client', () => {
    const c = contacto('Canceló')
    const p = proyecto(c.id, cotizacionAceptada(c.id).id)
    db.update(proyectos).set({ estado: 'cancelado' }).where(eq(proyectos.id, p.id)).run()
    db.update(cotizaciones).set({ estado: 'cancelada' }).run()
    expect(listarContactos(db).contactos[0].estado).toBe('lead_frio')
  })

  it('a Contacto with no Cotización is a cold lead', () => {
    contacto('Nuevo')
    expect(listarContactos(db).contactos[0].estado).toBe('lead_frio')
  })
})

describe('listarContactos', () => {
  it('orders by name, counts each estado, and ranks the top 10 by value with their share', () => {
    const b = contacto('Beta')
    const a = contacto('Álamo')
    contacto('Cero')
    ingreso(b.id, 3000)
    ingreso(a.id, 1000)
    ingreso(a.id, 500, 'pendiente')

    const r = listarContactos(db)
    expect(r.contactos.map((c) => c.nombre)).toEqual(['Álamo', 'Beta', 'Cero'])
    expect(r.conteo).toEqual({ lead_frio: 3, lead_caliente: 0, cliente_activo: 0, cliente_inactivo: 0 })
    expect(r.top).toEqual([
      { id: b.id, nombre: 'Beta', valor: 3000, porcentaje: 75 },
      { id: a.id, nombre: 'Álamo', valor: 1000, porcentaje: 25 }
    ])
  })

  it('keeps only ten in the top', () => {
    for (let i = 0; i < 12; i++) ingreso(contacto(`C${String(i).padStart(2, '0')}`).id, 100 + i)
    expect(listarContactos(db).top).toHaveLength(10)
  })
})

describe('fichaContacto', () => {
  let root: string
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'dmm-ficha-'))
  })
  afterEach(() => rmSync(root, { recursive: true, force: true }))

  it('shows the full history, newest first, with its value', () => {
    const c = contacto('Sonríeme')
    const q = cotizacionAceptada(c.id, 475)
    db.update(cotizaciones).set({ nombre: 'Web', subtotal: 4000, total: 4000 }).where(eq(cotizaciones.id, q.id)).run()
    const p = proyecto(c.id, q.id)
    db.update(proyectos).set({ fechaInicio: '2026-02-01' }).where(eq(proyectos.id, p.id)).run()
    db.insert(ingresos).values({ ...ingresoBase, categoria: 'sin_factura', iva: 0, total: 1000, contactoId: c.id, estado: 'pagado', fechaPago: '2026-03-05' }).run()
    db.insert(ingresos).values({ ...ingresoBase, categoria: 'sin_factura', iva: 0, total: 1000, contactoId: c.id, fechaRegistro: '2026-04-01' }).run()
    cotizacion(c.id, 'borrador')

    const f = fichaContacto(db, root, c.id)
    expect(f.estado).toBe('cliente_activo')
    expect(f.valor).toBe(1000)
    expect(f.porCobrar).toBe(1000)
    expect(f.proyectos).toBe(1)
    expect(f.cotizaciones).toEqual({ total: 2, aceptadas: 1 })
    expect(f.historial.map((h) => [h.fecha, h.tipo, h.referencia, h.estado])).toEqual([
      ['2026-04-01', 'pago', null, 'pendiente'],
      ['2026-03-05', 'pago', null, 'pagado'],
      ['2026-03-01', 'cotizacion', null, 'borrador'],
      ['2026-02-01', 'proyecto', null, 'en_curso'],
      ['2026-01-10', 'cotizacion', '475', 'aceptada']
    ])
  })

  it('lists the files in Clientes/<name>/, matched without accents', () => {
    const c = contacto('Sonríeme')
    const dir = join(root, 'Clientes', 'Sonrieme')
    mkdirSync(join(dir, 'Logos'), { recursive: true })
    writeFileSync(join(dir, 'Contrato.pdf'), 'x')
    writeFileSync(join(dir, '.DS_Store'), 'x')

    const f = fichaContacto(db, root, c.id)
    expect(f.carpeta).toBe('Clientes/Sonrieme')
    expect(f.archivos?.map((a) => [a.nombre, a.tipo])).toEqual([
      ['Contrato.pdf', 'PDF'],
      ['Logos', 'Carpeta']
    ])
  })

  it('has no folder when none matches', () => {
    const f = fichaContacto(db, root, contacto('Nadie').id)
    expect(f.carpeta).toBeNull()
    expect(f.archivos).toEqual([])
  })

  it('refuses an unknown Contacto', () => {
    expect(() => fichaContacto(db, root, 999)).toThrow(/no existe/)
  })
})

describe('borrarContacto', () => {
  it('deletes a Contacto with nothing linked', () => {
    const c = contacto('Solo')
    borrarContacto(db, c.id)
    expect(listarContactos(db).contactos).toEqual([])
  })

  it('refuses one with linked records', () => {
    const c = contacto('Con cotización')
    cotizacionAceptada(c.id)
    expect(() => borrarContacto(db, c.id)).toThrow(/cancélalo/)
  })
})

describe('contactosCsv', () => {
  it('exports every Contacto for a newsletter, quoting what needs it', () => {
    const c = contacto('Estudio "Ocho", SA')
    db.update(contactos).set({ email: 'hola@ocho.mx', telefono: '55 1234' }).where(eq(contactos.id, c.id)).run()
    expect(contactosCsv(db)).toBe('nombre,empresa,email,telefono,estado\r\n"Estudio ""Ocho"", SA",,hola@ocho.mx,55 1234,Lead frío\r\n')
  })
})

describe('guardarContacto', () => {
  const vacio = { nombre: '', empresa: null, email: null, telefono: null, direccion: null, notas: null }

  it('creates a Contacto, trimming and blanking empty fields', () => {
    const id = guardarContacto(db, { ...vacio, nombre: '  Sonríeme ', email: ' hola@sonrieme.mx ', telefono: '  ', notas: 'Por WhatsApp' })
    expect(db.select().from(contactos).where(eq(contactos.id, id)).get()).toMatchObject({
      nombre: 'Sonríeme',
      email: 'hola@sonrieme.mx',
      telefono: null,
      notas: 'Por WhatsApp',
      empresa: null
    })
    expect(listarContactos(db).contactos[0].estado).toBe('lead_frio')
  })

  it('edits every field of an existing Contacto', () => {
    const c = contacto('Sonrieme')
    expect(guardarContacto(db, { id: c.id, nombre: 'Sonríeme', empresa: 'Dra. Ruiz', email: 'a@b.mx', telefono: '55 1', direccion: 'CDMX', notas: 'Nota' })).toBe(c.id)
    expect(db.select().from(contactos).where(eq(contactos.id, c.id)).get()).toMatchObject({
      nombre: 'Sonríeme',
      empresa: 'Dra. Ruiz',
      email: 'a@b.mx',
      telefono: '55 1',
      direccion: 'CDMX',
      notas: 'Nota'
    })
  })

  it('needs a name', () => {
    expect(() => guardarContacto(db, { ...vacio, nombre: '   ' })).toThrow(/nombre/)
  })

  it('refuses a name another Contacto already has, accents aside', () => {
    contacto('Sonríeme')
    expect(() => guardarContacto(db, { ...vacio, nombre: 'sonrieme' })).toThrow(/Ya existe/)
    const otro = contacto('Otro')
    expect(() => guardarContacto(db, { ...vacio, id: otro.id, nombre: 'SONRÍEME' })).toThrow(/Ya existe/)
  })

  it('lets a Contacto keep its own name', () => {
    const c = contacto('Sonrieme')
    expect(guardarContacto(db, { ...vacio, id: c.id, nombre: 'Sonríeme' })).toBe(c.id)
  })

  it('refuses an unknown Contacto', () => {
    expect(() => guardarContacto(db, { ...vacio, id: 999, nombre: 'X' })).toThrow(/no existe/)
  })
})

describe('after Fusionar Contacto and Cambiar Contacto', () => {
  it('reads the destino’s history, cobrado and Estado de Contacto from the moved records', () => {
    const a = contacto('A')
    const b = contacto('B')
    const enCurso = proyecto(a.id, cotizacionAceptada(a.id, 1).id)
    ingreso(a.id, 900_000)
    const hecho = proyecto(b.id, cotizacionAceptada(b.id, 2).id)
    db.update(proyectos).set({ estado: 'completado' }).where(eq(proyectos.id, hecho.id)).run()
    ingreso(b.id, 2_000_000)
    expect(fichaContacto(db, '/nowhere', b.id).estado).toBe('cliente_inactivo')

    fusionarContacto(db, a.id, b.id)
    const ficha = fichaContacto(db, '/nowhere', b.id)
    expect(ficha.valor).toBe(2_900_000)
    expect(ficha.estado).toBe('cliente_activo')
    expect(ficha.historial.filter((m) => m.tipo === 'proyecto').map((m) => m.id).sort()).toEqual([hecho.id, enCurso.id].sort())
    expect(listarContactos(db).contactos.map((c) => c.nombre)).toEqual(['B'])
  })

  it('makes the new Contacto an active client and the one left behind no longer one', () => {
    const a = contacto('A')
    const b = contacto('B')
    const p = proyecto(a.id, cotizacionAceptada(a.id, 1).id)
    cotizacion(a.id, 'enviada', 2)
    cambiarContacto(db, 'proyecto', p.id, b.id)
    const estados = Object.fromEntries(listarContactos(db).contactos.map((c) => [c.nombre, c.estado]))
    expect(estados).toEqual({ A: 'lead_caliente', B: 'cliente_activo' })
  })
})
