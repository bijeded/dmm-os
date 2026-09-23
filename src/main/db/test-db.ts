import { resolve } from 'node:path'
import { createDatabase, type Ajustes, type Db } from './index'
import { contactos, cotizaciones, proyectos } from './schema'

const migrationsFolder = resolve(import.meta.dirname, '../../../drizzle')
/** A fresh in-memory database per test; call from `beforeEach`. Tests read it through the live `db` binding. */
export let db: Db
/** The settings of the same database. */
export let ajustes: Ajustes

export function reiniciarDb() {
  ;({ db, ajustes } = createDatabase(migrationsFolder).abrir(':memory:'))
}

export function contacto(nombre = 'Estudio Ocho') {
  return db.insert(contactos).values({ nombre }).returning().get()
}

export function cotizacionAceptada(contactoId: number, folio = 100) {
  return db
    .insert(cotizaciones)
    .values({ contactoId, folio, categoria: 'website', estado: 'aceptada', fecha: '2026-01-10' })
    .returning()
    .get()
}

export function proyecto(contactoId: number, cotizacionId: number | null) {
  return db
    .insert(proyectos)
    .values({ nombre: 'Hospital Jardín', contactoId, cotizacionId, categoria: 'website' })
    .returning()
    .get()
}

export const ingresoBase = { fechaRegistro: '2026-02-01', subtotal: 1000, iva: 160, total: 1160 }
