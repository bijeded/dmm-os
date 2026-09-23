// The domain vocabulary shared by main and renderer: value lists, their labels, and the shapes
// records travel in. The IPC channels that carry them are in `contrato.ts`.

/** The currencies money is kept in: pesos, and USD for what was quoted or paid in dollars. */
export const MONEDAS = ['MXN', 'USD'] as const
export type Moneda = (typeof MONEDAS)[number]

/** An Ingreso is invoiced (factura) or not. */
export const CATEGORIAS_INGRESO = ['factura', 'sin_factura'] as const
export type CategoriaIngreso = (typeof CATEGORIAS_INGRESO)[number]

/** Where an invoiced Ingreso's CFDI stands. */
export const ESTADOS_FACTURACION = ['por_facturar', 'facturado'] as const
export type EstadoFacturacion = (typeof ESTADOS_FACTURACION)[number]

export const MOTIVOS_RESPALDO = ['semanal', 'migracion', 'manual', 'antes-de-restaurar'] as const
export type MotivoRespaldo = (typeof MOTIVOS_RESPALDO)[number]

export interface Respaldo {
  archivo: string
  path: string
  creadoEn: string
  motivo: MotivoRespaldo
  bytes: number
}

export interface EstadoRespaldos extends ConfigRespaldos {
  dir: string
  ultimo: string | null
  respaldos: Respaldo[]
}

export interface ConfigRespaldos {
  frecuenciaDias: number
  conservar: number
}

/** `restaurado: false` means the user cancelled the file picker. On success the app relaunches. */
export type ResultadoRestaurar = { restaurado: boolean }

/** What one import run found, shown in Configuración → Logs. */
export interface LogImportacion {
  importados: number
  /** CFDIs whose UUID was already in the database; re-running changed nothing. */
  duplicados: number
  /** Vouchers that carry no new money (pago, nómina, traslado). */
  ignorados: number
  /** Sugerencias de importación left waiting for accept/reject. */
  sugerencias: number
  /** RFCs no Contacto claims, so their Ingresos and Costos stayed unlinked. */
  rfcsDesconocidos: string[]
  /** Invoices imported this run whose IVA is neither 0 nor 16%, imported as charged. */
  ivasInusuales: { archivo: string; tasa: number }[]
  errores: { archivo: string; error: string }[]
  /** Folders the app knows but could not read on this run (No disponible). */
  noDisponibles: string[]
}

/** What one rescan of `Cotizaciones/`, `Clientes/` and `Proyectos/` found. */
export interface LogCarpetas {
  /** Keyed by Folio: `duplicadas` were already imported and changed nothing. */
  cotizaciones: { importadas: number; duplicadas: number }
  /** Contactos created from a folder name; existing ones are matched, never duplicated. */
  contactos: { creados: number }
  proyectos: { creados: number; actualizados: number }
  /** Proyectos created for an accepted Cotización whose folder was found nowhere. */
  proyectosSinCarpeta: number
  /** Sugerencias de importación this run left waiting for accept/reject. */
  sugerencias: number
  /** The external HDD is a secondary source; when absent its locations are No disponible. */
  hddConectado: boolean
  errores: { archivo: string; error: string }[]
  /** Folders the app knows but could not read on this run (No disponible). */
  noDisponibles: string[]
}

/** One import run, kept so Logs still shows what it found after the run itself is over. */
export interface Corrida<L> {
  corridoEn: string
  log: L
}

/** What Logs shows of the last run of each importer. Either is `null` until it has been run. */
export interface EstadoImportacion {
  facturas: Corrida<LogImportacion> | null
  carpetas: Corrida<LogCarpetas> | null
}

export const ACCIONES_SUGERENCIA = ['vincular', 'fusionar', 'ubicacion'] as const
export type AccionSugerencia = (typeof ACCIONES_SUGERENCIA)[number]
export const ENTIDADES_SUGERENCIA = ['ingreso', 'costo', 'cotizacion', 'proyecto', 'contacto'] as const
export type EntidadSugerencia = (typeof ENTIDADES_SUGERENCIA)[number]
/** For `ubicacion`, where there is nothing to accept: `aceptada` is Archivado, `rechazada` No disponible. */
export type RespuestaSugerencia = 'aceptada' | 'rechazada'

