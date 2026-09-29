import { beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { asignarProyecto, cambiarContacto, fusionarContacto, opcionesAsignar, previaCambioContacto } from './atribucion'
import { contactos, cotizaciones, definicionesIngreso, ingresos, proyectos, sugerenciasImportacion } from './db/schema'
import { db, ingresoBase, reiniciarDb } from './db/test-db'

beforeEach(reiniciarDb)

const hoy = '2026-09-29'

const contacto = (nombre: string, datos: Partial<typeof contactos.$inferInsert> = {}) =>
  db.insert(contactos).values({ nombre, ...datos }).returning().get()
const cotizacion = (contactoId: number, datos: Partial<typeof cotizaciones.$inferInsert> = {}) =>
  db
    .insert(cotizaciones)
    .values({ contactoId, folio: 190, categoria: 'website', estado: 'aceptada', fecha: '2018-09-07', subtotal: 900_000, iva: 0, total: 900_000, ...datos })
    .returning()
    .get()
const proyecto = (contactoId: number | null, cotizacionId: number | null, datos: Partial<typeof proyectos.$inferInsert> = {}) =>
  db
    .insert(proyectos)
    .values({ nombre: 'Cantina 48', contactoId, cotizacionId, categoria: 'website', estado: 'completado', ...datos })
    .returning()
    .get()
const ingreso = (datos: Partial<typeof ingresos.$inferInsert> = {}) =>
  db
    .insert(ingresos)
    .values({ ...ingresoBase, categoria: 'sin_factura', estado: 'pagado', ...datos })
    .returning()
    .get()
const factura = (uuid: string, datos: Partial<typeof ingresos.$inferInsert> = {}) =>
  ingreso({ categoria: 'factura', estadoFacturacion: 'facturado', cfdiUuid: uuid, subtotal: 550_000, iva: 88_000, total: 638_000, ...datos })
const leerContacto = (id: number) => db.select().from(contactos).where(eq(contactos.id, id)).get()
const leerIngreso = (id: number) => db.select().from(ingresos).where(eq(ingresos.id, id)).get()!
const sugerencia = (datos: typeof sugerenciasImportacion.$inferInsert) => db.insert(sugerenciasImportacion).values(datos).returning().get()
const estadoDe = (id: number) => db.select().from(sugerenciasImportacion).where(eq(sugerenciasImportacion.id, id)).get()!.estado
const mensual = (contactoId: number, cotizacionId: number, proyectoId: number) =>
  db
    .insert(definicionesIngreso)
    .values({
      tipo: 'mensual',
      categoria: 'sin_factura',
      subtotal: 1_850_000,
      total: 1_850_000,
      montoOriginal: 100_000,
      monedaOriginal: 'USD',
      contactoId,
      cotizacionId,
      proyectoId,
      periodoInicio: '2026-07'
    })
    .returning()
    .get()

/** The Cantina 48 case: an imported Cotización and Proyecto under a Contacto of their own name. */
function cantina48() {
  const omar = contacto('Omar Rodriguez', { empresa: 'Zamora Live', rfc: 'ZEM180223H23' })
  const cantina = contacto('Cantina 48')
  const c = cotizacion(cantina.id, { importado: true })
  const p = proyecto(cantina.id, c.id, { importado: true })
  return { omar, cantina, c, p }
}

describe('Fusionar Contacto', () => {
  it('moves Cantina 48 into Omar Rodriguez, which keeps its name and RFC, and deletes Cantina 48', () => {
    const { omar, cantina, c, p } = cantina48()
    expect(fusionarContacto(db, cantina.id, omar.id)).toBe(omar.id)
    expect(db.select().from(cotizaciones).where(eq(cotizaciones.id, c.id)).get()).toMatchObject({ contactoId: omar.id, estado: 'aceptada' })
    expect(db.select().from(proyectos).where(eq(proyectos.id, p.id)).get()).toMatchObject({ contactoId: omar.id, estado: 'completado' })
    expect(leerContacto(cantina.id)).toBeUndefined()
    expect(leerContacto(omar.id)).toMatchObject({ nombre: 'Omar Rodriguez', empresa: 'Zamora Live', rfc: 'ZEM180223H23' })
  })

  it('fills the destino’s empty details from the merged Contacto, notas included', () => {
    const a = contacto('A', { email: 'a@x.mx', notas: 'Paga a 30 días' })
    const b = contacto('Bé', { telefono: '5551234' })
    fusionarContacto(db, a.id, b.id)
    expect(leerContacto(b.id)).toMatchObject({ nombre: 'Bé', email: 'a@x.mx', telefono: '5551234', notas: 'Paga a 30 días' })
  })

  it('moves a USD Ingreso and a recurring definition unchanged', () => {
    const a = contacto('A')
    const b = contacto('B')
    const c = cotizacion(a.id, { moneda: 'USD', facturacion: 'mensual' })
    const p = proyecto(a.id, c.id, { estado: 'en_curso' })
    const d = mensual(a.id, c.id, p.id)
    const i = ingreso({ contactoId: a.id, proyectoId: p.id, subtotal: 1_850_000, iva: 0, total: 1_850_000, montoOriginal: 100_000, monedaOriginal: 'USD' })
    fusionarContacto(db, a.id, b.id)
    expect(leerIngreso(i.id)).toMatchObject({ contactoId: b.id, subtotal: 1_850_000, total: 1_850_000, montoOriginal: 100_000, monedaOriginal: 'USD' })
    expect(db.select().from(definicionesIngreso).where(eq(definicionesIngreso.id, d.id)).get()!.contactoId).toBe(b.id)
  })

  it('refuses two different RFCs, writing nothing', () => {
    const a = contacto('A', { rfc: 'AAA010101AAA' })
    const b = contacto('B', { rfc: 'BBB020202BBB' })
    const c = cotizacion(a.id)
    expect(() => fusionarContacto(db, a.id, b.id)).toThrow(/AAA010101AAA.*BBB020202BBB/)
    expect(leerContacto(a.id)).toBeTruthy()
    expect(db.select().from(cotizaciones).where(eq(cotizaciones.id, c.id)).get()!.contactoId).toBe(a.id)
  })

  it('gives the destino the RFC only the merged Contacto held', () => {
    const a = contacto('A', { rfc: 'AAA010101AAA' })
    const b = contacto('B')
    fusionarContacto(db, a.id, b.id)
    expect(leerContacto(b.id)!.rfc).toBe('AAA010101AAA')
  })

  it('refuses merging a Contacto into itself', () => {
    const a = contacto('A')
    expect(() => fusionarContacto(db, a.id, a.id)).toThrow('Un Contacto no se fusiona consigo mismo')
  })

  it('answers a pending suggestion to merge it: aceptada into the one it proposed, corregida into another', () => {
    const a = contacto('Zamora Live Eventos')
    const b = contacto('Omar Rodriguez')
    const c = contacto('Otro')
    const d = contacto('Zamora USA')
    const comoSugerida = sugerencia({ entidad: 'contacto', entidadId: a.id, accion: 'fusionar', contactoId: b.id, motivo: 'nombre parecido' })
    const otra = sugerencia({ entidad: 'contacto', entidadId: d.id, accion: 'fusionar', contactoId: b.id, motivo: 'nombre parecido' })
    fusionarContacto(db, a.id, b.id)
    fusionarContacto(db, d.id, c.id)
    expect(estadoDe(comoSugerida.id)).toBe('aceptada')
    expect(estadoDe(otra.id)).toBe('corregida')
  })
})

describe('Cambiar Contacto', () => {
  it('moves Cantina 48 from its Proyecto to Omar Rodriguez and deletes the emptied Contacto', () => {
    const { omar, cantina, c, p } = cantina48()
    expect(cambiarContacto(db, 'proyecto', p.id, omar.id)).toEqual({ cotizaciones: 1, proyectos: 1, ingresos: 0, borraContacto: 'Cantina 48' })
    expect(db.select().from(proyectos).where(eq(proyectos.id, p.id)).get()).toMatchObject({ contactoId: omar.id, estado: 'completado', importado: true })
    expect(db.select().from(cotizaciones).where(eq(cotizaciones.id, c.id)).get()!.contactoId).toBe(omar.id)
    expect(leerContacto(cantina.id)).toBeUndefined()
  })

  it('moves the same pair when started from the Cotización', () => {
    const { omar, c, p } = cantina48()
    cambiarContacto(db, 'cotizacion', c.id, omar.id)
    expect(db.select().from(proyectos).where(eq(proyectos.id, p.id)).get()!.contactoId).toBe(omar.id)
  })

  it('takes the pending Plan de cobro Ingresos along', () => {
    const a = contacto('A')
    const b = contacto('B')
    const c = cotizacion(a.id)
    const p = proyecto(a.id, c.id, { estado: 'en_curso' })
    const pendientes = [1, 2].map(() => ingreso({ contactoId: a.id, proyectoId: p.id, cotizacionId: c.id, estado: 'pendiente', subtotal: 500_000, iva: 0, total: 500_000 }))
    cambiarContacto(db, 'cotizacion', c.id, b.id)
    for (const i of pendientes) expect(leerIngreso(i.id)).toMatchObject({ contactoId: b.id, estado: 'pendiente', subtotal: 500_000 })
    expect(leerContacto(a.id)).toBeUndefined()
  })

  it('takes a USD mensual definition and its Periodos generados along, unchanged', () => {
    const a = contacto('A')
    const b = contacto('B')
    const c = cotizacion(a.id, { moneda: 'USD', facturacion: 'mensual' })
    const p = proyecto(a.id, c.id, { estado: 'en_curso' })
    const d = mensual(a.id, c.id, p.id)
    const periodos = ['2026-07', '2026-08'].map((periodo) =>
      ingreso({ contactoId: a.id, proyectoId: p.id, cotizacionId: c.id, definicionId: d.id, periodo, subtotal: 1_850_000, iva: 0, total: 1_850_000, montoOriginal: 100_000, monedaOriginal: 'USD' })
    )
    cambiarContacto(db, 'proyecto', p.id, b.id)
    expect(db.select().from(definicionesIngreso).where(eq(definicionesIngreso.id, d.id)).get()!.contactoId).toBe(b.id)
    for (const i of periodos) expect(leerIngreso(i.id)).toMatchObject({ contactoId: b.id, total: 1_850_000, montoOriginal: 100_000, monedaOriginal: 'USD' })
  })

  it('moves a cancelled imported pair and keeps it cancelled', () => {
    const a = contacto('A')
    const b = contacto('B')
    const c = cotizacion(a.id, { estado: 'cancelada', importado: true })
    const p = proyecto(a.id, c.id, { estado: 'cancelado', importado: true })
    cambiarContacto(db, 'proyecto', p.id, b.id)
    expect(db.select().from(cotizaciones).where(eq(cotizaciones.id, c.id)).get()).toMatchObject({ contactoId: b.id, estado: 'cancelada' })
    expect(db.select().from(proyectos).where(eq(proyectos.id, p.id)).get()).toMatchObject({ contactoId: b.id, estado: 'cancelado' })
  })

  it('moves a Proyecto with no Cotización and its Ingresos', () => {
    const a = contacto('A')
    const b = contacto('B')
    const p = proyecto(a.id, null)
    const i = ingreso({ contactoId: a.id, proyectoId: p.id })
    cambiarContacto(db, 'proyecto', p.id, b.id)
    expect(leerIngreso(i.id).contactoId).toBe(b.id)
  })

  it('keeps the Contacto it leaves when it still has other records', () => {
    const a = contacto('A')
    const b = contacto('B')
    const c = cotizacion(a.id)
    cotizacion(a.id, { folio: 191 })
    expect(cambiarContacto(db, 'cotizacion', c.id, b.id).borraContacto).toBeNull()
    expect(leerContacto(a.id)).toBeTruthy()
  })

  it('deletes a pending suggestion to merge the Contacto it deletes', () => {
    const { omar, cantina, p } = cantina48()
    const otro = contacto('Otro')
    const s = sugerencia({ entidad: 'contacto', entidadId: cantina.id, accion: 'fusionar', contactoId: otro.id, motivo: 'nombre parecido' })
    cambiarContacto(db, 'proyecto', p.id, omar.id)
    expect(db.select().from(sugerenciasImportacion).where(eq(sugerenciasImportacion.id, s.id)).get()).toBeUndefined()
  })

  describe('refusals write nothing', () => {
    const intacto = (contactoId: number, proyectoId: number) => {
      expect(db.select().from(proyectos).where(eq(proyectos.id, proyectoId)).get()!.contactoId).toBe(contactoId)
      expect(leerContacto(contactoId)).toBeTruthy()
    }

    it('refuses a pair with an invoice', () => {
      const { omar, cantina, c, p } = cantina48()
      factura('c266deaa-0000', { contactoId: cantina.id, proyectoId: p.id, cotizacionId: c.id })
      expect(() => cambiarContacto(db, 'proyecto', p.id, omar.id)).toThrow(/c266deaa…/)
      intacto(cantina.id, p.id)
    })

    it('refuses while a Sugerencia about the pair is pending', () => {
      const { omar, cantina, c, p } = cantina48()
      sugerencia({ entidad: 'cotizacion', entidadId: c.id, accion: 'partidas', motivo: '¿Qué aceptó?' })
      expect(() => cambiarContacto(db, 'cotizacion', c.id, omar.id)).toThrow(/Logs/)
      intacto(cantina.id, p.id)
    })

    it('refuses a draft, which is changed by editing it', () => {
      const a = contacto('A')
      const b = contacto('B')
      const c = cotizacion(a.id, { estado: 'borrador', folio: null })
      expect(() => cambiarContacto(db, 'cotizacion', c.id, b.id)).toThrow('El contacto de un borrador se cambia al editarlo')
    })

    it('refuses a personal Proyecto and a Proyecto sin Contacto', () => {
      const b = contacto('B')
      const personal = proyecto(null, null, { etiqueta: 'personal', nombre: 'Portafolio' })
      const sinContacto = proyecto(null, null, { nombre: 'Bosque' })
      expect(() => cambiarContacto(db, 'proyecto', personal.id, b.id)).toThrow('Un proyecto personal no tiene contacto')
      expect(() => cambiarContacto(db, 'proyecto', sinContacto.id, b.id)).toThrow('Asígnale un contacto desde Editar')
    })

    it('refuses the Contacto it already has', () => {
      const { cantina, p } = cantina48()
      expect(() => cambiarContacto(db, 'proyecto', p.id, cantina.id)).toThrow('Ya es de Cantina 48')
      intacto(cantina.id, p.id)
    })
  })

  it('keeps the answered Sugerencias that named the Contacto it deletes, now naming where its records went', () => {
    const { omar, cantina, p } = cantina48()
    const duplicado = contacto('Cantina 48 SA')
    const respondida = sugerencia({ entidad: 'contacto', entidadId: duplicado.id, accion: 'fusionar', contactoId: cantina.id, motivo: 'nombre parecido', estado: 'aceptada' })
    cambiarContacto(db, 'proyecto', p.id, omar.id)
    expect(db.select().from(sugerenciasImportacion).where(eq(sugerenciasImportacion.id, respondida.id)).get()).toMatchObject({ estado: 'aceptada', contactoId: omar.id })
  })

  it('moves a pair whose Proyecto lacks the Contacto its Cotización has, from either Ficha', () => {
    const a = contacto('A')
    const b = contacto('B')
    const c = cotizacion(a.id)
    const p = proyecto(null, c.id)
    cambiarContacto(db, 'proyecto', p.id, b.id)
    expect(db.select().from(proyectos).where(eq(proyectos.id, p.id)).get()!.contactoId).toBe(b.id)
    expect(db.select().from(cotizaciones).where(eq(cotizaciones.id, c.id)).get()!.contactoId).toBe(b.id)
  })

  it('previews exactly what it would do, without writing', () => {
    const { omar, cantina, p } = cantina48()
    expect(previaCambioContacto(db, 'proyecto', p.id, omar.id)).toEqual({ cotizaciones: 1, proyectos: 1, ingresos: 0, borraContacto: 'Cantina 48' })
    expect(db.select().from(proyectos).where(eq(proyectos.id, p.id)).get()!.contactoId).toBe(cantina.id)
    expect(leerContacto(cantina.id)).toBeTruthy()
    expect(() => previaCambioContacto(db, 'proyecto', p.id, cantina.id)).toThrow('Ya es de Cantina 48')
  })
})

describe('Asignar proyecto', () => {
  function zamora() {
    const omar = contacto('Omar Rodriguez', { rfc: 'ZEM180223H23' })
    const cantina = proyecto(omar.id, null, { nombre: 'Cantina 48', fechaInicio: '2018-09-07' })
    const rooftop = proyecto(omar.id, null, { nombre: 'Cantina Rooftop', fechaInicio: '2019-03-20' })
    return { omar, cantina, rooftop }
  }

  it('puts invoice 481 on Cantina 48, still paid on its date', () => {
    const { omar, cantina } = zamora()
    const i = factura('481', { contactoId: omar.id, fechaRegistro: '2018-09-20', fechaPago: '2018-09-20' })
    asignarProyecto(db, i.id, cantina.id, hoy)
    expect(leerIngreso(i.id)).toMatchObject({ proyectoId: cantina.id, estado: 'pagado', fechaPago: '2018-09-20', contactoId: omar.id })
  })

  it('moves an invoice between Proyectos, and off any with Ningún proyecto, keeping its Contacto', () => {
    const { omar, cantina, rooftop } = zamora()
    const i = factura('1', { contactoId: omar.id, proyectoId: cantina.id })
    asignarProyecto(db, i.id, rooftop.id, hoy)
    expect(leerIngreso(i.id).proyectoId).toBe(rooftop.id)
    asignarProyecto(db, i.id, null, hoy)
    expect(leerIngreso(i.id)).toMatchObject({ proyectoId: null, contactoId: omar.id })
  })

  it('moves all Parcialidades of the CFDI and their Reembolsos together', () => {
    const { omar, cantina } = zamora()
    const partes = [1, 2, 3].map((n) => factura('ppd', { contactoId: omar.id, cfdiParcialidad: n, estado: n === 3 ? 'pendiente' : 'pagado' }))
    const r = ingreso({ contactoId: omar.id, reembolsoDeId: partes[0].id, subtotal: -1000, iva: -160, total: -1160 })
    asignarProyecto(db, partes[1].id, cantina.id, hoy)
    for (const i of [...partes, r]) expect(leerIngreso(i.id).proyectoId).toBe(cantina.id)
  })

  it('moves a USD invoice with its amounts unchanged', () => {
    const { omar, cantina } = zamora()
    const i = factura('usd', { contactoId: omar.id, subtotal: 3_293_103, iva: 526_897, total: 3_820_000, montoOriginal: 200_000, monedaOriginal: 'USD' })
    asignarProyecto(db, i.id, cantina.id, hoy)
    expect(leerIngreso(i.id)).toMatchObject({ proyectoId: cantina.id, total: 3_820_000, montoOriginal: 200_000, monedaOriginal: 'USD' })
  })

  it('offers only the Contacto’s client Proyectos, newest first, marking the current one', () => {
    const { omar, cantina, rooftop } = zamora()
    proyecto(contacto('Otro').id, null, { nombre: 'Ajeno' })
    const i = factura('1', { contactoId: omar.id, proyectoId: cantina.id })
    expect(opcionesAsignar(db, i.id)).toEqual({
      actual: cantina.id,
      sinContacto: false,
      proyectos: [
        { id: rooftop.id, nombre: 'Cantina Rooftop', contacto: 'Omar Rodriguez', estado: 'completado' },
        { id: cantina.id, nombre: 'Cantina 48', contacto: 'Omar Rodriguez', estado: 'completado' }
      ]
    })
  })

  it('lets an invoice with no Contacto go to any client Proyecto and take its Contacto, leaving the RFC alone', () => {
    const { omar } = zamora()
    const laBoom = proyecto(omar.id, null, { nombre: 'La Boom' })
    const ajeno = proyecto(contacto('Otro').id, null, { nombre: 'Ajeno' })
    proyecto(null, null, { nombre: 'Portafolio', etiqueta: 'personal' })
    const i = factura('padre', { notas: 'Diseño y desarrollo de sitios web laboomny.com y zamoralive' })
    const r = ingreso({ reembolsoDeId: i.id, subtotal: -1000, iva: -160, total: -1160 })
    const opciones = opcionesAsignar(db, i.id)
    expect(opciones.sinContacto).toBe(true)
    expect(opciones.proyectos.map((p) => p.id).sort()).toEqual(expect.arrayContaining([laBoom.id, ajeno.id]))
    expect(opciones.proyectos.map((p) => p.nombre)).not.toContain('Portafolio')
    asignarProyecto(db, i.id, laBoom.id, hoy)
    expect(leerIngreso(i.id)).toMatchObject({ proyectoId: laBoom.id, contactoId: omar.id })
    expect(leerIngreso(r.id)).toMatchObject({ proyectoId: laBoom.id, contactoId: omar.id })
    expect(leerContacto(omar.id)!.rfc).toBe('ZEM180223H23')
    asignarProyecto(db, i.id, null, hoy)
    expect(leerIngreso(i.id).contactoId).toBe(omar.id)
  })

  it('answers a pending vincular on an invoice with no Contacto after giving it the chosen Proyecto’s Contacto', () => {
    const { omar, cantina } = zamora()
    const otroContacto = contacto('Otro')
    const adivinado = proyecto(otroContacto.id, null, { nombre: 'Adivinado' })
    const i = factura('sin-contacto')
    const s = sugerencia({ entidad: 'ingreso', entidadId: i.id, accion: 'vincular', proyectoId: adivinado.id, motivo: 'monto' })
    asignarProyecto(db, i.id, cantina.id, hoy)
    expect(leerIngreso(i.id)).toMatchObject({ proyectoId: cantina.id, contactoId: omar.id })
    expect(estadoDe(s.id)).toBe('corregida')
  })

  describe('refusals write nothing', () => {
    it('refuses another Contacto’s Proyecto and a personal one', () => {
      const { omar, cantina } = zamora()
      const ajeno = proyecto(contacto('Otro').id, null, { nombre: 'Ajeno' })
      const personal = proyecto(null, null, { nombre: 'Portafolio', etiqueta: 'personal' })
      const i = factura('1', { contactoId: omar.id, proyectoId: cantina.id })
      expect(() => asignarProyecto(db, i.id, ajeno.id, hoy)).toThrow('La factura es de otro contacto; se asigna solo a sus proyectos')
      expect(() => asignarProyecto(db, i.id, personal.id, hoy)).toThrow('Una factura no se asigna a un proyecto personal')
      expect(leerIngreso(i.id).proyectoId).toBe(cantina.id)
    })

    it('refuses a cancelled invoice, a Reembolso and a hand-entered Ingreso', () => {
      const { omar, cantina } = zamora()
      const cancelada = factura('x', { contactoId: omar.id, estado: 'cancelado' })
      const original = factura('y', { contactoId: omar.id })
      const r = ingreso({ contactoId: omar.id, reembolsoDeId: original.id, subtotal: -1000, iva: -160, total: -1160 })
      const aMano = ingreso({ contactoId: omar.id })
      expect(() => asignarProyecto(db, cancelada.id, cantina.id, hoy)).toThrow('Una factura cancelada no se asigna a un proyecto')
      for (const i of [r, aMano]) expect(() => asignarProyecto(db, i.id, cantina.id, hoy)).toThrow('Solo una factura importada se asigna a un proyecto')
      expect(() => opcionesAsignar(db, aMano.id)).toThrow('Solo una factura importada se asigna a un proyecto')
    })
  })

  it('answers a pending vincular: aceptada for the Proyecto it proposed, corregida for another, rechazada for Ningún proyecto', () => {
    const { omar, cantina, rooftop } = zamora()
    const pendienteSobre = (uuid: string) => {
      const i = factura(uuid, { contactoId: omar.id })
      return { i, s: sugerencia({ entidad: 'ingreso', entidadId: i.id, accion: 'vincular', proyectoId: cantina.id, motivo: 'monto y fecha' }) }
    }
    const aceptada = pendienteSobre('a')
    const corregida = pendienteSobre('b')
    const rechazada = pendienteSobre('c')
    asignarProyecto(db, aceptada.i.id, cantina.id, hoy)
    asignarProyecto(db, corregida.i.id, rooftop.id, hoy)
    asignarProyecto(db, rechazada.i.id, null, hoy)
    expect([estadoDe(aceptada.s.id), estadoDe(corregida.s.id), estadoDe(rechazada.s.id)]).toEqual(['aceptada', 'corregida', 'rechazada'])
    expect(leerIngreso(corregida.i.id).proyectoId).toBe(rooftop.id)
    expect(leerIngreso(rechazada.i.id).proyectoId).toBeNull()
  })
})
