import { and, asc, eq, isNull, ne } from 'drizzle-orm'
import type { Db } from './db'
import { cotizaciones, proyectos } from './db/schema'
import { exigirCotizacion } from './ciclo-cotizacion'
import { heredarDeCotizacion } from './ciclo-proyecto'
import { contexto, fichaCotizacion, leer, registrarAceptacion } from './cotizar'
import { preguntarPartidas, proyectoDeCotizacionAceptada } from './importacion/carpetas'
import type { EleccionAceptacionTardia, FichaCotizacion, OpcionesAceptacionTardia } from '../shared/dominio'

// Aceptación tardía: marking an expirada or rechazada Cotización aceptada, because the Contacto
// took it after all. What is recorded follows where the Cotización came from. One made in the app
// is accepted as a sent one is, with its Plan de cobro dated hoy. An imported one is history
// (ADR-0002, ADR-0004): it records no money, only the Proyecto it led to.

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]

/** The Proyectos an imported Cotización may have led to: its Contacto's, with no Cotización and not cancelled. */
const elegible = (contactoId: number) => and(eq(proyectos.contactoId, contactoId), isNull(proyectos.cotizacionId), ne(proyectos.estado, 'cancelado'))

const proyectosSinCotizacion = (db: Db | Tx, contactoId: number) =>
  db
    .select({ id: proyectos.id, nombre: proyectos.nombre, estado: proyectos.estado })
    .from(proyectos)
    .where(elegible(contactoId))
    .orderBy(asc(proyectos.nombre), asc(proyectos.id))
    .all()

/** What the dialog offers; only for a Cotización the Aceptación tardía allows, so the two never disagree. */
export function opcionesAceptacionTardia(db: Db, id: number): OpcionesAceptacionTardia {
  const c = leer(db, id)
  exigirCotizacion('aceptarTarde', c.estado, contexto(db, id))
  return { importado: c.importado, moneda: c.moneda, proyectos: c.importado ? proyectosSinCotizacion(db, c.contactoId) : [] }
}

export function aceptarTarde(db: Db, root: string, id: number, hoy: string, eleccion: EleccionAceptacionTardia): FichaCotizacion {
  const c = leer(db, id)
  exigirCotizacion('aceptarTarde', c.estado, contexto(db, id))

  if (!c.importado) {
    if ('proyectoId' in eleccion) throw new Error('Una cotización hecha en la app crea su propio proyecto')
    return registrarAceptacion(db, root, c, hoy, eleccion.tipoCambio)
  }

  if (!('proyectoId' in eleccion)) throw new Error('Elige el proyecto al que llevó la cotización')
  db.transaction((tx) => {
    const { changes } = tx
      .update(cotizaciones)
      .set({ estado: 'aceptada' })
      .where(and(eq(cotizaciones.id, id), eq(cotizaciones.estado, c.estado)))
      .run()
    if (changes !== 1) throw new Error('La cotización cambió; vuelve a abrirla')
    if (eleccion.proyectoId === 'nuevo') {
      proyectoDeCotizacionAceptada(tx, c)
    } else {
      // Checked inside the transaction: the Proyecto may have taken a Cotización since the dialog opened.
      const elegido = tx
        .select()
        .from(proyectos)
        .where(and(eq(proyectos.id, eleccion.proyectoId), elegible(c.contactoId)))
        .get()
      if (!elegido) throw new Error('Ese proyecto ya no se puede elegir')
      tx.update(proyectos)
        .set({ cotizacionId: id, ...heredarDeCotizacion(elegido, c) })
        .where(eq(proyectos.id, elegido.id))
        .run()
    }
    preguntarPartidas(tx, c)
  })
  return fichaCotizacion(db, id)
}
