import { eq } from 'drizzle-orm'
import type { ProblemaFilaMapa } from '../../shared/dominio'
import type { Db } from '../db'
import { contactos } from '../db/schema'
import { clave } from '../nombres'
import { resolverContacto } from './carpetas'
import type { FilaMapa, Mapa } from './mapa'

/**
 * The RFCs of the Mapa de nombres, applied once every pass of the folder scan is done, so a
 * row's name may have resolved in any of them. Unlike names, an RFC is applied on every scan:
 * it only ever fills a Contacto's empty RFC, so it re-attributes nothing. Every RFC it will
 * not store is reported, never forced: the unique index on `contactos.rfc` is only a backstop.
 */

const FORMA_RFC = /^[A-ZÑ&]{3,4}\d{6}[A-Z\d]{3}$/
/** Público en general and extranjero: they name no one. */
const GENERICOS = new Set(['XAXX010101000', 'XEXX010101000'])

export interface RfcsAsignados {
  asignados: { contactoId: number; rfc: string }[]
  /** Contactos created for an RFC-only row. */
  contactosCreados: number[]
  problemas: { linea: number; problema: ProblemaFilaMapa; enDisco: string }[]
}

export function asignarRfcs(db: Db, mapa: Mapa): RfcsAsignados {
  const r: RfcsAsignados = { asignados: [], contactosCreados: [], problemas: [] }
  const reportar = (fila: FilaMapa, problema: ProblemaFilaMapa) =>
    r.problemas.push({ linea: fila.linea, problema, enDisco: fila.enDisco ?? '' })

  db.transaction((tx) => {
    // Between rows the first wins: one RFC per Contacto, one Contacto per RFC.
    const contactoDeRfc = new Map<string, string>()
    const rfcDeContacto = new Map<string, string>()

    for (const fila of mapa.filas) {
      if (!fila.rfc) continue
      const rfc = fila.rfc.toUpperCase().replace(/\s+/g, '')
      if (GENERICOS.has(rfc)) {
        reportar(fila, 'rfc generico')
        continue
      }
      if (!FORMA_RFC.test(rfc)) {
        reportar(fila, 'rfc invalido')
        continue
      }

      // A row with a name on disk gives its RFC to the Contacto that name resolved to; a name
      // never found gives nothing (and the row is already reported unused). An RFC-only row
      // names its Contacto directly, created only once its RFC is sure to be stored.
      const hallado = fila.enDisco === null ? undefined : mapa.contactoDe(fila)
      if (fila.enDisco !== null && hallado === undefined) continue
      const todos = tx.select().from(contactos).all()
      const contacto =
        hallado !== undefined
          ? todos.find((c) => c.id === hallado)
          : todos.find((c) => clave(c.nombre) === clave(fila.contacto))
      // By Nombre canónico, so a Contacto this pass is about to create is the same one throughout.
      const llave = clave(contacto?.nombre ?? fila.contacto)

      const otroContacto = contactoDeRfc.get(rfc)
      if (otroContacto !== undefined && otroContacto !== llave) {
        reportar(fila, 'rfc de otro contacto')
        continue
      }
      const otroRfc = rfcDeContacto.get(llave)
      if (otroRfc !== undefined && otroRfc !== rfc) {
        reportar(fila, 'contacto con otro rfc')
        continue
      }
      contactoDeRfc.set(rfc, llave)
      rfcDeContacto.set(llave, rfc)

      if (contacto?.rfc === rfc) continue
      if (todos.some((c) => c.rfc === rfc && c.id !== contacto?.id)) {
        reportar(fila, 'rfc de otro contacto')
        continue
      }
      if (contacto?.rfc) {
        reportar(fila, 'contacto con otro rfc')
        continue
      }

      let contactoId = contacto?.id
      if (contactoId === undefined) {
        const creado = resolverContacto(tx, fila.contacto, { canonico: true })
        contactoId = creado.contactoId
        r.contactosCreados.push(...creado.contactosCreados)
      }
      tx.update(contactos).set({ rfc }).where(eq(contactos.id, contactoId)).run()
      r.asignados.push({ contactoId, rfc })
    }
  })
  return r
}
