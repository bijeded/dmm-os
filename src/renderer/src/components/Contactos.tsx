import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { ESTADOS_CONTACTO, NOMBRES_ESTADO_CONTACTO, type EstadoContacto, type ListaContactos } from '../../../shared/dominio'
import { monto, normalizar } from '../../../shared/formato'
import { FormContacto } from './FormContacto'
import { Aviso, useAccion } from './Seccion'
import { Button } from './ui/button'

const POR_PAGINA = 10

/** Centavos as pesos with two-digit cents, e.g. `$296,000.00`. */
export const pesos = (centavos: number) => monto(centavos)

const plurales: Record<EstadoContacto, string> = {
  lead_frio: 'Leads fríos',
  lead_caliente: 'Leads calientes',
  cliente_activo: 'Clientes activos',
  cliente_inactivo: 'Clientes inactivos'
}

export const tituloCls = 'm-0 font-display text-[29px] leading-[1.22] font-bold tracking-[-.01em] text-on-surface uppercase'
export const etiquetaCls = 'font-mono text-[10px] font-semibold tracking-[.12em] text-on-surface-muted uppercase'
export const celdaCls = 'border-b border-border px-3 py-2.5 text-left'


/** Contactos: who DMM deals with, how each one stands, and who the revenue comes from. */
export function Contactos() {
  const navigate = useNavigate()
  const [lista, setLista] = useState<ListaContactos | null>(null)
  const [busqueda, setBusqueda] = useState('')
  const [estado, setEstado] = useState<EstadoContacto | ''>('')
  const [pagina, setPagina] = useState(0)
  const [nuevo, setNuevo] = useState(false)
  const { error, ocupado, correr } = useAccion()

  useEffect(() => {
    correr(async () => setLista(await window.dmm.contactos.listar()))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once on mount
  }, [])

  const filtrados = useMemo(() => {
    const q = normalizar(busqueda.trim())
    return (lista?.contactos ?? []).filter(
      (c) => (!estado || c.estado === estado) && (!q || [c.nombre, c.empresa, c.email].some((v) => v && normalizar(v).includes(q)))
    )
  }, [lista, busqueda, estado])

  const paginas = Math.max(1, Math.ceil(filtrados.length / POR_PAGINA))
  const actual = Math.min(pagina, paginas - 1)
  const visibles = filtrados.slice(actual * POR_PAGINA, (actual + 1) * POR_PAGINA)

  const exportar = () =>
    correr(async () => {
      const csv = await window.dmm.contactos.csv()
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
      const a = document.createElement('a')
      a.href = url
      a.download = 'contactos.csv'
      a.click()
      URL.revokeObjectURL(url)
    })

  return (
    <>
      <h1 className={tituloCls}>Contactos</h1>
      {nuevo && <FormContacto onGuardado={(id) => navigate(`/contactos/${id}`)} onCerrar={() => setNuevo(false)} />}

      {lista && (
        <ul aria-label="Resumen" className="g-stats m-0 grid list-none grid-cols-5 gap-3 p-0">
          {[...ESTADOS_CONTACTO.map((e) => [plurales[e], lista.conteo[e]] as const), ['Total contactos', lista.contactos.length] as const].map(([label, n]) => (
            <li key={label} className="card flex flex-col gap-1 rounded-control border border-border p-4">
              <span className={etiquetaCls}>{label}</span>
              <span className="font-display text-[29px] leading-none font-bold text-on-surface">{n}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="g-split grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)] items-start gap-[18px]">
        <section className="card flex flex-col gap-4 rounded-control border border-border p-6">
          <div className="acts flex flex-wrap items-center gap-2">
            <input
              type="search"
              placeholder="Buscar nombre, email…"
              value={busqueda}
              onChange={(e) => {
                setBusqueda(e.target.value)
                setPagina(0)
              }}
              className="srch h-9 w-64 rounded-control border border-border-strong bg-surface-sunken px-3 text-[13px] text-on-surface"
            />
            <select
              aria-label="Estado"
              value={estado}
              onChange={(e) => {
                setEstado(e.target.value as EstadoContacto | '')
                setPagina(0)
              }}
              className="h-9 rounded-control border border-border-strong bg-surface-sunken px-2 text-[13px] text-on-surface"
            >
              <option value="">Estado: Todos</option>
              {ESTADOS_CONTACTO.map((e) => (
                <option key={e} value={e}>
                  {NOMBRES_ESTADO_CONTACTO[e]}
                </option>
              ))}
            </select>
            <div className="flex-1" />
            <Button variant="secondary" disabled={ocupado || !lista} onClick={exportar}>
              Exportar CSV
            </Button>
            <Button onClick={() => setNuevo(true)}>Nuevo contacto</Button>
          </div>

          <table className="tbl w-full border-collapse text-[13px]">
            <thead>
              <tr className={etiquetaCls}>
                <th className={celdaCls}>Nombre</th>
                <th className={celdaCls}>Email</th>
                <th className={celdaCls}>Teléfono</th>
                <th className={celdaCls}>Estado</th>
              </tr>
            </thead>
            <tbody>
              {visibles.map((c) => (
                <tr key={c.id} className="cursor-pointer" onClick={() => navigate(`/contactos/${c.id}`)}>
                  <td data-label="Nombre" className={celdaCls}>
                    {c.nombre}
                  </td>
                  <td data-label="Email" className={celdaCls}>
                    {c.email ?? '—'}
                  </td>
                  <td data-label="Teléfono" className={`${celdaCls} font-mono text-[12px]`}>
                    {c.telefono ?? '—'}
                  </td>
                  <td data-label="Estado" className={celdaCls}>
                    {NOMBRES_ESTADO_CONTACTO[c.estado]}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {lista && filtrados.length === 0 && <p className="m-0 text-[13px] text-on-surface-muted">Ningún contacto coincide.</p>}

          <div className="flex items-center justify-between gap-3 text-[12px] text-on-surface-muted">
            <span>
              {filtrados.length > 0 ? `${actual * POR_PAGINA + 1}–${actual * POR_PAGINA + visibles.length} de ${filtrados.length}` : ''}
            </span>
            <div className="flex gap-2">
              <Button variant="ghost" disabled={actual === 0} onClick={() => setPagina(actual - 1)}>
                Anterior
              </Button>
              <Button variant="ghost" disabled={actual >= paginas - 1} onClick={() => setPagina(actual + 1)}>
                Siguiente
              </Button>
            </div>
          </div>
          <Aviso error={error} />
        </section>

        <section className="card flex flex-col gap-3 rounded-control border border-border p-6" aria-labelledby="top-valor">
          <h2 id="top-valor" className={`m-0 ${etiquetaCls}`}>
            Top 10 por valor
          </h2>
          <p className="m-0 text-[12px] text-on-surface-muted">Concentración de ingresos por cliente</p>
          <ol aria-label="Top 10 por valor" className="m-0 flex list-none flex-col gap-2 p-0 text-[13px]">
            {lista?.top.map((t, i) => (
              <li key={t.id} className="flex items-center justify-between gap-3 border-t border-border pt-2">
                <button type="button" className="cursor-pointer truncate text-left text-on-surface hover:text-primary-text" onClick={() => navigate(`/contactos/${t.id}`)}>
                  {i + 1}. {t.nombre}
                </button>
                <span className="shrink-0 font-mono text-[12px] text-on-surface-muted">
                  {pesos(t.valor)} · {t.porcentaje}%
                </span>
              </li>
            ))}
          </ol>
          {lista && lista.top.length === 0 && <p className="m-0 text-[13px] text-on-surface-muted">Sin ingresos cobrados todavía.</p>}
        </section>
      </div>
    </>
  )
}