/** A Sugerencia de importación as Logs shows it: what was guessed, about what, and why. */
export interface Sugerencia {
  id: number
  accion: AccionSugerencia
  entidad: EntidadSugerencia
  /** Why the importer guessed this. */
  motivo: string
  creadoEn: string
  /** The record in doubt, e.g. `Cotización 475 · Sonrieme`. */
  registro: string
  /** The Proyecto to link to or the Contacto to merge into; `ubicacion` has none. */
  destino: string | null
}

/** The folders the app reads, and the state of the ones it cannot always reach. */
export interface Rutas {
  dmmOsRoot: string
  /** The external HDD, a secondary source; `null` until one is chosen. */
  hddRoot: string | null
  hddConectado: boolean
  /** Loose files waiting in `Entrada/`; `null` when the folder cannot be read. */
  entrada: number | null
}

/** A folder the app can reveal in Finder. */
export type CarpetaAbrible = 'raiz' | 'entrada' | 'facturas'

/** A subfolder of `Lab/`, where Claude Desktop output lands, and how many files it holds. */
export interface CarpetaLab {
  nombre: string
  archivos: number
}

/** A file in a Lab folder. `tipo` comes from its extension (`MD`, `PDF`), '' when it has none. */
export interface ArchivoLab {
  nombre: string
  tipo: string
  bytes: number
  /** ISO timestamp. */
  modificado: string
}

/** Whether a year's Costos are known at all; a year without them shows Sin datos. */
export interface CoberturaAnual {
  anio: number
  sinDatos: boolean
}

/** Estado de Contacto: always derived from its Cotizaciones and Proyectos, never set by hand. */
export const ESTADOS_CONTACTO = ['lead_frio', 'lead_caliente', 'cliente_activo', 'cliente_inactivo'] as const
export type EstadoContacto = (typeof ESTADOS_CONTACTO)[number]

/** How the Estado de Contacto reads, in the app and in the CSV. */
export const NOMBRES_ESTADO_CONTACTO: Record<EstadoContacto, string> = {
  lead_frio: 'Lead frío',
  lead_caliente: 'Lead caliente',
  cliente_activo: 'Cliente activo',
  cliente_inactivo: 'Cliente inactivo'
}

/** One row of the Contactos table. Money is integer centavos, before IVA. */
export interface FilaContacto {
  id: number
  nombre: string
  empresa: string | null
  email: string | null
  telefono: string | null
  estado: EstadoContacto
  /** What the Contacto has paid, net of Reembolsos. */
  valor: number
}

/** What the user writes by hand for a new or edited Contacto. Estado is derived, never written. */
export interface ContactoNuevo {
  id?: number
  nombre: string
  empresa: string | null
  email: string | null
  telefono: string | null
  direccion: string | null
  notas: string | null
}

export interface ListaContactos {
  /** Ascending by name. */
  contactos: FilaContacto[]
  conteo: Record<EstadoContacto, number>
  /** Top 10 by value, with each one's share (0–100) of all revenue from Contactos. */
  top: { id: number; nombre: string; valor: number; porcentaje: number }[]
}

/** One line of a Contacto's history: a Cotización, a Proyecto or a payment (Ingreso). */
export interface Movimiento {
  tipo: 'cotizacion' | 'proyecto' | 'pago'
  id: number
  fecha: string
  /** The Folio of a Cotización; nothing for the rest. */
  referencia: string | null
  detalle: string
  /** Centavos before IVA; `null` for a Proyecto, whose money is in its payments. */
  monto: number | null
  estado: string
}

/** A file already in `Clientes/<name>/`, read from disk as it is. */
export interface ArchivoCliente {
  nombre: string
  /** `Carpeta`, or the extension in capitals. */
  tipo: string
  modificado: string
}

