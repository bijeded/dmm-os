import { sql } from 'drizzle-orm'
import {
  check,
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
  type AnySQLiteColumn
} from 'drizzle-orm/sqlite-core'
import {
  ACCIONES_SUGERENCIA,
  CATEGORIAS,
  CATEGORIAS_COSTO,
  CATEGORIAS_INGRESO,
  ENTIDADES_SUGERENCIA,
  ESTADOS_COSTO,
  ESTADOS_COTIZACION,
  ESTADOS_FACTURACION,
  ESTADOS_INGRESO,
  ESTADOS_PROYECTO,
  ETIQUETAS_PROYECTO,
  FACTURACIONES,
  MONEDAS,
  type CostoEstimado
} from '../../shared/dominio'

// Money is stored as integer centavos (MXN); a USD amount, where one is kept, as integer USD cents.
// Periods are 'YYYY-MM'. Dates are 'YYYY-MM-DD'. File locations are relative paths (docs/adr/0001).

export const categorias = CATEGORIAS

const creadoEn = () =>
  text('creado_en')
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`)

const cuadraTotal = (t: {
  subtotal: AnySQLiteColumn
  iva: AnySQLiteColumn
  retenciones: AnySQLiteColumn
  total: AnySQLiteColumn
}) => sql`${t.total} = ${t.subtotal} + ${t.iva} - ${t.retenciones}`

const montos = () => ({
  subtotal: integer('subtotal').notNull(),
  iva: integer('iva').notNull().default(0),
  /** Taxes withheld by the payer; only an imported CFDI carries them. */
  retenciones: integer('retenciones').notNull().default(0),
  total: integer('total').notNull(),
  montoOriginal: integer('monto_original'),
  monedaOriginal: text('moneda_original', { enum: MONEDAS })
})

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull()
})

// Estado de Contacto is derived from Cotizaciones and Proyectos; no column.
export const contactos = sqliteTable(
  'contactos',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    nombre: text('nombre').notNull(),
    empresa: text('empresa'),
    // RFC as it appears in the CFDI; how the importer recognises a Contacto.
    rfc: text('rfc'),
    email: text('email'),
    telefono: text('telefono'),
    direccion: text('direccion'),
    notas: text('notas'),
    creadoEn: creadoEn()
  },
  (t) => [uniqueIndex('contactos_rfc_unique').on(t.rfc)]
)

// Catálogo: default prices only. A Cotización copies them into its items at creation, so
// nothing links back here and later edits don't touch past quotes.
export const catalogo = sqliteTable('catalogo', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  concepto: text('concepto').notNull(),
  categoria: text('categoria', { enum: categorias }).notNull(),
  /** Default price before IVA. */
  precio: integer('precio').notNull(),
  creadoEn: creadoEn()
})

/** A to-do on Inicio. Done ones stay, dated, and show for 30 days. */
export const tareas = sqliteTable('tareas', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  texto: text('texto').notNull(),
  /** `YYYY-MM-DD` */
  fechaRegistro: text('fecha_registro').notNull(),
  fechaHecha: text('fecha_hecha'),
  creadoEn: creadoEn()
})

export const cotizaciones = sqliteTable(
  'cotizaciones',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    folio: integer('folio'),
    // Two quotes may share a Folio and be told apart by a letter (`475a`, `475b`). Empty,
    // never null, so the Folio stays a single unique key.
    folioSufijo: text('folio_sufijo').notNull().default(''),
    /**
     * What the quote is for, as its archived PDF names it. A legacy one may list several, and
     * holds the Proyecto that the Mapa de nombres or its `Cliente - Proyecto` name gives it.
     */
    nombre: text('nombre'),
    contactoId: integer('contacto_id')
      .notNull()
      .references(() => contactos.id, { onDelete: 'restrict' }),
    categoria: text('categoria', { enum: categorias }).notNull(),
    estado: text('estado', {
      enum: ESTADOS_COTIZACION
    })
      .notNull()
      .default('borrador'),
    fecha: text('fecha').notNull(),
    validezDias: integer('validez_dias').notNull().default(30),
    moneda: text('moneda', { enum: MONEDAS }).notNull().default('MXN'),
    /** MXN per USD, set when a USD quote is accepted; converts its Ingresos paid in pesos. */
    tipoCambio: real('tipo_cambio'),
    items: text('items', { mode: 'json' }).notNull().default('[]'),
    stack: text('stack'),
    subtotal: integer('subtotal').notNull().default(0),
    iva: integer('iva').notNull().default(0),
    total: integer('total').notNull().default(0),
    facturacion: text('facturacion', { enum: FACTURACIONES })
      .notNull()
      .default('unica'),
    /** How many payments `parcialidades` billing splits the total into. */
    parcialidades: integer('parcialidades'),
    terminos: text('terminos'),
    notas: text('notas'),
    /** Never shown to the Contacto; become estimated Costos when the quote is accepted. */
    costosEstimados: text('costos_estimados', { mode: 'json' }).$type<CostoEstimado[]>().notNull().default([]),
    pdfRutaRelativa: text('pdf_ruta'),
    creadoEn: creadoEn()
  },
  (t) => [
    uniqueIndex('cotizaciones_folio_unique').on(t.folio, t.folioSufijo),
    index('cotizaciones_contacto_idx').on(t.contactoId),
    check('cotizaciones_folio_borrador', sql`(${t.estado} = 'borrador') = (${t.folio} IS NULL)`)
  ]
)

export const proyectos = sqliteTable(
  'proyectos',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    nombre: text('nombre').notNull(),
    contactoId: integer('contacto_id').references(() => contactos.id, { onDelete: 'restrict' }),
    cotizacionId: integer('cotizacion_id').references(() => cotizaciones.id, {
      onDelete: 'restrict'
    }),
    clienteFinal: text('cliente_final'),
    categoria: text('categoria', { enum: categorias }).notNull(),
    etiqueta: text('etiqueta', { enum: ETIQUETAS_PROYECTO }).notNull().default('cliente'),
    estado: text('estado', { enum: ESTADOS_PROYECTO })
      .notNull()
      .default('en_curso'),
    fechaInicio: text('fecha_inicio'),
    fechaEntrega: text('fecha_entrega'),
    fechaFin: text('fecha_fin'),
    notas: text('notas'),
    creadoEn: creadoEn()
  },
  (t) => [
    // 1 Cotización → 0..1 Proyecto
    uniqueIndex('proyectos_cotizacion_unique').on(t.cotizacionId),
    index('proyectos_contacto_idx').on(t.contactoId),
    check(
      'proyectos_personal_sin_contacto',
      sql`${t.etiqueta} = 'cliente' OR (${t.contactoId} IS NULL AND ${t.cotizacionId} IS NULL)`
    )
  ]
)

// Where a Proyecto's files live. Archivado = only archive locations; No disponible = known but unreachable.
export const ubicacionesArchivo = sqliteTable(
  'ubicaciones_archivo',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    proyectoId: integer('proyecto_id')
      .notNull()
      .references(() => proyectos.id, { onDelete: 'restrict' }),
    tipo: text('tipo', {
      enum: ['proyectos', 'archivo', 'hdd_externo', 'google_drive']
    }).notNull(),
    rutaRelativa: text('ruta_relativa').notNull(),
    disponible: integer('disponible', { mode: 'boolean' }).notNull().default(true),
    verificadoEn: text('verificado_en')
  },
  (t) => [uniqueIndex('ubicaciones_proyecto_tipo_unique').on(t.proyectoId, t.tipo)]
)

// Monthly or installment billing defined by an accepted Cotización; generates Ingreso periods.
export const definicionesIngreso = sqliteTable(
  'definiciones_ingreso',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    cotizacionId: integer('cotizacion_id').references(() => cotizaciones.id, {
      onDelete: 'restrict'
    }),
    proyectoId: integer('proyecto_id').references(() => proyectos.id, { onDelete: 'restrict' }),
    contactoId: integer('contacto_id').references(() => contactos.id, { onDelete: 'restrict' }),
    tipo: text('tipo', { enum: ['mensual', 'parcialidades'] }).notNull(),
    categoria: text('categoria', { enum: CATEGORIAS_INGRESO }).notNull(),
    ...montos(),
    diaDelMes: integer('dia_del_mes').notNull().default(1),
    periodoInicio: text('periodo_inicio').notNull(),
    periodoFin: text('periodo_fin'),
    numeroParcialidades: integer('numero_parcialidades'),
    creadoEn: creadoEn()
  },
  (t) => [
    check('definiciones_ingreso_total', cuadraTotal(t)),
    check(
      'definiciones_ingreso_parcialidades',
      sql`(${t.tipo} = 'parcialidades') = (${t.numeroParcialidades} IS NOT NULL)`
    )
  ]
)

export const definicionesCosto = sqliteTable(
  'definiciones_costo',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    nombre: text('nombre').notNull(),
    proveedor: text('proveedor'),
    tipo: text('tipo', { enum: ['mensual', 'msi', 'anual'] }).notNull(),
    proyectoId: integer('proyecto_id').references(() => proyectos.id, { onDelete: 'restrict' }),
    // Set when the definition came from a Cotización's estimated costs. Such a monthly series
    // doesn't stop with its Proyecto; it runs until it is stopped in Finanzas.
    cotizacionId: integer('cotizacion_id').references(() => cotizaciones.id, { onDelete: 'restrict' }),
    suscripcionIa: integer('suscripcion_ia', { mode: 'boolean' }).notNull().default(false),
    diaDelMes: integer('dia_del_mes').notNull().default(1),
    periodoInicio: text('periodo_inicio').notNull(),
    periodoFin: text('periodo_fin'),
    numeroParcialidades: integer('numero_parcialidades'),
    creadoEn: creadoEn()
  },
  (t) => [
    check(
      'definiciones_costo_msi',
      sql`(${t.tipo} = 'msi') = (${t.numeroParcialidades} IS NOT NULL)`
    )
  ]
)

// Vigencia de precio: amount applies from `desde` forward; generated periods keep their amount.
export const vigenciasPrecio = sqliteTable(
  'vigencias_precio',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    definicionCostoId: integer('definicion_costo_id')
      .notNull()
      .references(() => definicionesCosto.id, { onDelete: 'cascade' }),
    desde: text('desde').notNull(),
    ...montos()
  },
  (t) => [
    uniqueIndex('vigencias_definicion_desde_unique').on(t.definicionCostoId, t.desde),
    check('vigencias_total', cuadraTotal(t))
  ]
)

export const ingresos = sqliteTable(
  'ingresos',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    categoria: text('categoria', { enum: CATEGORIAS_INGRESO }).notNull(),
    estado: text('estado', { enum: ESTADOS_INGRESO })
      .notNull()
      .default('pendiente'),
    estadoFacturacion: text('estado_facturacion', { enum: ESTADOS_FACTURACION }),
    ...montos(),
    proyectoId: integer('proyecto_id').references(() => proyectos.id, { onDelete: 'restrict' }),
    cotizacionId: integer('cotizacion_id').references(() => cotizaciones.id, {
      onDelete: 'restrict'
    }),
    contactoId: integer('contacto_id').references(() => contactos.id, { onDelete: 'restrict' }),
    // Blank for a pending Ingreso created on accepting a Cotización, until it is invoiced.
    fechaRegistro: text('fecha_registro'),
    fechaPago: text('fecha_pago'),
    periodo: text('periodo'),
    definicionId: integer('definicion_id').references(() => definicionesIngreso.id, {
      onDelete: 'restrict'
    }),
    cfdiUuid: text('cfdi_uuid'),
    // 0 is the whole CFDI; n is its nth Parcialidad, when complementos de pago split a PPD invoice.
    cfdiParcialidad: integer('cfdi_parcialidad').notNull().default(0),
    reembolsoDeId: integer('reembolso_de_id').references((): AnySQLiteColumn => ingresos.id, {
      onDelete: 'restrict'
    }),
    notas: text('notas'),
    creadoEn: creadoEn()
  },
  (t) => [
    uniqueIndex('ingresos_cfdi_unique').on(t.cfdiUuid, t.cfdiParcialidad),
    uniqueIndex('ingresos_definicion_periodo_unique').on(t.definicionId, t.periodo),
    index('ingresos_proyecto_idx').on(t.proyectoId),
    index('ingresos_contacto_idx').on(t.contactoId),
    check(
      'ingresos_estado_facturacion',
      sql`(${t.categoria} = 'factura') = (${t.estadoFacturacion} IS NOT NULL)`
    ),
    check('ingresos_total', cuadraTotal(t)),
    // Reembolso: negative exactly when linked to the original Ingreso
    check('ingresos_reembolso_negativo', sql`(${t.reembolsoDeId} IS NOT NULL) = (${t.total} < 0)`)
  ]
)

export const costos = sqliteTable(
  'costos',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    nombre: text('nombre').notNull(),
    categoria: text('categoria', { enum: CATEGORIAS_COSTO }).notNull(),
    estado: text('estado', { enum: ESTADOS_COSTO })
      .notNull()
      .default('pendiente'),
    estimado: integer('estimado', { mode: 'boolean' }).notNull().default(false),
    ...montos(),
    proveedor: text('proveedor'),
    referencia: text('referencia'),
    fecha: text('fecha').notNull(),
    fechaPago: text('fecha_pago'),
    periodo: text('periodo'),
    definicionId: integer('definicion_id').references(() => definicionesCosto.id, {
      onDelete: 'restrict'
    }),
    proyectoId: integer('proyecto_id').references(() => proyectos.id, { onDelete: 'restrict' }),
    cotizacionId: integer('cotizacion_id').references(() => cotizaciones.id, {
      onDelete: 'restrict'
    }),
    cfdiUuid: text('cfdi_uuid'),
    // Suscripción de IA on a one-off Costo; a recurring one carries it on its definición.
    suscripcionIa: integer('suscripcion_ia', { mode: 'boolean' }).notNull().default(false),
    notas: text('notas'),
    creadoEn: creadoEn()
  },
  (t) => [
    check('costos_total', cuadraTotal(t)),
    uniqueIndex('costos_cfdi_unique').on(t.cfdiUuid),
    uniqueIndex('costos_definicion_periodo_unique').on(t.definicionId, t.periodo),
    index('costos_proyecto_idx').on(t.proyectoId)
  ]
)

/**
 * Token usage imported from CC Usage, one row per day, folder, provider and model. `carpeta` is
 * the working directory as Claude Code names it (every character but letters and digits as `-`),
 * relative to the DMM OS root (`Proyectos-Aura`); one outside the root keeps its whole name,
 * starting with `-`. It is linked to a Proyecto when read, never here, so no key. A re-read
 * replaces the rows of each day and folder it covers.
 */
export const usoTokens = sqliteTable(
  'uso_tokens',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    /** `YYYY-MM-DD` */
    dia: text('dia').notNull(),
    carpeta: text('carpeta').notNull(),
    proveedor: text('proveedor').notNull(),
    modelo: text('modelo').notNull(),
    tokensEntrada: integer('tokens_entrada').notNull(),
    tokensSalida: integer('tokens_salida').notNull(),
    tokensCacheEscritura: integer('tokens_cache_escritura').notNull(),
    tokensCacheLectura: integer('tokens_cache_lectura').notNull(),
    /** What the usage would cost through the API, in USD cents; approximate. */
    costoUsd: integer('costo_usd').notNull()
  },
  (t) => [uniqueIndex('uso_tokens_unique').on(t.dia, t.carpeta, t.proveedor, t.modelo)]
)

/** Tokens RTK saved each day, imported from `rtk gain`. A re-read replaces the days it covers. */
export const ahorroTokens = sqliteTable('ahorro_tokens', {
  /** `YYYY-MM-DD` */
  dia: text('dia').primaryKey(),
  tokens: integer('tokens').notNull()
})

/**
 * What a guess changed, so rejecting its Sugerencia restores exactly that. `notas` holds the
 * Proyecto's notes before the guess and the text the guess wrote in their place.
 */
export interface DeshacerSugerencia {
  cotizacion?: { estado: (typeof cotizaciones.$inferSelect)['estado'] }
  proyecto?: { notasAntes: string | null; notasEscritas: string | null; clienteFinalEscrito?: string }
}

// Sugerencia de importación: a link the importer guessed, waiting in Logs for a one-time
// accept/reject. The record it points at is already saved; only the link is in doubt.
export const sugerenciasImportacion = sqliteTable(
  'sugerencias_importacion',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    // The record whose link is in doubt; `proyectoId` / `contactoId` name what it would link to.
    entidad: text('entidad', {
      enum: ENTIDADES_SUGERENCIA
    }).notNull(),
    entidadId: integer('entidad_id').notNull(),
    /**
     * What accepting it would do: attach the record to a Proyecto, merge two Contactos under
     * one Nombre canónico, or settle whether a Proyecto's files are Archivado or No disponible.
     */
    accion: text('accion', { enum: ACCIONES_SUGERENCIA })
      .notNull()
      .default('vincular'),
    proyectoId: integer('proyecto_id').references(() => proyectos.id, { onDelete: 'cascade' }),
    /** The Contacto a `fusionar` suggestion would merge into. */
    contactoId: integer('contacto_id').references(() => contactos.id, { onDelete: 'cascade' }),
    /** Why the importer guessed this, shown in Logs. */
    motivo: text('motivo').notNull(),
    /** What rejecting undoes; null for guesses that change nothing until accepted. */
    deshacer: text('deshacer', { mode: 'json' }).$type<DeshacerSugerencia>(),
    estado: text('estado', { enum: ['pendiente', 'aceptada', 'rechazada'] })
      .notNull()
      .default('pendiente'),
    creadoEn: creadoEn()
  },
  (t) => [
    // One pending guess of each kind per record: re-running the importer asks nothing twice.
    uniqueIndex('sugerencias_entidad_unique').on(t.entidad, t.entidadId, t.accion),
    check(
      'sugerencias_destino',
      sql`(${t.accion} = 'fusionar') = (${t.contactoId} IS NOT NULL)
          AND (${t.accion} = 'vincular') = (${t.proyectoId} IS NOT NULL)`
    )
  ]
)
