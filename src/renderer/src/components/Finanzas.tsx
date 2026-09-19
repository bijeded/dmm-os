import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { NOMBRES_CATEGORIA_COSTO, NOMBRES_ESTADO_INGRESO, NOMBRES_PERIODO_FINANZAS, PERIODOS_FINANZAS, type FilaCosto, type FilaIngreso, type PeriodoFinanzas, type PuntoFinanzas, type ResumenFinanzas } from '../../../shared/dominio'
import { dia, normalizar, pesos } from '../../../shared/formato'
import { centavosDe } from '../../../shared/montos'
import { Aviso, Cifra, useAccion } from './Seccion'
import { Button } from './ui/button'
import { celdaCls, etiquetaCls, inputCls, tituloCls } from './estilos'

// Validated for the dark surface (dataviz validator): lightness band, CVD and contrast all pass.
const COLOR_INGRESOS = '#c07f0a'
const COLOR_COSTOS = '#3b7bf5'

const cardCls = 'card flex flex-col gap-4 rounded-control border border-border p-6'
const accionCls = 'cursor-pointer font-mono text-[11px] text-primary-text disabled:opacity-50'

/** `+12%` against the earlier span; nothing when there is nothing to compare against. */
function variacion(actual: number, anterior: number | null | undefined) {
  if (anterior === null || anterior === undefined || anterior === 0) return null
  const p = Math.round(((actual - anterior) / Math.abs(anterior)) * 100)
  return `${p >= 0 ? '+' : ''}${p}%`
}

const origenIngreso: Record<FilaIngreso['origen'], string> = { cfdi: 'CFDI', periodo: 'Mensual', cotizacion: 'Cotización', manual: 'Manual' }
const origenCosto: Record<FilaCosto['origen'], string> = { cfdi: 'CFDI', recurrente: 'Recurrente', manual: 'Manual' }

