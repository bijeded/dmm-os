import { readdirSync, statSync } from 'node:fs'
import { join, posix } from 'node:path'
import { eq } from 'drizzle-orm'
import type { Db } from './db'
import { borrar } from './db/cancelacion'
import { contactos, cotizaciones, ingresos, proyectos } from './db/schema'
import { clave } from './nombres'
import {
  ESTADOS_CONTACTO,
  NOMBRES_ESTADO_CONTACTO,
  type ArchivoCliente,
  type EstadoContacto,
  type FichaContacto,
  type ListaContactos,
  type Movimiento
} from '../shared/ipc'

type EstadoProyecto = (typeof proyectos.$inferSelect)['estado']
type EstadoCotizacion = (typeof cotizaciones.$inferSelect)['estado']

interface CotizacionDe {
  estado: EstadoCotizacion
  /** Whether a Proyecto was already created from it. */
  conProyecto: boolean
}

/**
 * Estado de Contacto. Active client: an En curso or paused Proyecto, or an accepted Cotización
 * whose Proyecto doesn't exist yet. Hot lead: a sent Cotización. Inactive client: was active
 * (a completed Proyecto) and no longer is. Anything else — no quotes, drafts, only rejected,
 * expired or cancelled ones — is a cold lead.
 */
function derivarEstado(proyectosDe: EstadoProyecto[], cotizacionesDe: CotizacionDe[]): EstadoContacto {
  if (proyectosDe.some((e) => e === 'en_curso' || e === 'pausado')) return 'cliente_activo'
  if (cotizacionesDe.some((c) => c.estado === 'aceptada' && !c.conProyecto)) return 'cliente_activo'
  if (cotizacionesDe.some((c) => c.estado === 'enviada')) return 'lead_caliente'
  if (proyectosDe.includes('completado')) return 'cliente_inactivo'
  return 'lead_frio'
}

const agrupar = <T extends { contactoId: number | null }, V>(filas: T[], valor: (f: T) => V) => {
  const m = new Map<number, V[]>()
  for (const f of filas) if (f.contactoId !== null) m.set(f.contactoId, [...(m.get(f.contactoId) ?? []), valor(f)])
  return m
}

/** Paid Ingresos per Contacto, before IVA and net of Reembolsos. */
function cobradoPorContacto(db: Db): Map<number, number> {
  const m = new Map<number, number>()
  for (const i of db.select({ contactoId: ingresos.contactoId, subtotal: ingresos.subtotal }).from(ingresos).where(eq(ingresos.estado, 'pagado')).all()) {
    if (i.contactoId !== null) m.set(i.contactoId, (m.get(i.contactoId) ?? 0) + i.subtotal)
  }
  return m
}

function cotizacionesConProyecto(db: Db): Set<number | null> {
  return new Set(db.select({ id: proyectos.cotizacionId }).from(proyectos).all().map((p) => p.id))
}

const porNombre = (a: { nombre: string }, b: { nombre: string }) => a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' })

export function listarContactos(db: Db): ListaContactos {
  const deProyectos = agrupar(db.select({ contactoId: proyectos.contactoId, estado: proyectos.estado }).from(proyectos).all(), (p) => p.estado)
  const conProyecto = cotizacionesConProyecto(db)
  const deCotizaciones = agrupar(db.select({ id: cotizaciones.id, contactoId: cotizaciones.contactoId, estado: cotizaciones.estado }).from(cotizaciones).all(), (c) => ({
    estado: c.estado,
    conProyecto: conProyecto.has(c.id)
  }))
  const cobrado = cobradoPorContacto(db)

  const filas = db
    .select({ id: contactos.id, nombre: contactos.nombre, empresa: contactos.empresa, email: contactos.email, telefono: contactos.telefono })
    .from(contactos)
    .all()
    .map((c) => ({
      ...c,
      estado: derivarEstado(deProyectos.get(c.id) ?? [], deCotizaciones.get(c.id) ?? []),
      valor: cobrado.get(c.id) ?? 0
    }))
    .sort(porNombre)

  const conteo = Object.fromEntries(ESTADOS_CONTACTO.map((e) => [e, 0])) as Record<EstadoContacto, number>
  for (const f of filas) conteo[f.estado]++

  const total = filas.reduce((s, f) => s + Math.max(f.valor, 0), 0)
  const top = filas
    .filter((f) => f.valor > 0)
    .sort((a, b) => b.valor - a.valor || porNombre(a, b))
    .slice(0, 10)
    .map(({ id, nombre, valor }) => ({ id, nombre, valor, porcentaje: Math.round((valor / total) * 1000) / 10 }))

  return { contactos: filas, conteo, top }
}

const dia = (iso: string) => iso.slice(0, 10)