export interface FichaContacto {
  contacto: {
    id: number
    nombre: string
    empresa: string | null
    rfc: string | null
    email: string | null
    telefono: string | null
    direccion: string | null
    notas: string | null
    creadoEn: string
  }
  estado: EstadoContacto
  /** What the Contacto has paid, net of Reembolsos: the same value as in the list. */
  valor: number
  /** Pending Ingresos. */
  porCobrar: number
  proyectos: number
  /** Drafts count; `aceptadas` is what the conversion rate is made of. */
  cotizaciones: { total: number; aceptadas: number }
  /** Newest first. */
  historial: Movimiento[]
  /** The Contacto's folder under `Clientes/`, relative to the DMM OS root; `null` when none matches. */
  carpeta: string | null
  archivos: ArchivoCliente[]
}

export const CATEGORIAS = ['website', 'ecommerce', 'app', 'ai', 'marketing', 'other'] as const
export type Categoria = (typeof CATEGORIAS)[number]

export const NOMBRES_CATEGORIA: Record<Categoria, string> = {
  website: 'Website',
  ecommerce: 'Ecommerce',
  app: 'App',
  ai: 'AI',
  marketing: 'Marketing',
  other: 'Otro'
}

/** A product or service of the Catálogo. `precio` is its default, in centavos before IVA. */
export interface ConceptoCatalogo {
  id: number
  concepto: string
  categoria: Categoria
  precio: number
}

/** Without `id` it adds a concept; with one it edits it. */
export type ConceptoNuevo = Omit<ConceptoCatalogo, 'id'> & { id?: number }

/** One line of a Cotización's items: a copy taken at creation, never a link to the Catálogo. */
export interface PartidaCotizacion {
  concepto: string
  categoria: Categoria
  cantidad: number
  /** Unit price in centavos before IVA. */
  precio: number
}

export const CATEGORIAS_COSTO = ['unico', 'mensual', 'msi', 'anual'] as const
export type CategoriaCosto = (typeof CATEGORIAS_COSTO)[number]

export const NOMBRES_CATEGORIA_COSTO: Record<CategoriaCosto, string> = {
  unico: 'Único',
  mensual: 'Mensual',
  msi: 'MSI',
  anual: 'Anual'
}

/**
 * A cost DMM expects to pay for a quote, in the quote's currency, centavos before IVA. Never
 * shown to the Contacto. `monto` is per period for recurring costs, per installment for MSI.
 */
export interface CostoEstimado {
  concepto: string
  monto: number
  categoria: CategoriaCosto
  /** How many installments, only for `msi`. */
  parcialidades: number | null
}

export const ESTADOS_COTIZACION = ['borrador', 'enviada', 'aceptada', 'rechazada', 'cancelada', 'expirada'] as const
export type EstadoCotizacion = (typeof ESTADOS_COTIZACION)[number]

/** What can be done to a quote; which ones apply depends on its estado and is decided in main. */
export type AccionCotizacion = 'editar' | 'borrar' | 'enviar' | 'aceptar' | 'rechazar' | 'cancelar'

export const NOMBRES_ESTADO_COTIZACION: Record<EstadoCotizacion, string> = {
  borrador: 'Borrador',
  enviada: 'Enviada',
  aceptada: 'Aceptada',
  rechazada: 'Rechazada',
  cancelada: 'Cancelada',
  expirada: 'Expirada'
}

export const FACTURACIONES = ['unica', 'mensual', 'parcialidades'] as const
export type Facturacion = (typeof FACTURACIONES)[number]

export const NOMBRES_FACTURACION: Record<Facturacion, string> = {
  unica: 'Pago único',
  mensual: 'Mensual',
  parcialidades: 'Parcialidades'
}

/** What the quote form edits. Without `id` it creates a draft; with one it edits that draft. */
export interface CotizacionNueva {
  id?: number
  contactoId: number
  /** What the quote is for; it becomes the Proyecto's name when accepted. */
  nombre: string
  categoria: Categoria
  /** `YYYY-MM-DD` */
  fecha: string
  validezDias: number
  moneda: Moneda
  partidas: PartidaCotizacion[]
  /** Adds 16% IVA on top of the subtotal. */
  conIva: boolean
  facturacion: Facturacion
  /** Number of payments, only for `parcialidades`. */
  parcialidades: number | null
  stack: string | null
  terminos: string | null
  notas: string | null
  costosEstimados: CostoEstimado[]
}

