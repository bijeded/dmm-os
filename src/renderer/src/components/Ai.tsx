import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import {
  ESTADOS_PROYECTO,
  NOMBRES_ESTADO_PROYECTO,
  NOMBRES_ORIGEN_SUSCRIPCION,
  NOMBRES_TIPO_AGENTE_SKILL,
  NOMBRES_PERIODO_FINANZAS,
  PERIODOS_AI,
  type AgenteOSkill,
  type AsignacionCosto,
  type CriterioAsignacion,
  type EstadoProyecto,
  type EtiquetaProyecto,
  type FilaProyectoAi,
  type FilaSuscripcion,
  type PeriodoAi,
  type ResumenAi,
  type UsoModelo,
  type UsoTokens
} from '../../../shared/dominio'
import { dia, monto, normalizar, pesos } from '../../../shared/formato'
import { NOMBRES_CARPETA } from './Proyectos'
import { Aviso, Cifra, fecha, Seccion, useAccion } from './Seccion'
import { Button } from './ui/button'
import { campoCls, celdaCls, etiquetaCls, tituloCls } from './estilos'

/** A token count as the cards show it: `15.7 M`, `840.0 K`, `312`. */
const tokens = (n: number) => {
  const uno = (x: number) => x.toLocaleString('es-MX', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
  return n >= 1e6 ? `${uno(n / 1e6)} M` : n >= 1e3 ? `${uno(n / 1e3)} K` : String(n)
}

const porcentaje = (x: number) => x.toLocaleString('es-MX', { style: 'percent', maximumFractionDigits: 1 })

/**
 * AI: token usage imported from CC Usage and RTK, for Este mes or Todo el tiempo. Usage is read
 * only when asked (Leer uso); a source that could not be read is named and the rest still shows.
 */
export function Ai() {
  const api = window.dmm.ai
  const [periodo, setPeriodo] = useState<PeriodoAi>('mes')
  const [resumen, setResumen] = useState<ResumenAi | null>(null)
  const { error, ocupado, correr } = useAccion()

  useEffect(() => {
    correr(async () => setResumen(await api.resumen(periodo)))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload per period
  }, [periodo])

  const leerUso = () =>
    correr(async () => {
      await api.leerUso()
      setResumen(await api.resumen(periodo))
    })

  return (
    <>
      <div className="acts flex flex-wrap items-center justify-between gap-3">
        <h1 className={tituloCls}>AI</h1>
        <div className="flex items-center gap-3">
          {resumen && (
            <span className="font-mono text-[12px] text-on-surface-muted">
              Último escaneo: {resumen.ultimoEscaneo ? fecha(resumen.ultimoEscaneo) : 'Nunca'}
            </span>
          )}
          <Button disabled={ocupado} onClick={leerUso}>
            Leer uso
          </Button>
        </div>
      </div>

      <div className="acts flex flex-wrap items-center gap-2">
        <div role="group" aria-label="Periodo" className="flex flex-wrap gap-1">
          {PERIODOS_AI.map((p) => (
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
        <span className="text-[12px] text-on-surface-muted">Fuentes: CC Usage (costos API) · RTK (ahorro de tokens)</span>
      </div>
      <Aviso error={error} />

      {resumen && resumen.avisos.length > 0 && (
        <ul aria-label="Avisos de lectura" className="m-0 flex list-none flex-col gap-1 rounded-control border border-border-strong p-3 text-[13px] text-on-surface">
          {resumen.avisos.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
      )}

      {resumen && (
        <ul aria-label="Resumen" className="g-stats m-0 grid list-none grid-cols-3 gap-3 p-0">
          <Cifra label="Tokens totales" valor={tokens(resumen.tokens)} detalle={[]} />
          <Cifra label="Tokens ahorrados" valor={tokens(resumen.tokensAhorrados)} detalle={[resumen.ahorro !== null && `${porcentaje(resumen.ahorro)} vía RTK`]} />
          <Cifra
            label="Costo API aprox."
            valor={resumen.costoApiMxn === null ? monto(resumen.costoApiUsd, 'USD') : pesos(resumen.costoApiMxn)}
            detalle={[resumen.costoApiMxn === null ? 'sin tipo de cambio registrado' : `≈ ${monto(resumen.costoApiUsd, 'USD')}`]}
          />
          <Cifra label="Suscripciones" valor={pesos(resumen.suscripcionesTotal)} detalle={[...new Set(resumen.suscripciones.map((s) => s.plan))]} />
          <Cifra label="Ingreso proyectos AI" valor={pesos(resumen.ingresoProyectos)} detalle={['cotizado']} />
          <Cifra label="Ingreso AI" valor={pesos(resumen.ingresoAi)} detalle={['cobrado']} />
        </ul>
      )}

      {resumen && (
        <Seccion id="ai-modelos" titulo="Uso de tokens por modelo">
          {resumen.modelos.length === 0 ? (
            <p className="m-0 text-[13px] text-on-surface-muted">Sin uso de tokens leído.</p>
          ) : (
            <GraficaModelos modelos={resumen.modelos} />
          )}
        </Seccion>
      )}

      {resumen && (
        <Seccion id="ai-suscripciones" titulo="Suscripciones">
          <p className="m-0 text-[12px] text-on-surface-muted">Vista filtrada de Costos · proveedor AI</p>
          <TablaSuscripciones filas={resumen.suscripciones} />
          <p className="m-0 text-[12px] text-on-surface-muted">Mismo registro que Finanzas → Costos.</p>
        </Seccion>
      )}

      {resumen && (
        <Seccion id="ai-asignacion" titulo={`Asignación de costo · ${new Date(`${resumen.asignacion.mes}-01T12:00:00`).toLocaleDateString('es-MX', { month: 'short' })}`}>
          <TablaAsignacion asignacion={resumen.asignacion} />
        </Seccion>
      )}

      {resumen && (
        <Seccion id="ai-proyectos" titulo="AI Proyectos">
          <ProyectosAi filas={resumen.proyectos} sinProyecto={resumen.sinProyecto} />
        </Seccion>
      )}

      <AgentesYSkills />
    </>
  )
}

const ANCHO = 640
const ALTO = 240
const MARGEN = { izq: 48, der: 8, arr: 12, aba: 44 }
const COLORES_PROVEEDOR = ['var(--color-chart-1)', 'var(--color-chart-2)', 'var(--color-chart-3)', 'var(--color-chart-4)', 'var(--color-chart-5)']

/**
 * Tokens per model family, one bar each, grouped by provider under its name. Every model ever
 * used has a bar, empty when unused in the period. Hover shows its tokens and API cost.
 */
function GraficaModelos({ modelos }: { modelos: UsoModelo[] }) {
  const [hover, setHover] = useState<number | null>(null)
  const proveedores = [...new Set(modelos.map((m) => m.proveedor))]
  const max = Math.max(1, ...modelos.map((m) => m.tokens))
  const ancho = ANCHO - MARGEN.izq - MARGEN.der
  const alto = ALTO - MARGEN.arr - MARGEN.aba
  // One slot per bar, and half a slot between providers.
  const paso = ancho / (modelos.length + (proveedores.length - 1) / 2)
  const x = (k: number) => MARGEN.izq + (k + proveedores.indexOf(modelos[k].proveedor) / 2 + 0.5) * paso
  const y = (v: number) => MARGEN.arr + (1 - v / max) * alto
  const base = y(0)
  const barra = Math.min(paso * 0.6, 64)
  const color = (proveedor: string) => COLORES_PROVEEDOR[proveedores.indexOf(proveedor) % COLORES_PROVEEDOR.length]
  const centro = (proveedor: string) => {
    const ks = modelos.flatMap((m, k) => (m.proveedor === proveedor ? [x(k)] : []))
    return (ks[0] + ks[ks.length - 1]) / 2
  }

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${ANCHO} ${ALTO}`} className="w-full" role="img" aria-label="Tokens por modelo" onMouseLeave={() => setHover(null)}>
        {[0.25, 0.5, 0.75, 1].map((f) => (
          <g key={f}>
            <line x1={MARGEN.izq} x2={ANCHO - MARGEN.der} y1={y(max * f)} y2={y(max * f)} stroke="currentColor" className="text-border" />
            <text x={MARGEN.izq - 6} y={y(max * f) + 3} textAnchor="end" className="fill-on-surface-muted font-mono text-[10px]">
              {tokens(Math.round(max * f))}
            </text>
          </g>
        ))}
        {modelos.map((m, k) => (
          <g key={`${m.proveedor}·${m.familia}`}>
            <rect x={x(k) - barra / 2} y={y(m.tokens)} width={barra} height={base - y(m.tokens)} rx="3" fill={color(m.proveedor)} opacity={hover === null || hover === k ? 1 : 0.6} />
            <text x={x(k)} y={base + 14} textAnchor="middle" className="fill-on-surface-muted font-mono text-[10px]">
              {m.familia}
            </text>
            <rect
              aria-label={`${m.proveedor} · ${m.familia}`}
              x={x(k) - paso / 2}
              y={0}
              width={paso}
              height={base}
              fill="transparent"
              onMouseEnter={() => setHover(k)}
            />
          </g>
        ))}
        <line x1={MARGEN.izq} x2={ANCHO - MARGEN.der} y1={base} y2={base} stroke="currentColor" className="text-border-strong" />
        {proveedores.map((p) => (
          <text key={p} x={centro(p)} y={ALTO - 8} textAnchor="middle" className="fill-on-surface font-mono text-[11px]">
            {p}
          </text>
        ))}
      </svg>
      {hover !== null && (
        <div
          role="tooltip"
          className="pointer-events-none absolute top-2 flex flex-col gap-0.5 rounded-control border border-border-strong bg-surface-raised p-2 font-mono text-[11px] text-on-surface shadow"
          style={{ left: `${(x(hover) / ANCHO) * 100}%`, transform: hover > modelos.length / 2 ? 'translateX(-105%)' : 'translateX(5%)' }}
        >
          <b>
            {modelos[hover].proveedor} · {modelos[hover].familia}
          </b>
          <span>{tokens(modelos[hover].tokens)} tokens</span>
          <span className="text-on-surface-muted">≈ {monto(modelos[hover].costoUsd, 'USD')} API</span>
        </div>
      )}
    </div>
  )
}

/** The agents and skills in `AI/`, read-only: where each is used, and its file. */
function AgentesYSkills() {
  const api = window.dmm.ai
  const [items, setItems] = useState<AgenteOSkill[] | null>(null)
  const { error, ocupado, correr } = useAccion()

  useEffect(() => {
    correr(async () => setItems(await api.agentesYSkills()))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- read once
  }, [])

  return (
    <Seccion id="ai-agentes" titulo="Agentes y Skills">
      <p className="m-0 text-[12px] text-on-surface-muted">Solo lectura</p>
      <Aviso error={error} />
      {items && items.length === 0 && <p className="m-0 text-[13px] text-on-surface-muted">Ningún agente ni skill en AI/.</p>}
      {items && items.length > 0 && (
        <ul aria-label="Agentes y Skills" className="m-0 flex list-none flex-col gap-2 p-0">
          {items.map((a) => (
            <li key={a.archivo} className="flex flex-wrap items-center gap-3 rounded-control border border-border p-3">
              <span className="rounded-control border border-border-strong px-2 py-0.5 font-mono text-[11px] text-on-surface-muted">{NOMBRES_TIPO_AGENTE_SKILL[a.tipo]}</span>
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="font-mono text-[13px] text-on-surface">{a.nombre}</span>
                {a.descripcion && <span className="line-clamp-2 text-[12px] text-on-surface-muted">{a.descripcion}</span>}
                <span className="text-[12px] text-on-surface-muted">Usado en: {a.usadoEn.length > 0 ? a.usadoEn.join(', ') : 'en prueba'}</span>
              </div>
              <Button variant="secondary" disabled={ocupado} onClick={() => correr(() => api.abrir(a.archivo))}>
                Ver archivo
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Seccion>
  )
}

const USOS_TOKENS = { con_uso: 'Con uso', sin_uso: 'Sin uso' } as const

/** API cost in pesos, as the Costo API aprox. card shows it; in USD while the app has no tipo de cambio. */
const costoApi = (u: UsoTokens) => (u.costoApiMxn === null ? monto(u.costoUsd, 'USD') : pesos(u.costoApiMxn))

/**
 * The AI Proyectos in the order main gives (by name), with the period's usage in their folders,
 * filterable. Usage in no Proyecto's folder closes the list as Sin proyecto while nothing is
 * filtered. A row opens its Proyecto; Abrir reveals its folder.
 */
function ProyectosAi({ filas, sinProyecto }: Pick<ResumenAi, 'sinProyecto'> & { filas: FilaProyectoAi[] }) {
  const navigate = useNavigate()
  const [busqueda, setBusqueda] = useState('')
  const [cliente, setCliente] = useState('')
  const [anio, setAnio] = useState('')
  const [etiqueta, setEtiqueta] = useState<EtiquetaProyecto | ''>('')
  const [uso, setUso] = useState<keyof typeof USOS_TOKENS | ''>('')
  const [estado, setEstado] = useState<EstadoProyecto | ''>('')
  const { error, correr } = useAccion()

  const clientes = useMemo(
    () => [...new Map(filas.filter((p) => p.contactoId !== null).map((p) => [p.contactoId!, p.contacto!])).entries()].sort((a, b) => a[1].localeCompare(b[1], 'es')),
    [filas]
  )
  const anios = useMemo(() => [...new Set(filas.flatMap((p) => (p.fechaInicio ? [p.fechaInicio.slice(0, 4)] : [])))].sort().reverse(), [filas])
  const q = normalizar(busqueda.trim())
  const filtrando = Boolean(q || cliente || anio || etiqueta || uso || estado)
  const filtrados = filas.filter(
    (p) =>
      (!cliente || (cliente === 'personal' ? p.etiqueta === 'personal' : String(p.contactoId) === cliente)) &&
      (!anio || p.fechaInicio?.startsWith(anio)) &&
      (!etiqueta || p.etiqueta === etiqueta) &&
      (!uso || (uso === 'con_uso') === p.tokens > 0) &&
      (!estado || p.estado === estado) &&
      (!q || [p.referencia, p.nombre, p.contacto, p.clienteFinal].some((v) => v && normalizar(v).includes(q)))
  )

  if (filas.length === 0) return <p className="m-0 text-[13px] text-on-surface-muted">Ningún proyecto en la categoría AI.</p>
  return (
    <>
      <div className="acts flex flex-wrap items-center gap-2">
        <input
          type="search"
          placeholder="Buscar ref., proyecto AI…"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          className="srch h-9 w-56 rounded-control border border-border-strong bg-surface-sunken px-3 text-[13px] text-on-surface"
        />
        <select aria-label="Cliente" value={cliente} onChange={(e) => setCliente(e.target.value)} className={campoCls}>
          <option value="">Cliente: Todos</option>
          <option value="personal">Personal</option>
          {clientes.map(([id, nombre]) => (
            <option key={id} value={id}>
              {nombre}
            </option>
          ))}
        </select>
        <select aria-label="Año" value={anio} onChange={(e) => setAnio(e.target.value)} className={campoCls}>
          <option value="">Año: Todos</option>
          {anios.map((a) => (
            <option key={a}>{a}</option>
          ))}
        </select>
        {/* Every row is categoría AI; what tells them apart is client or personal work. */}
        <select aria-label="Categoría" value={etiqueta} onChange={(e) => setEtiqueta(e.target.value as EtiquetaProyecto | '')} className={campoCls}>
          <option value="">Categoría: Todas</option>
          <option value="cliente">Cliente</option>
          <option value="personal">Personal</option>
        </select>
        <select aria-label="Uso tokens" value={uso} onChange={(e) => setUso(e.target.value as keyof typeof USOS_TOKENS | '')} className={campoCls}>
          <option value="">Uso tokens: Todos</option>
          {Object.entries(USOS_TOKENS).map(([k, nombre]) => (
            <option key={k} value={k}>
              {nombre}
            </option>
          ))}
        </select>
        <select aria-label="Estado" value={estado} onChange={(e) => setEstado(e.target.value as EstadoProyecto | '')} className={campoCls}>
          <option value="">Estado: Todos</option>
          {ESTADOS_PROYECTO.map((e) => (
            <option key={e} value={e}>
              {NOMBRES_ESTADO_PROYECTO[e]}
            </option>
          ))}
        </select>
      </div>

      <table aria-labelledby="ai-proyectos" className="tbl w-full border-collapse text-[13px]">
        <thead>
          <tr className={etiquetaCls}>
            <th className={celdaCls}>Proyecto</th>
            <th className={celdaCls}>Ref.</th>
            <th className={celdaCls}>Cliente</th>
            <th className={celdaCls}>Modelos</th>
            <th className={`${celdaCls} text-right`}>Tokens</th>
            <th className={`${celdaCls} text-right`}>API aprox.</th>
            <th className={`${celdaCls} text-right`}>Costo real</th>
            <th className={celdaCls}>Estado</th>
            <th className={celdaCls}>Carpeta</th>
          </tr>
        </thead>
        <tbody>
          {filtrados.map((p) => (
            <tr key={p.id} className="cursor-pointer" onClick={() => navigate(`/proyectos/${p.id}`)}>
              <td data-label="Proyecto" className={celdaCls}>
                {p.nombre}
              </td>
              <td data-label="Ref." className={`${celdaCls} font-mono text-[12px]`}>
                {p.referencia ?? '—'}
              </td>
              <td data-label="Cliente" className={celdaCls}>
                {p.etiqueta === 'personal' ? <span className="text-on-surface-muted">Personal</span> : p.contacto}
                {p.clienteFinal && <span className="text-on-surface-muted"> · {p.clienteFinal}</span>}
              </td>
              <td data-label="Modelos" className={`${celdaCls} font-mono text-[12px]`}>
                {p.modelos.length > 0 ? p.modelos.join(', ') : '—'}
              </td>
              <td data-label="Tokens" className={`${celdaCls} text-right font-mono text-[12px]`}>
                {tokens(p.tokens)}
              </td>
              <td data-label="API aprox." className={`${celdaCls} text-right font-mono text-[12px]`}>
                {costoApi(p)}
              </td>
              <td data-label="Costo real" className={`${celdaCls} text-right font-mono text-[12px]`}>
                {pesos(p.costoReal)}
              </td>
              <td data-label="Estado" className={celdaCls}>
                {NOMBRES_ESTADO_PROYECTO[p.estado]}
              </td>
              <td data-label="Carpeta" className={celdaCls}>
                {p.carpeta.abrible ? (
                  <button
                    type="button"
                    title={p.carpeta.ruta ?? undefined}
                    className="cursor-pointer font-mono text-[11px] text-primary-text"
                    onClick={(e) => {
                      e.stopPropagation()
                      correr(() => window.dmm.proyectos.abrirCarpeta(p.id))
                    }}
                  >
                    Abrir
                  </button>
                ) : (
                  <span title={p.carpeta.ruta ?? undefined} className="font-mono text-[11px] text-on-surface-muted">
                    {p.carpeta.estado === 'sin_carpeta' ? '—' : NOMBRES_CARPETA[p.carpeta.estado]}
                  </span>
                )}
              </td>
            </tr>
          ))}
          {!filtrando && (sinProyecto.tokens > 0 || sinProyecto.costoUsd > 0) && (
            <tr className="text-on-surface-muted">
              <td data-label="Proyecto" className={celdaCls}>
                Sin proyecto
              </td>
              <td className={celdaCls} />
              <td className={celdaCls} />
              <td className={celdaCls} />
              <td data-label="Tokens" className={`${celdaCls} text-right font-mono text-[12px]`}>
                {tokens(sinProyecto.tokens)}
              </td>
              <td data-label="API aprox." className={`${celdaCls} text-right font-mono text-[12px]`}>
                {costoApi(sinProyecto)}
              </td>
              <td className={celdaCls} />
              <td className={celdaCls} />
              <td className={celdaCls} />
            </tr>
          )}
        </tbody>
      </table>
      {filtrados.length === 0 && <p className="m-0 text-[13px] text-on-surface-muted">Ningún proyecto AI coincide.</p>}
      <Aviso error={error} />
    </>
  )
}

function TablaSuscripciones({ filas }: { filas: FilaSuscripcion[] }) {
  if (filas.length === 0) return <p className="m-0 text-[13px] text-on-surface-muted">Ninguna suscripción en el periodo.</p>
  return (
    <table aria-labelledby="ai-suscripciones" className="tbl w-full border-collapse text-[13px]">
      <thead>
        <tr className={etiquetaCls}>
          <th className={celdaCls}>Proveedor</th>
          <th className={celdaCls}>Plan</th>
          <th className={celdaCls}>Fecha</th>
          <th className={`${celdaCls} text-right`}>Monto</th>
          <th className={celdaCls}>Origen</th>
        </tr>
      </thead>
      <tbody>
        {filas.map((s) => (
          <tr key={s.id}>
            <td data-label="Proveedor" className={celdaCls}>
              {s.proveedor ?? '—'}
            </td>
            <td data-label="Plan" className={celdaCls}>
              {s.plan}
            </td>
            <td data-label="Fecha" className={`${celdaCls} font-mono text-[12px]`}>
              {dia(s.fecha)}
            </td>
            <td data-label="Monto" className={`${celdaCls} text-right font-mono text-[12px]`}>
              {pesos(s.monto)}
            </td>
            <td data-label="Origen" className={celdaCls}>
              {NOMBRES_ORIGEN_SUSCRIPCION[s.origen]}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

const NOTAS_CRITERIO: Record<CriterioAsignacion, string> = {
  tokens: 'Por uso de tokens.',
  partes_iguales: 'Sin datos de uso este mes: partes iguales entre los proyectos AI abiertos.',
  sin_proyectos: 'Ningún proyecto AI abierto este mes: todo queda sin asignar.'
}

/**
 * This month's Suscripciones split across AI Proyectos, as main works it out when read. Sin
 * asignar is only noted, never spread.
 */
function TablaAsignacion({ asignacion }: { asignacion: AsignacionCosto }) {
  const porTokens = asignacion.criterio === 'tokens'
  return (
    <>
      <table aria-labelledby="ai-asignacion" className="tbl w-full border-collapse text-[13px]">
        <thead>
          <tr className={etiquetaCls}>
            <th className={celdaCls}>Proyecto</th>
            <th className={`${celdaCls} text-right`}>Tokens</th>
            <th className={`${celdaCls} text-right`}>%</th>
            <th className={`${celdaCls} text-right`}>Asignado</th>
          </tr>
        </thead>
        <tbody>
          {asignacion.filas.map((f) => (
            <tr key={f.proyectoId}>
              <td data-label="Proyecto" className={celdaCls}>
                {f.nombre}
              </td>
              <td data-label="Tokens" className={`${celdaCls} text-right font-mono text-[12px]`}>
                {porTokens ? tokens(f.tokens) : '—'}
              </td>
              <td data-label="%" className={`${celdaCls} text-right font-mono text-[12px]`}>
                {porcentaje(f.parte)}
              </td>
              <td data-label="Asignado" className={`${celdaCls} text-right font-mono text-[12px]`}>
                {pesos(f.monto)}
              </td>
            </tr>
          ))}
          <tr className="text-on-surface-muted">
            <td data-label="Proyecto" className={celdaCls}>
              Sin asignar
            </td>
            <td data-label="Tokens" className={`${celdaCls} text-right font-mono text-[12px]`}>
              —
            </td>
            <td data-label="%" className={`${celdaCls} text-right font-mono text-[12px]`}>
              —
            </td>
            <td data-label="Asignado" className={`${celdaCls} text-right font-mono text-[12px]`}>
              {pesos(asignacion.sinAsignar)}
            </td>
          </tr>
        </tbody>
      </table>
      <p className="m-0 text-[12px] text-on-surface-muted">{NOTAS_CRITERIO[asignacion.criterio]}</p>
    </>
  )
}