/** Finanzas: the shape of money over a period, against the same span a period earlier. */
export function Finanzas() {
  const navigate = useNavigate()
  const [periodo, setPeriodo] = useState<PeriodoFinanzas>('mes')
  const [resumen, setResumen] = useState<ResumenFinanzas | null>(null)
  const [busqueda, setBusqueda] = useState('')
  const [vencidas, setVencidas] = useState(false)
  const [reembolso, setReembolso] = useState<{ id: number; monto: string; moneda: 'MXN' | 'USD' } | null>(null)
  const { error, ocupado, correr } = useAccion()

  const cargar = (p = periodo) => correr(async () => setResumen(await window.dmm.finanzas.resumen(p)))
  useEffect(() => {
    cargar(periodo)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload per period
  }, [periodo])

  /** Runs an action, then reads Finanzas again: one change moves KPIs, tables and chart together. */
  const hacer = (fn: () => Promise<unknown>) =>
    correr(async () => {
      await fn()
      setResumen(await window.dmm.finanzas.resumen(periodo))
    })

  const consulta = normalizar(busqueda.trim())
  const coincide = (...textos: (string | null)[]) => !consulta || textos.some((texto) => texto && normalizar(texto).includes(consulta))
  const ingresos = useMemo(() => (resumen?.ingresos ?? []).filter((i) => coincide(i.contacto, i.proyecto, i.notas)), [resumen, consulta]) // eslint-disable-line react-hooks/exhaustive-deps
  const costos = useMemo(() => (resumen?.costos ?? []).filter((c) => coincide(c.nombre, c.proveedor, c.proyecto)), [resumen, consulta]) // eslint-disable-line react-hooks/exhaustive-deps
  const cobrado = (resumen?.cobrado ?? []).filter((i) => coincide(i.contacto, i.proyecto, i.notas))
  const cobranza = (resumen?.cobranza ?? []).filter((i) => i.vencida === vencidas && coincide(i.contacto, i.proyecto, i.notas))
  const costosPendientes = (resumen?.costosPendientes ?? []).filter((c) => coincide(c.nombre, c.proveedor, c.proyecto))

  const accionesIngreso = (i: FilaIngreso) => (
    <span className="flex flex-wrap gap-3">
      {i.acciones.includes('pagar') && (
        <button type="button" disabled={ocupado} className={accionCls} onClick={() => hacer(() => window.dmm.finanzas.pagarIngreso(i.id))}>
          Pagado
        </button>
      )}
      {i.acciones.includes('cancelar') && (
        <button type="button" disabled={ocupado} className={accionCls} onClick={() => hacer(() => window.dmm.finanzas.cancelarIngreso(i.id))}>
          Cancelar
        </button>
      )}
      {i.acciones.includes('reembolsar') && (
        <button type="button" disabled={ocupado} className={accionCls} onClick={() => setReembolso({ id: i.id, monto: (i.reembolsable / 100).toFixed(2), moneda: i.moneda })}>
          Reembolsar
        </button>
      )}
      {i.acciones.includes('borrar') && (
        <button type="button" disabled={ocupado} className={accionCls} onClick={() => hacer(() => window.dmm.finanzas.borrarIngreso(i.id))}>
          Borrar
        </button>
      )}
    </span>
  )

  const accionesCosto = (c: FilaCosto) => (
    <span className="flex flex-wrap gap-3">
      {c.acciones.includes('pagar') && (
        <button type="button" disabled={ocupado} className={accionCls} onClick={() => hacer(() => window.dmm.finanzas.pagarCosto(c.id))}>
          Pagado
        </button>
      )}
      {c.acciones.includes('cancelar') && (
        <button type="button" disabled={ocupado} className={accionCls} onClick={() => hacer(() => window.dmm.finanzas.cancelarCosto(c.id))}>
          Cancelar
        </button>
      )}
      {c.acciones.includes('detener') && (
        <button type="button" disabled={ocupado} className={accionCls} onClick={() => hacer(() => window.dmm.finanzas.detenerCosto(c.id))}>
          Detener serie
        </button>
      )}
      {c.acciones.includes('borrar') && (
        <button type="button" disabled={ocupado} className={accionCls} onClick={() => hacer(() => window.dmm.finanzas.borrarCosto(c.id))}>
          Borrar
        </button>
      )}
    </span>
  )

  const reembolsar = () =>
    hacer(async () => {
      await window.dmm.finanzas.reembolsar(reembolso!.id, centavosDe(reembolso!.monto))
      setReembolso(null)
    })

  const actual = resumen?.actual
  const anterior = resumen?.anterior
  const anio = resumen?.rango.hasta.slice(0, 4)
  const vsAnterior = resumen?.rangoAnterior ? `vs ${resumen.rangoAnterior.desde.slice(0, 4)}` : ''

  return (
    <>
      <div className="acts flex flex-wrap items-center justify-between gap-3">
        <h1 className={tituloCls}>Finanzas</h1>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => navigate('/finanzas/costos/nuevo')}>
            Nuevo costo
          </Button>
          <Button onClick={() => navigate('/finanzas/ingresos/nuevo')}>Nuevo ingreso</Button>
        </div>
      </div>

      <div className="acts flex flex-wrap items-center gap-2">
        <div role="group" aria-label="Periodo" className="flex flex-wrap gap-1">
          {PERIODOS_FINANZAS.map((p) => (
            <button
              key={p}
              type="button"
              aria-pressed={periodo === p}
              onClick={() => setPeriodo(p)}
              className={`h-9 cursor-pointer rounded-control border px-3 text-[13px] ${periodo === p ? 'border-primary bg-primary text-on-primary' : 'border-border-strong text-on-surface'}`}
            >
              {NOMBRES_PERIODO_FINANZAS[p]}
            </button>
          ))}
        </div>
        <input
          type="search"
          placeholder="Buscar…"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          className="srch h-9 w-56 rounded-control border border-border-strong bg-surface-sunken px-3 text-[13px] text-on-surface"
        />
        <button type="button" className={`${accionCls} ml-auto`} onClick={() => correr(() => window.dmm.rutas.abrir('facturas'))}>
          Facturas/
        </button>
      </div>
      <Aviso error={error} />

      {resumen && resumen.sinDatos.length > 0 && (
        <p role="note" className="m-0 rounded-control border border-border-strong p-3 text-[13px] text-on-surface">
          <strong>Datos de costos incompletos.</strong> Sin costos registrados para {resumen.sinDatos.join(', ')}: la utilidad de esos años se muestra como Sin datos, no
          se estima.
        </p>
      )}

      {actual && (
        <ul aria-label="Resumen" className="g-stats m-0 grid list-none grid-cols-3 gap-3 p-0">
          <Cifra
            label={`Ingresos · ${NOMBRES_PERIODO_FINANZAS[periodo]}`}
            valor={pesos(actual.ingresos)}
            detalle={[variacion(actual.ingresos, anterior?.ingresos) && `${variacion(actual.ingresos, anterior?.ingresos)} ${vsAnterior}`, `factura ${pesos(actual.ingresosFactura)}`, `sin factura ${pesos(actual.ingresosSinFactura)}`, `IVA ${pesos(actual.ivaIngresos)}`]}
          />
          <Cifra
            label={`Costos · ${NOMBRES_PERIODO_FINANZAS[periodo]}`}
            valor={pesos(actual.costos)}
            detalle={[variacion(actual.costos, anterior?.costos) && `${variacion(actual.costos, anterior?.costos)} ${vsAnterior}`, `IVA ${pesos(actual.ivaCostos)}`]}
          />
          <Cifra
            label={`Utilidad · ${NOMBRES_PERIODO_FINANZAS[periodo]}`}
            valor={actual.utilidad === null ? 'Sin datos' : pesos(actual.utilidad)}
            detalle={[
              anterior === null || anterior === undefined
                ? null
                : anterior.utilidad === null
                  ? `${vsAnterior}: sin datos de costos`
                  : actual.utilidad === null
                    ? null
                    : `${variacion(actual.utilidad, anterior.utilidad) ?? ''} ${vsAnterior} (${pesos(anterior.utilidad)})`
            ]}
          />
        </ul>
      )}

      {resumen && (
        <section className={cardCls} aria-labelledby="grafica">
          <h2 id="grafica" className={`m-0 ${etiquetaCls}`}>
            Ingresos vs costos · {dia(resumen.rango.desde)} – {dia(resumen.rango.hasta)}
          </h2>
          <Grafica serie={resumen.serie} actual={anio ?? ''} anterior={resumen.rangoAnterior ? resumen.rangoAnterior.desde.slice(0, 4) : null} />
          {resumen.rangoAnterior && <p className="m-0 text-[12px] text-on-surface-muted">Comparado con el mismo periodo, a la misma fecha, {periodo === 'cinco_anios' ? 'de los cinco años anteriores' : 'del año anterior'}.</p>}
        </section>
      )}

      <div className="g-split grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)] items-start gap-[18px]">
        <div className="flex flex-col gap-[18px]">
          <section className={cardCls} aria-labelledby="cobrado">
            <h2 id="cobrado" className={`m-0 ${etiquetaCls}`}>
              Cobrado
            </h2>
            <TablaIngresos filas={cobrado} acciones={accionesIngreso} vacio="Nada cobrado en el periodo." />
          </section>

          <section className={cardCls} aria-labelledby="por-cobrar">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 id="por-cobrar" className={`m-0 ${etiquetaCls}`}>
                Por cobrar
              </h2>
              <div role="group" aria-label="Por cobrar" className="flex gap-1">
                {([false, true] as const).map((vencida) => (
                  <button
                    key={String(vencida)}
                    type="button"
                    aria-pressed={vencidas === vencida}
                    onClick={() => setVencidas(vencida)}
                    className={`cursor-pointer rounded-control border px-2 py-1 text-[12px] ${vencidas === vencida ? 'border-primary text-primary-text' : 'border-border-strong text-on-surface-muted'}`}
                  >
                    {vencida ? `Vencida (${(resumen?.cobranza ?? []).filter((i) => i.vencida).length})` : 'Actual'}
                  </button>
                ))}
              </div>
            </div>
            <TablaIngresos filas={cobranza} acciones={accionesIngreso} vacio={vencidas ? 'Nada vencido.' : 'Nada por cobrar.'} />
            {resumen && (
              <label className="flex items-center gap-2 text-[12px] text-on-surface-muted">
                Vencida después de
                <input
                  type="number"
                  min={1}
                  aria-label="Días para vencer"
                  defaultValue={resumen.diasVencida}
                  key={resumen.diasVencida}
                  onBlur={(e) => Number(e.target.value) !== resumen.diasVencida && hacer(() => window.dmm.finanzas.configurarVencida(Number(e.target.value)))}
                  className={inputCls}
                />
                días sin pagar (solo facturas emitidas)
              </label>
            )}
          </section>

          <section className={cardCls} aria-labelledby="costos-pendientes">
            <h2 id="costos-pendientes" className={`m-0 ${etiquetaCls}`}>
              Costos pendientes
            </h2>
            <TablaCostos filas={costosPendientes} acciones={accionesCosto} vacio="Nada pendiente de pago." />
          </section>
        </div>

        <section className={cardCls} aria-labelledby="proximos">
          <h2 id="proximos" className={`m-0 ${etiquetaCls}`}>
            Próximos pagos
          </h2>
          <ul className="m-0 flex list-none flex-col gap-2 p-0 text-[13px]">
            {(resumen?.proximosPagos ?? []).map((p, k) => (
              <li key={k} className="flex items-baseline justify-between gap-3">
                <span className="w-16 shrink-0 font-mono text-[11px] text-on-surface-muted">{dia(p.fecha)}</span>
                <span className="flex-1">
                  {p.nombre}
                  <span className="text-on-surface-muted"> · {NOMBRES_CATEGORIA_COSTO[p.categoria]}</span>
                </span>
                <span className="font-mono text-[12px]">{pesos(p.total)}</span>
              </li>
            ))}
          </ul>
          {resumen && resumen.proximosPagos.length === 0 && <p className="m-0 text-[13px] text-on-surface-muted">Nada en los próximos 60 días.</p>}
        </section>
      </div>

      <section className={cardCls} aria-labelledby="ingresos-periodo">
        <h2 id="ingresos-periodo" className={`m-0 ${etiquetaCls}`}>
          Ingresos del periodo
        </h2>
        {reembolso && (
          <div className="flex flex-wrap items-center gap-2 text-[13px]">
            Reembolso del ingreso {reembolso.id}, hoy, en {reembolso.moneda}:
            <input
              inputMode="decimal"
              aria-label="Monto del reembolso"
              placeholder="0.00"
              value={reembolso.monto}
              onChange={(e) => setReembolso({ ...reembolso, monto: e.target.value })}
              className={inputCls}
            />
            <Button disabled={ocupado} onClick={reembolsar}>
              Registrar reembolso
            </Button>
            <Button variant="ghost" onClick={() => setReembolso(null)}>
              Cancelar
            </Button>
          </div>
        )}
        <TablaIngresos filas={ingresos} acciones={accionesIngreso} vacio="Ningún ingreso coincide." />
      </section>

      <section className={cardCls} aria-labelledby="costos-periodo">
        <h2 id="costos-periodo" className={`m-0 ${etiquetaCls}`}>
          Costos del periodo
        </h2>
        <TablaCostos filas={costos} acciones={accionesCosto} vacio="Ningún costo coincide." />
      </section>
    </>
  )
}