/** One row of the Cotizaciones table. Money in centavos before IVA. */
export interface FilaCotizacion {
  id: number
  /** `475b`; `null` for a draft. */
  folio: string | null
  fecha: string
  contactoId: number
  contacto: string
  nombre: string | null
  categoria: Categoria
  subtotal: number
  estado: EstadoCotizacion
  /** Whether it has an archived PDF. */
  pdf: boolean
}

export interface ListaCotizaciones {
  /** Drafts first, then by Folio descending. */
  cotizaciones: FilaCotizacion[]
  resumen: {
    /** Every quote but drafts. */
    total: number
    enviadas: number
    /** Accepted over every quote but drafts, 0–100. */
    conversion: number
    /** Subtotal of sent quotes still waiting for an answer. */
    montoAbiertas: number
    /** Average subtotal of every quote but drafts. */
    promedio: number
  }
  porCategoria: Record<Categoria, number>
}

export interface FichaCotizacion extends Required<Omit<CotizacionNueva, 'id'>> {
  id: number
  folio: string | null
  estado: EstadoCotizacion
  contacto: string
  subtotal: number
  iva: number
  total: number
  /** The archived PDF, relative to the DMM OS root. */
  pdf: string | null
  proyectoId: number | null
  /** The actions its estado allows now. */
  acciones: AccionCotizacion[]
}

export const ESTADOS_PROYECTO = ['en_curso', 'pausado', 'completado', 'cancelado'] as const
export type EstadoProyecto = (typeof ESTADOS_PROYECTO)[number]

export const NOMBRES_ESTADO_PROYECTO: Record<EstadoProyecto, string> = {
  en_curso: 'En curso',
  pausado: 'Pausado',
  completado: 'Completado',
  cancelado: 'Cancelado'
}

export const ETIQUETAS_PROYECTO = ['cliente', 'personal'] as const
export type EtiquetaProyecto = (typeof ETIQUETAS_PROYECTO)[number]

/** What can be done to a Proyecto; which ones apply depends on its estado and is decided in main. */
export type AccionProyecto = 'editar' | 'borrar' | 'pausar' | 'reanudar' | 'completar' | 'cancelar'

/** Why Completar is held back: the Ficha shows it beside what is unpaid, and the command refuses with it. */
export const MENSAJE_SIN_PAGAR = 'El proyecto se completa cuando esté pagado por completo'

/**
 * Where a Proyecto's files are. `disponible`: its folder is there to open. `archivado`: its
 * files left `Proyectos/` for long-term storage. `no_disponible`: a folder the app knows but
 * cannot reach now. `sin_carpeta`: no location recorded at all.
 */
export type EstadoCarpeta = 'disponible' | 'archivado' | 'no_disponible' | 'sin_carpeta'

export interface CarpetaProyecto {
  estado: EstadoCarpeta
  /** Relative to the root of wherever it lives. */
  ruta: string | null
  /** Whether it can be revealed in Finder right now. */
  abrible: boolean
}

/** What the Proyecto form edits. Without `id` it creates one; with one it edits it. */
export interface ProyectoNuevo {
  id?: number
  nombre: string
  /** A personal Proyecto has no Contacto and no Cotización. */
  etiqueta: EtiquetaProyecto
  contactoId: number | null
  clienteFinal: string | null
  categoria: Categoria
  /** `YYYY-MM-DD` */
  fechaInicio: string | null
  fechaEntrega: string | null
  notas: string | null
}

/** One row of the Proyectos table. */
export interface FilaProyecto {
  id: number
  /** `PRY-014` */
  referencia: string
  nombre: string
  etiqueta: EtiquetaProyecto
  contactoId: number | null
  contacto: string | null
  clienteFinal: string | null
  categoria: Categoria
  fechaInicio: string | null
  estado: EstadoProyecto
  carpeta: CarpetaProyecto
  /** Completed, with a folder and a Cotización, but its Ingresos never reached the quote total. */
  sinIngresosRegistrados: boolean
}

export interface ListaProyectos {
  /** By reference, newest first. */
  proyectos: FilaProyecto[]
  conteo: Record<EstadoProyecto, number>
  porCategoria: Record<Categoria, number>
}