/** The Contacto's record: its data, its full history and the files in its `Clientes/` folder. */
export function fichaContacto(db: Db, root: string, id: number): FichaContacto {
  const contacto = db.select().from(contactos).where(eq(contactos.id, id)).get()
  if (!contacto) throw new Error(`El contacto ${id} no existe`)

  const suyasCotizaciones = db.select().from(cotizaciones).where(eq(cotizaciones.contactoId, id)).all()
  const suyosProyectos = db.select().from(proyectos).where(eq(proyectos.contactoId, id)).all()
  const suyosIngresos = db.select().from(ingresos).where(eq(ingresos.contactoId, id)).all()

  const porCobrar = suyosIngresos.filter((i) => i.estado === 'pendiente').reduce((s, i) => s + i.subtotal, 0)

  const historial: Movimiento[] = [
    ...suyasCotizaciones.map((c) => ({
      tipo: 'cotizacion' as const,
      id: c.id,
      fecha: c.fecha,
      referencia: c.folio === null ? null : `${c.folio}${c.folioSufijo}`,
      detalle: c.nombre ?? c.categoria,
      monto: c.subtotal,
      estado: c.estado
    })),
    ...suyosProyectos.map((p) => ({
      tipo: 'proyecto' as const,
      id: p.id,
      fecha: p.fechaInicio ?? dia(p.creadoEn),
      referencia: null,
      detalle: p.clienteFinal ? `${p.nombre} · ${p.clienteFinal}` : p.nombre,
      monto: null,
      estado: p.estado
    })),
    ...suyosIngresos.map((i) => ({
      tipo: 'pago' as const,
      id: i.id,
      fecha: i.fechaPago ?? i.fechaRegistro ?? dia(i.creadoEn),
      referencia: null,
      detalle: i.reembolsoDeId !== null ? 'Reembolso' : (i.notas ?? (i.periodo ? `Periodo ${i.periodo}` : i.categoria === 'factura' ? 'Factura' : 'Sin factura')),
      monto: i.subtotal,
      estado: i.estado
    }))
  ].sort((a, b) => b.fecha.localeCompare(a.fecha))

  const carpeta = carpetaDeCliente(root, contacto.nombre)
  return {
    contacto,
    estado: derivarEstado(
      suyosProyectos.map((p) => p.estado),
      suyasCotizaciones.map((c) => ({ estado: c.estado, conProyecto: suyosProyectos.some((p) => p.cotizacionId === c.id) }))
    ),
    // Same value as the list and the top 10: what has been paid.
    valor: cobradoPorContacto(db).get(id) ?? 0,
    porCobrar,
    proyectos: suyosProyectos.length,
    cotizaciones: { total: suyasCotizaciones.length, aceptadas: suyasCotizaciones.filter((c) => c.estado === 'aceptada').length },
    historial,
    carpeta,
    archivos: carpeta ? archivosDe(join(root, carpeta)) : []
  }
}

/** Folder names may omit accents (Nombre canónico), so the folder is found by its `clave`. */
function carpetaDeCliente(root: string, nombre: string): string | null {
  const buscada = clave(nombre)
  try {
    const hallada = readdirSync(join(root, 'Clientes'), { withFileTypes: true }).find((d) => d.isDirectory() && clave(d.name) === buscada)
    return hallada ? posix.join('Clientes', hallada.name) : null
  } catch {
    return null
  }
}

function archivosDe(dir: string): ArchivoCliente[] {
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((d) => !d.name.startsWith('.'))
      .map((d) => {
        const extension = d.name.includes('.') ? d.name.split('.').pop()!.toUpperCase() : ''
        return {
          nombre: d.name,
          tipo: d.isDirectory() ? 'Carpeta' : extension || 'Archivo',
          modificado: statSync(join(dir, d.name)).mtime.toISOString()
        }
      })
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
  } catch {
    return []
  }
}

/** Borrar vs cancelar: a Contacto with Cotizaciones, Proyectos or Ingresos is refused. */
export function borrarContacto(db: Db, id: number): void {
  borrar(db, 'contacto', id)
}

const celda = (v: string | null) => (v === null ? '' : /[",\r\n]/.test(v) ? `"${v.replaceAll('"', '""')}"` : v)

/** Every Contacto, ascending by name, for a newsletter service. */
export function contactosCsv(db: Db): string {
  const filas = listarContactos(db).contactos.map((c) => [c.nombre, c.empresa, c.email, c.telefono, NOMBRES_ESTADO_CONTACTO[c.estado]])
  return [['nombre', 'empresa', 'email', 'telefono', 'estado'], ...filas].map((f) => f.map(celda).join(',') + '\r\n').join('')
}