function TablaIngresos({ filas, acciones, vacio }: { filas: FilaIngreso[]; acciones: (i: FilaIngreso) => React.ReactNode; vacio: string }) {
  if (filas.length === 0) return <p className="m-0 text-[13px] text-on-surface-muted">{vacio}</p>
  return (
    <table className="tbl w-full border-collapse text-[13px]">
      <thead>
        <tr className={etiquetaCls}>
          <th className={celdaCls}>Fecha</th>
          <th className={celdaCls}>Contacto</th>
          <th className={celdaCls}>Origen</th>
          <th className={celdaCls}>Estado</th>
          <th className={`${celdaCls} text-right`}>Subtotal</th>
          <th className={celdaCls} />
        </tr>
      </thead>
      <tbody>
        {filas.map((i) => (
          <tr key={i.id}>
            <td data-label="Fecha" className={`${celdaCls} font-mono text-[12px]`}>
              {i.fecha ? dia(i.fecha) : 'Por facturar'}
            </td>
            <td data-label="Contacto" className={celdaCls}>
              {i.contacto ?? '—'}
              {i.proyecto && <span className="text-on-surface-muted"> · {i.proyecto}</span>}
            </td>
            <td data-label="Origen" className={celdaCls}>
              {i.reembolsoDeId !== null ? 'Reembolso' : origenIngreso[i.origen]}
              <span className="text-on-surface-muted"> · {i.categoria === 'factura' ? 'Factura' : 'Sin factura'}</span>
            </td>
            <td data-label="Estado" className={celdaCls}>
              {NOMBRES_ESTADO_INGRESO[i.estado]}
              {i.vencida && <span className="ml-2 rounded-control border border-error px-1.5 py-0.5 text-[11px] text-error-text">Vencida</span>}
            </td>
            <td data-label="Subtotal" className={`${celdaCls} text-right font-mono text-[12px]`}>
              {pesos(i.subtotal)}
            </td>
            <td className={celdaCls}>{acciones(i)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function TablaCostos({ filas, acciones, vacio }: { filas: FilaCosto[]; acciones: (c: FilaCosto) => React.ReactNode; vacio: string }) {
  if (filas.length === 0) return <p className="m-0 text-[13px] text-on-surface-muted">{vacio}</p>
  return (
    <table className="tbl w-full border-collapse text-[13px]">
      <thead>
        <tr className={etiquetaCls}>
          <th className={celdaCls}>Fecha</th>
          <th className={celdaCls}>Costo</th>
          <th className={celdaCls}>Tipo</th>
          <th className={celdaCls}>Estado</th>
          <th className={`${celdaCls} text-right`}>Subtotal</th>
          <th className={celdaCls} />
        </tr>
      </thead>
      <tbody>
        {filas.map((c) => (
          <tr key={c.id}>
            <td data-label="Fecha" className={`${celdaCls} font-mono text-[12px]`}>
              {dia(c.fecha)}
            </td>
            <td data-label="Costo" className={celdaCls}>
              {c.nombre}
              {c.proveedor && <span className="text-on-surface-muted"> · {c.proveedor}</span>}
            </td>
            <td data-label="Tipo" className={celdaCls}>
              {NOMBRES_CATEGORIA_COSTO[c.categoria]}
              <span className="text-on-surface-muted"> · {c.estimado ? 'Estimado' : origenCosto[c.origen]}</span>
            </td>
            <td data-label="Estado" className={`${celdaCls} capitalize`}>
              {c.estado}
            </td>
            <td data-label="Subtotal" className={`${celdaCls} text-right font-mono text-[12px]`}>
              {pesos(c.subtotal)}
            </td>
            <td className={celdaCls}>{acciones(c)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

const ANCHO = 640
const ALTO = 220
const MARGEN = { izq: 8, der: 8, arr: 12, aba: 24 }

/** Income vs costs per bucket; the earlier span dashed in the same hue. Hover shows every value of a bucket. */
function Grafica({ serie, actual, anterior }: { serie: PuntoFinanzas[]; actual: string; anterior: string | null }) {
  const [hover, setHover] = useState<number | null>(null)
  const valores = serie.flatMap((p) => [p.ingresos, p.costos, p.ingresosAnterior ?? 0, p.costosAnterior ?? 0])
  const max = Math.max(1, ...valores)
  const min = Math.min(0, ...valores)
  const ancho = ANCHO - MARGEN.izq - MARGEN.der
  const alto = ALTO - MARGEN.arr - MARGEN.aba
  const x = (k: number) => MARGEN.izq + (serie.length === 1 ? ancho / 2 : (k / (serie.length - 1)) * ancho)
  const y = (v: number) => MARGEN.arr + ((max - v) / (max - min)) * alto
  const linea = (f: (p: PuntoFinanzas) => number | null) =>
    serie.flatMap((p, k) => (f(p) === null ? [] : [`${k === 0 ? 'M' : 'L'}${x(k).toFixed(1)},${y(f(p)!).toFixed(1)}`])).join(' ')
  const lineas = [
    { nombre: `Ingresos ${actual}`, color: COLOR_INGRESOS, f: (p: PuntoFinanzas) => p.ingresos, guion: false },
    { nombre: `Costos ${actual}`, color: COLOR_COSTOS, f: (p: PuntoFinanzas) => p.costos, guion: false },
    ...(anterior
      ? [
          { nombre: `Ingresos ${anterior}`, color: COLOR_INGRESOS, f: (p: PuntoFinanzas) => p.ingresosAnterior, guion: true },
          { nombre: `Costos ${anterior}`, color: COLOR_COSTOS, f: (p: PuntoFinanzas) => p.costosAnterior, guion: true }
        ]
      : [])
  ]
  const paso = serie.length > 1 ? ancho / (serie.length - 1) : ancho

  return (
    <div className="relative">
      <ul aria-label="Leyenda" className="m-0 mb-2 flex list-none flex-wrap gap-4 p-0 text-[12px] text-on-surface-muted">
        {lineas.map((l) => (
          <li key={l.nombre} className="flex items-center gap-2">
            <svg width="18" height="4" aria-hidden="true">
              <line x1="0" y1="2" x2="18" y2="2" stroke={l.color} strokeWidth="2" strokeDasharray={l.guion ? '4 3' : undefined} />
            </svg>
            {l.nombre}
          </li>
        ))}
      </ul>
      <svg viewBox={`0 0 ${ANCHO} ${ALTO}`} className="w-full" role="img" aria-label="Ingresos contra costos por periodo" onMouseLeave={() => setHover(null)}>
        <line x1={MARGEN.izq} x2={ANCHO - MARGEN.der} y1={y(0)} y2={y(0)} stroke="currentColor" className="text-border-strong" />
        {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={MARGEN.arr} y2={ALTO - MARGEN.aba} stroke="currentColor" className="text-border-strong" />}
        {lineas.map((l) => (
          <path key={l.nombre} d={linea(l.f)} fill="none" stroke={l.color} strokeWidth="2" strokeDasharray={l.guion ? '5 4' : undefined} strokeLinejoin="round" />
        ))}
        {hover !== null &&
          lineas
            .filter((l) => !l.guion)
            .map((l) => <circle key={l.nombre} cx={x(hover)} cy={y(l.f(serie[hover])!)} r="4" fill={l.color} stroke="var(--color-surface-raised)" strokeWidth="2" />)}
        {serie.map((p, k) => (
          <g key={p.etiqueta}>
            <text x={x(k)} y={ALTO - 6} textAnchor="middle" className="fill-on-surface-muted font-mono text-[10px]">
              {p.etiqueta}
            </text>
            <rect x={x(k) - paso / 2} y={0} width={paso} height={ALTO} fill="transparent" onMouseEnter={() => setHover(k)} />
          </g>
        ))}
      </svg>
      {hover !== null && (
        <div
          role="tooltip"
          className="pointer-events-none absolute top-8 rounded-control border border-border-strong bg-surface-raised p-2 text-[12px] text-on-surface shadow"
          style={{ left: `${(x(hover) / ANCHO) * 100}%`, transform: hover > serie.length / 2 ? 'translateX(-105%)' : 'translateX(5%)' }}
        >
          <div className="mb-1 font-mono text-[10px] text-on-surface-muted uppercase">{serie[hover].etiqueta}</div>
          {lineas.map((l) => (
            <div key={l.nombre} className="flex justify-between gap-4">
              <span>{l.nombre}</span>
              <span className="font-mono">{pesos(l.f(serie[hover]) ?? 0)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