export interface FichaProyecto extends Required<Omit<ProyectoNuevo, 'id'>> {
  id: number
  referencia: string
  estado: EstadoProyecto
  contacto: string | null
  cotizacionId: number | null
  /** The Folio of the Cotización it came from. */
  folio: string | null
  fechaFin: string | null
  carpeta: CarpetaProyecto
  /** Pending Ingresos, centavos before IVA: while any remain it cannot be completed. */
  porCobrar: number
  cobrado: number
  /**
   * Why its estado allows completing it but its payments don't yet: how many Ingresos are
   * pending, and what is missing to reach its Cotización's total (with IVA, in the quote's
   * currency). `null` when it can be completed, or its estado doesn't allow it.
   */
  falta: { pendientes: number; faltante: number; moneda: Moneda } | null
  acciones: AccionProyecto[]
}

export const PERIODOS_FINANZAS = ['mes', 'trimestre', 'anio', 'cinco_anios', 'todo'] as const
export type PeriodoFinanzas = (typeof PERIODOS_FINANZAS)[number]

export const NOMBRES_PERIODO_FINANZAS: Record<PeriodoFinanzas, string> = {
  mes: 'Este mes',
  trimestre: 'Este trimestre',
  anio: 'Este año',
  cinco_anios: 'Últimos 5 años',
  todo: 'Todo el tiempo'
}

/** A span of days, `YYYY-MM-DD` both ends included. */
export interface Rango {
  desde: string
  hasta: string
}

/** The money of one span. Revenue, costs and profit are subtotals (before IVA); IVA is apart. */
export interface CifrasFinanzas {
  ingresos: number
  ingresosFactura: number
  ingresosSinFactura: number
  ivaIngresos: number
  retencionesIngresos: number
  costos: number
  ivaCostos: number
  retencionesCostos: number
  /** Sin datos (`null`) when any year of the span has no Costos at all: never estimated. */
  utilidad: number | null
}

/** One point of the income vs costs chart; `…Anterior` is the same point a period earlier. */
export interface PuntoFinanzas {
  etiqueta: string
  ingresos: number
  costos: number
  ingresosAnterior: number | null
  costosAnterior: number | null
}

export type AccionIngreso = 'pagar' | 'cancelar' | 'borrar' | 'reembolsar'
export type AccionCosto = 'pagar' | 'cancelar' | 'borrar' | 'detener'

export const ESTADOS_INGRESO = ['pendiente', 'pagado', 'cancelado', 'incobrable'] as const
export type EstadoIngreso = (typeof ESTADOS_INGRESO)[number]
export const ESTADOS_COSTO = ['pendiente', 'pagado', 'cancelado'] as const
export type EstadoCosto = (typeof ESTADOS_COSTO)[number]

export const NOMBRES_ESTADO_INGRESO: Record<EstadoIngreso, string> = {
  pendiente: 'Pendiente',
  pagado: 'Pagado',
  cancelado: 'Cancelado',
  incobrable: 'Incobrable'
}

/** An Ingreso as Finanzas lists it. Money in centavos. */
export interface FilaIngreso {
  id: number
  /** When it was paid, else when it was registered; `null` while not yet invoiced. */
  fecha: string | null
  contacto: string | null
  proyecto: string | null
  categoria: CategoriaIngreso
  estadoFacturacion: EstadoFacturacion | null
  estado: EstadoIngreso
  subtotal: number
  iva: number
  /** Taxes withheld by the payer; the total is already net of them. */
  retenciones: number
  total: number
  /** `cfdi`: imported from Facturas; `periodo`: generated by a monthly or installment quote. */
  origen: 'cfdi' | 'periodo' | 'cotizacion' | 'manual'
  /** Cobranza vencida: invoiced, unpaid, older than the configured days. */
  vencida: boolean
  /** The currency it was paid in. */
  moneda: Moneda
  /** What a Reembolso can still give back, in `moneda` (centavos or USD cents); 0 when none. */
  reembolsable: number
  /** Set on a Reembolso: the Ingreso it gives money back from. */
  reembolsoDeId: number | null
  notas: string | null
  acciones: AccionIngreso[]
}

