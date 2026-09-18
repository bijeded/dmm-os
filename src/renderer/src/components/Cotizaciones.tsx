import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import {
  CATEGORIAS,
  ESTADOS_COTIZACION,
  NOMBRES_CATEGORIA,
  NOMBRES_ESTADO_COTIZACION,
  type Categoria,
  type EstadoCotizacion,
  type ListaCotizaciones
} from '../../../shared/ipc'
import { folioDmm, normalizar } from '../../../shared/formato'
import { celdaCls, etiquetaCls, pesos, tituloCls } from './Contactos'
import { Aviso, useAccion } from './Seccion'
import { Button } from './ui/button'

const selectCls = 'h-9 rounded-control border border-border-strong bg-surface-sunken px-2 text-[13px] text-on-surface'
// The brand's chart palette, one per category.
const COLORES: Record<Categoria, string> = {
  website: '#EBA51C',
  ecommerce: '#1C62EB',
  app: '#A51CEB',
  ai: '#1CEBA5',
  marketing: '#EB1C62',
  other: '#ADADAD'
}

export const dia = (d: string) =>
  new Date(`${d.slice(0, 10)}T12:00:00`).toLocaleDateString('es-MX', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  })

/** Cotizaciones: every quote, how many turn into work, and what kind of work is asked for. */
export function Cotizaciones() {
  const navigate = useNavigate()
  const [lista, setLista] = useState<ListaCotizaciones | null>(null)
  const [busqueda, setBusqueda] = useState('')
  const [cliente, setCliente] = useState('')
  const [anio, setAnio] = useState('')
  const [categoria, setCategoria] = useState<Categoria | ''>('')
  const [estado, setEstado] = useState<EstadoCotizacion | ''>('')
  const { error, correr } = useAccion()

  useEffect(() => {
    correr(async () => setLista(await window.dmm.cotizaciones.listar()))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once on mount
  }, [])

  const todas = useMemo(() => lista?.cotizaciones ?? [], [lista])
  const clientes = useMemo(() => [...new Map(todas.map((c) => [c.contactoId, c.contacto])).entries()].sort((a, b) => a[1].localeCompare(b[1], 'es')), [todas])
  const anios = useMemo(() => [...new Set(todas.map((c) => c.fecha.slice(0, 4)))].sort().reverse(), [todas])
  const filtradas = useMemo(() => {
    const q = normalizar(busqueda.trim())
    return todas.filter(
      (c) =>
        (!cliente || String(c.contactoId) === cliente) &&
        (!anio || c.fecha.startsWith(anio)) &&
        (!categoria || c.categoria === categoria) &&
        (!estado || c.estado === estado) &&
        (!q || [c.folio, c.contacto, c.nombre].some((v) => v && normalizar(v).includes(q)))
    )
  }, [todas, busqueda, cliente, anio, categoria, estado])

  const r = lista?.resumen
  const abrirPdf = (id: number) => correr(() => window.dmm.cotizaciones.abrirPdf(id))

  return (
    <>
      <div className="acts flex flex-wrap items-center justify-between gap-3">
        <h1 className={tituloCls}>Cotizaciones</h1>
        <Button onClick={() => navigate('/cotizaciones/nueva')}>Nueva cotización</Button>
      </div>

      {r && (
        <ul aria-label="Resumen" className="g-stats m-0 grid list-none grid-cols-5 gap-3 p-0">
          {(
            [
              ['Total cotizaciones', String(r.total)],
              ['Enviadas', String(r.enviadas)],
              ['Tasa de conversión', `${r.conversion}%`],
              ['Monto en abiertas', pesos(r.montoAbiertas)],
              ['Valor promedio', pesos(r.promedio)]
            ] as const
          ).map(([label, v]) => (
            <li key={label} className="card flex flex-col gap-1 rounded-control border border-border p-4">
              <span className={etiquetaCls}>{label}</span>
              <span className="font-display text-[29px] leading-none font-bold text-on-surface">{v}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="g-split grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)] items-start gap-[18px]">
        <section className="card flex flex-col gap-4 rounded-control border border-border p-6">
          <div className="acts flex flex-wrap items-center gap-2">
            <input
              type="search"
              placeholder="Buscar ref., cliente…"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              className="srch h-9 w-56 rounded-control border border-border-strong bg-surface-sunken px-3 text-[13px] text-on-surface"
            />
            <select aria-label="Contacto" value={cliente} onChange={(e) => setCliente(e.target.value)} className={selectCls}>
              <option value="">Contacto: Todos</option>
              {clientes.map(([id, nombre]) => (
                <option key={id} value={id}>
                  {nombre}
                </option>
              ))}
            </select>
            <select aria-label="Año" value={anio} onChange={(e) => setAnio(e.target.value)} className={selectCls}>
              <option value="">Año: Todos</option>
              {anios.map((a) => (
                <option key={a}>{a}</option>
              ))}
            </select>
            <select aria-label="Categoría" value={categoria} onChange={(e) => setCategoria(e.target.value as Categoria | '')} className={selectCls}>
              <option value="">Categoría: Todas</option>
              {CATEGORIAS.map((c) => (
                <option key={c} value={c}>
                  {NOMBRES_CATEGORIA[c]}
                </option>
              ))}
            </select>
            <select aria-label="Estado" value={estado} onChange={(e) => setEstado(e.target.value as EstadoCotizacion | '')} className={selectCls}>
              <option value="">Estado: Todos</option>
              {ESTADOS_COTIZACION.map((e) => (
                <option key={e} value={e}>
                  {NOMBRES_ESTADO_COTIZACION[e]}
                </option>
              ))}
            </select>
          </div>

          <table className="tbl w-full border-collapse text-[13px]">
            <thead>
              <tr className={etiquetaCls}>
                <th className={celdaCls}>Ref.</th>
                <th className={celdaCls}>Fecha</th>
                <th className={celdaCls}>Contacto</th>
                <th className={celdaCls}>Categoría</th>
                <th className={celdaCls}>Monto</th>
                <th className={celdaCls}>Estado</th>
                <th className={celdaCls}>PDF</th>
              </tr>
            </thead>
            <tbody>
              {filtradas.map((c) => (
                <tr key={c.id} className="cursor-pointer" onClick={() => navigate(`/cotizaciones/${c.id}`)}>
                  <td data-label="Ref." className={`${celdaCls} font-mono text-[12px]`}>
                    {c.folio ? folioDmm(c.folio) : '—'}
                  </td>
                  <td data-label="Fecha" className={celdaCls}>
                    {dia(c.fecha)}
                  </td>
                  <td data-label="Contacto" className={celdaCls}>
                    {c.contacto}
                  </td>
                  <td data-label="Categoría" className={celdaCls}>
                    {NOMBRES_CATEGORIA[c.categoria]}
                  </td>
                  <td data-label="Monto" className={`${celdaCls} font-mono text-[12px]`}>
                    {pesos(c.subtotal)}
                  </td>
                  <td data-label="Estado" className={celdaCls}>
                    {NOMBRES_ESTADO_COTIZACION[c.estado]}
                  </td>
                  <td data-label="PDF" className={celdaCls}>
                    {c.pdf ? (
                      <button
                        type="button"
                        className="cursor-pointer font-mono text-[11px] text-primary-text"
                        onClick={(e) => {
                          e.stopPropagation()
                          abrirPdf(c.id)
                        }}
                      >
                        PDF
                      </button>
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {lista && filtradas.length === 0 && <p className="m-0 text-[13px] text-on-surface-muted">Ninguna cotización coincide.</p>}
          <Aviso error={error} />
        </section>

        {lista && <PorCategoria conteo={lista.porCategoria} />}
      </div>
    </>
  )
}

/** Doughnut of quotes by category, drafts left out. */
function PorCategoria({ conteo }: { conteo: Record<Categoria, number> }) {
  const total = CATEGORIAS.reduce((s, c) => s + conteo[c], 0)
  const radio = 15.915 // circumference 100, so each arc's length is its percentage
  const presentes = CATEGORIAS.filter((c) => conteo[c] > 0)
  const pcts = presentes.map((c) => (conteo[c] / total) * 100)
  const inicios = pcts.map((_, i) => pcts.slice(0, i).reduce((s, p) => s + p, 0))
  return (
    <section className="card flex flex-col gap-3 rounded-control border border-border p-6" aria-labelledby="por-categoria">
      <h2 id="por-categoria" className={`m-0 ${etiquetaCls}`}>
        Por categoría
      </h2>
      <svg viewBox="0 0 42 42" className="mx-auto w-44" role="img" aria-label={`${total} cotizaciones por categoría`}>
        <circle cx="21" cy="21" r={radio} fill="none" stroke="currentColor" strokeWidth="5" className="text-border" />
        {presentes.map((c, i) => (
          <circle
            key={c}
            cx="21"
            cy="21"
            r={radio}
            fill="none"
            stroke={COLORES[c]}
            strokeWidth="5"
            strokeDasharray={`${pcts[i]} ${100 - pcts[i]}`}
            strokeDashoffset={25 - inicios[i]}
          />
        ))}
        <text x="21" y="22.5" textAnchor="middle" className="fill-on-surface font-display text-[6px] font-bold">
          {total}
        </text>
      </svg>
      <ul aria-label="Categorías" className="m-0 flex list-none flex-col gap-1.5 p-0 text-[13px]">
        {CATEGORIAS.map((c) => (
          <li key={c} className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2">
              <span className="inline-block size-2.5 rounded-full" style={{ background: COLORES[c] }} />
              {NOMBRES_CATEGORIA[c]}
            </span>
            <span className="font-mono text-[12px] text-on-surface-muted">{conteo[c]}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}
