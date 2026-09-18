import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import {
  CATEGORIAS,
  ESTADOS_PROYECTO,
  NOMBRES_CATEGORIA,
  NOMBRES_ESTADO_PROYECTO,
  type CarpetaProyecto,
  type Categoria,
  type EstadoProyecto,
  type ListaProyectos
} from '../../../shared/ipc'
import { normalizar } from '../../../shared/formato'
import { celdaCls, etiquetaCls, tituloCls } from './Contactos'
import { PorCategoria, dia, selectCls } from './Cotizaciones'
import { Aviso, useAccion } from './Seccion'
import { Button } from './ui/button'

/** How a folder that cannot be opened reads: Archivado is not a broken link. */
export const NOMBRES_CARPETA: Record<CarpetaProyecto['estado'], string> = {
  disponible: 'Disponible',
  archivado: 'Archivado',
  no_disponible: 'No disponible',
  sin_carpeta: 'Sin carpeta'
}

/** Proyectos: every unit of work, where it stands and where its files are. */
export function Proyectos() {
  const navigate = useNavigate()
  const [lista, setLista] = useState<ListaProyectos | null>(null)
  const [busqueda, setBusqueda] = useState('')
  const [cliente, setCliente] = useState('')
  const [anio, setAnio] = useState('')
  const [categoria, setCategoria] = useState<Categoria | ''>('')
  const [estado, setEstado] = useState<EstadoProyecto | ''>('')
  const { error, correr } = useAccion()

  useEffect(() => {
    correr(async () => setLista(await window.dmm.proyectos.listar()))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once on mount
  }, [])

  const todos = useMemo(() => lista?.proyectos ?? [], [lista])
  const clientes = useMemo(
    () =>
      [...new Map(todos.filter((p) => p.contactoId !== null).map((p) => [p.contactoId!, p.contacto!])).entries()].sort((a, b) =>
        a[1].localeCompare(b[1], 'es')
      ),
    [todos]
  )
  const anios = useMemo(() => [...new Set(todos.flatMap((p) => (p.fechaInicio ? [p.fechaInicio.slice(0, 4)] : [])))].sort().reverse(), [todos])
  const filtrados = useMemo(() => {
    const q = normalizar(busqueda.trim())
    return todos.filter(
      (p) =>
        (!cliente || (cliente === 'personal' ? p.etiqueta === 'personal' : String(p.contactoId) === cliente)) &&
        (!anio || p.fechaInicio?.startsWith(anio)) &&
        (!categoria || p.categoria === categoria) &&
        (!estado || p.estado === estado) &&
        (!q || [p.referencia, p.nombre, p.contacto, p.clienteFinal].some((v) => v && normalizar(v).includes(q)))
    )
  }, [todos, busqueda, cliente, anio, categoria, estado])

  const c = lista?.conteo
  const abrir = (id: number) => correr(() => window.dmm.proyectos.abrirCarpeta(id))

  return (
    <>
      <div className="acts flex flex-wrap items-center justify-between gap-3">
        <h1 className={tituloCls}>Proyectos</h1>
        <Button onClick={() => navigate('/proyectos/nuevo')}>Nuevo proyecto</Button>
      </div>

      {c && (
        <ul aria-label="Resumen" className="g-stats m-0 grid list-none grid-cols-5 gap-3 p-0">
          {(
            [
              ['En curso', c.en_curso],
              ['Pausados', c.pausado],
              ['Cancelados', c.cancelado],
              ['Completados', c.completado],
              ['Total proyectos', todos.length]
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
              placeholder="Buscar ref., proyecto…"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              className="srch h-9 w-56 rounded-control border border-border-strong bg-surface-sunken px-3 text-[13px] text-on-surface"
            />
            <select aria-label="Cliente" value={cliente} onChange={(e) => setCliente(e.target.value)} className={selectCls}>
              <option value="">Cliente: Todos</option>
              <option value="personal">Personal</option>
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
              {CATEGORIAS.map((k) => (
                <option key={k} value={k}>
                  {NOMBRES_CATEGORIA[k]}
                </option>
              ))}
            </select>
            <select aria-label="Estado" value={estado} onChange={(e) => setEstado(e.target.value as EstadoProyecto | '')} className={selectCls}>
              <option value="">Estado: Todos</option>
              {ESTADOS_PROYECTO.map((e) => (
                <option key={e} value={e}>
                  {NOMBRES_ESTADO_PROYECTO[e]}
                </option>
              ))}
            </select>
          </div>

          <table className="tbl w-full border-collapse text-[13px]">
            <thead>
              <tr className={etiquetaCls}>
                <th className={celdaCls}>Ref.</th>
                <th className={celdaCls}>Proyecto</th>
                <th className={celdaCls}>Cliente</th>
                <th className={celdaCls}>Categoría</th>
                <th className={celdaCls}>Inicio</th>
                <th className={celdaCls}>Estado</th>
                <th className={celdaCls}>Carpeta</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map((p) => (
                <tr key={p.id} className="cursor-pointer" onClick={() => navigate(`/proyectos/${p.id}`)}>
                  <td data-label="Ref." className={`${celdaCls} font-mono text-[12px]`}>
                    {p.referencia}
                  </td>
                  <td data-label="Proyecto" className={celdaCls}>
                    {p.nombre}
                  </td>
                  <td data-label="Cliente" className={celdaCls}>
                    {p.etiqueta === 'personal' ? <span className="text-on-surface-muted">Personal</span> : p.contacto}
                    {p.clienteFinal && <span className="text-on-surface-muted"> · {p.clienteFinal}</span>}
                  </td>
                  <td data-label="Categoría" className={celdaCls}>
                    {NOMBRES_CATEGORIA[p.categoria]}
                  </td>
                  <td data-label="Inicio" className={celdaCls}>
                    {p.fechaInicio ? dia(p.fechaInicio) : '—'}
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
                          abrir(p.id)
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
            </tbody>
          </table>
          {lista && filtrados.length === 0 && <p className="m-0 text-[13px] text-on-surface-muted">Ningún proyecto coincide.</p>}
          <Aviso error={error} />
        </section>

        {lista && <PorCategoria conteo={lista.porCategoria} unidad="proyectos" />}
      </div>
    </>
  )
}