/** A Costo as Finanzas lists it. Money in centavos. */
export interface FilaCosto {
  id: number
  fecha: string
  nombre: string
  proveedor: string | null
  proyecto: string | null
  categoria: CategoriaCosto
  estado: EstadoCosto
  estimado: boolean
  subtotal: number
  iva: number
  retenciones: number
  total: number
  /** `recurrente`: generated from a monthly, MSI or annual definition. */
  origen: 'cfdi' | 'recurrente' | 'manual'
  acciones: AccionCosto[]
}

/** A payment coming up: a pending Costo, or the next period of a recurring one. */
export interface PagoProximo {
  fecha: string
  nombre: string
  proveedor: string | null
  categoria: CategoriaCosto
  total: number
}

export interface ResumenFinanzas {
  periodo: PeriodoFinanzas
  rango: Rango
  /** The same span a period earlier; `null` for Todo el tiempo. */
  rangoAnterior: Rango | null
  actual: CifrasFinanzas
  anterior: CifrasFinanzas | null
  serie: PuntoFinanzas[]
  /** Years within either span whose Costos were never imported. */
  sinDatos: number[]
  /** Money already collected: the period's paid Ingresos (Reembolsos negative), newest first. */
  cobrado: FilaIngreso[]
  /** Every pending Ingreso, oldest first, whatever the period. */
  cobranza: FilaIngreso[]
  /** Ingreso real: the sum of Cobrado. */
  real: number
  /** Ingreso real − Costos; `null` (Sin datos) under the same rule as `actual.utilidad`. */
  utilidadReal: number | null
  /**
   * Inicio's Cobros: the pending Ingresos dated this month or earlier, each in one group —
   * Cobranza vencida, por facturar, or everything else collectable. Later ones are in none.
   */
  cobros: { mes: FilaIngreso[]; vencidos: FilaIngreso[]; porFacturar: FilaIngreso[] }
  /** Every pending Costo, soonest first, whatever the period. */
  costosPendientes: FilaCosto[]
  /** The period's Ingresos and Costos, newest first. */
  ingresos: FilaIngreso[]
  costos: FilaCosto[]
  proximosPagos: PagoProximo[]
  /** How many days after it is registered an unpaid invoice becomes Cobranza vencida. */
  diasVencida: number
}

/** A hand-entered Ingreso, e.g. uninvoiced history. Money in centavos. */
export interface IngresoNuevo {
  categoria: CategoriaIngreso
  /** Only for `factura`: whether the invoice is already issued. */
  facturado: boolean
  contactoId: number | null
  /** The Contacto is taken from the Proyecto when one is given. */
  proyectoId: number | null
  /** `YYYY-MM-DD` */
  fecha: string
  subtotal: number
  /** 16% IVA on top; ignored for `sin_factura`, which carries none. */
  conIva: boolean
  /** Paid on `fecha`; otherwise it waits in Cobranza. */
  pagado: boolean
  notas: string | null
}

/**
 * A hand-entered Costo. `unico` is one record; `mensual`, `msi` and `anual` become a definition
 * that generates a dated Costo per period from `fecha` on. Amount is per period / installment.
 */
export interface CostoNuevo {
  nombre: string
  proveedor: string | null
  referencia: string | null
  categoria: CategoriaCosto
  proyectoId: number | null
  /** `YYYY-MM-DD`: the date of a one-time Costo, the first due date of a recurring one. */
  fecha: string
  subtotal: number
  /** 16% IVA on top. */
  conIva: boolean
  /** Only for `msi`. */
  parcialidades: number | null
  suscripcionIa: boolean
  /** Only for `unico`. */
  pagado: boolean
}

/** A to-do on Inicio. Dates are `YYYY-MM-DD`. */
export interface Tarea {
  id: number
  texto: string
  fechaRegistro: string
  /** `null` while pending. */
  fechaHecha: string | null
}

export interface ListaTareas {
  /** Oldest first. */
  pendientes: Tarea[]
  /** Done in the last `diasHechas` days, newest first. */
  hechas: Tarea[]
  /** How many days a done Tarea stays in `hechas`. */
  diasHechas: number
}

/** What is current, for Inicio: the month as Finanzas reads it, Proyectos en curso, open Cotizaciones and Tareas. */
export interface ResumenInicio {
  finanzas: ResumenFinanzas
  proyectos: FilaProyecto[]
  cotizaciones: FilaCotizacion[]
  tareas: ListaTareas
}
