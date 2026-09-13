import { sql } from 'drizzle-orm'
import {
  check,
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
  type AnySQLiteColumn
} from 'drizzle-orm/sqlite-core'

// Money is stored as integer centavos (MXN). Periods are 'YYYY-MM'. Dates are 'YYYY-MM-DD'.
// File locations are relative paths (docs/adr/0001).

export const categorias = ['website', 'ecommerce', 'app', 'ai', 'marketing', 'other'] as const

const creadoEn = () =>
  text('creado_en')
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`)

const cuadraTotal = (t: { subtotal: AnySQLiteColumn; iva: AnySQLiteColumn; total: AnySQLiteColumn }) =>
  sql`${t.total} = ${t.subtotal} + ${t.iva}`

const montos = () => ({
  subtotal: integer('subtotal').notNull(),
  iva: integer('iva').notNull().default(0),
  total: integer('total').notNull(),
  montoOriginal: integer('monto_original'),
  monedaOriginal: text('moneda_original', { enum: ['MXN', 'USD'] })
})

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull()
})

// Estado de Contacto is derived from Cotizaciones and Proyectos; no column.
export const contactos = sqliteTable('contactos', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  nombre: text('nombre').notNull(),
  empresa: text('empresa'),
  email: text('email'),
  telefono: text('telefono'),
  direccion: text('direccion'),
  notas: text('notas'),
  creadoEn: creadoEn()
})

export const cotizaciones = sqliteTable(
  'cotizaciones',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    folio: integer('folio'),
    contactoId: integer('contacto_id')
      .notNull()
      .references(() => contactos.id, { onDelete: 'restrict' }),
    categoria: text('categoria', { enum: categorias }).notNull(),
    estado: text('estado', {
      enum: ['borrador', 'enviada', 'aceptada', 'rechazada', 'cancelada', 'expirada']
    })
      .notNull()
      .default('borrador'),
    fecha: text('fecha').notNull(),
    validezDias: integer('validez_dias').notNull().default(30),
    moneda: text('moneda', { enum: ['MXN', 'USD'] }).notNull().default('MXN'),
    items: text('items', { mode: 'json' }).notNull().default('[]'),
    stack: text('stack'),
    subtotal: integer('subtotal').notNull().default(0),
    iva: integer('iva').notNull().default(0),
    total: integer('total').notNull().default(0),
    facturacion: text('facturacion', { enum: ['unica', 'mensual', 'parcialidades'] })
      .notNull()
      .default('unica'),
    terminos: text('terminos'),
    notas: text('notas'),
    pdfRutaRelativa: text('pdf_ruta'),
    creadoEn: creadoEn()
  },
  (t) => [
    uniqueIndex('cotizaciones_folio_unique').on(t.folio),
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
    etiqueta: text('etiqueta', { enum: ['cliente', 'personal'] }).notNull().default('cliente'),
    estado: text('estado', { enum: ['en_curso', 'pausado', 'completado', 'cancelado'] })
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
    tipo: text('tipo', { enum: ['proyectos', 'hdd_externo', 'google_drive'] }).notNull(),
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
    categoria: text('categoria', { enum: ['factura', 'sin_factura'] }).notNull(),
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
    categoria: text('categoria', { enum: ['factura', 'sin_factura'] }).notNull(),
    estado: text('estado', { enum: ['pendiente', 'pagado', 'cancelado', 'incobrable'] })
      .notNull()
      .default('pendiente'),
    estadoFacturacion: text('estado_facturacion', { enum: ['por_facturar', 'facturado'] }),
    ...montos(),
    proyectoId: integer('proyecto_id').references(() => proyectos.id, { onDelete: 'restrict' }),
    cotizacionId: integer('cotizacion_id').references(() => cotizaciones.id, {
      onDelete: 'restrict'
    }),
    contactoId: integer('contacto_id').references(() => contactos.id, { onDelete: 'restrict' }),
    fechaRegistro: text('fecha_registro').notNull(),
    fechaPago: text('fecha_pago'),
    periodo: text('periodo'),
    definicionId: integer('definicion_id').references(() => definicionesIngreso.id, {
      onDelete: 'restrict'
    }),
    cfdiUuid: text('cfdi_uuid'),
    reembolsoDeId: integer('reembolso_de_id').references((): AnySQLiteColumn => ingresos.id, {
      onDelete: 'restrict'
    }),
    notas: text('notas'),
    creadoEn: creadoEn()
  },
  (t) => [
    uniqueIndex('ingresos_cfdi_unique').on(t.cfdiUuid),
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
    categoria: text('categoria', { enum: ['unico', 'mensual', 'msi', 'anual'] }).notNull(),
    estado: text('estado', { enum: ['pendiente', 'pagado', 'cancelado'] })
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

// Share of an AI subscription Costo attributed to a Proyecto; the Costo is never duplicated.
export const asignacionesCosto = sqliteTable(
  'asignaciones_costo',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    costoId: integer('costo_id')
      .notNull()
      .references(() => costos.id, { onDelete: 'cascade' }),
    proyectoId: integer('proyecto_id')
      .notNull()
      .references(() => proyectos.id, { onDelete: 'restrict' }),
    tokens: integer('tokens'),
    monto: integer('monto').notNull()
  },
  (t) => [uniqueIndex('asignaciones_costo_proyecto_unique').on(t.costoId, t.proyectoId)]
)
