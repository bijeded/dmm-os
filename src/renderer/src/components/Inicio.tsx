import { useEffect, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router'
import {
  NOMBRES_ESTADO_COTIZACION,
  type FilaCotizacion,
  type FilaProyecto,
  type ListaTareas,
  type ResumenFinanzas
} from '../../../shared/dominio'
import { dia, folioDmm, pesos } from '../../../shared/formato'
import { Aviso, Cifra, useAccion } from './Seccion'
import { Button } from './ui/button'
import { celdaCls, etiquetaCls, tituloCls } from './estilos'

const cardCls = 'card flex flex-col gap-4 rounded-control border border-border p-6'
const accionCls = 'cursor-pointer font-mono text-[11px] text-primary-text disabled:opacity-50'
const pestanaCls = (activa: boolean) =>
  `cursor-pointer rounded-control border px-2 py-1 text-[12px] ${activa ? 'border-primary text-primary-text' : 'border-border-strong text-on-surface-muted'}`

type Cobros = keyof ResumenFinanzas['cobros']

/** Inicio: where the business stands this month, what is owed either way, and what is still to do. */
export function Inicio() {
  const navigate = useNavigate()
  const [resumen, setResumen] = useState<ResumenFinanzas | null>(null)
  const [proyectos, setProyectos] = useState<FilaProyecto[]>([])
  const [cotizaciones, setCotizaciones] = useState<FilaCotizacion[]>([])
  const [tareas, setTareas] = useState<ListaTareas | null>(null)
  const [cobros, setCobros] = useState<Cobros>('mes')
  const [hechas, setHechas] = useState(false)
  const [nueva, setNueva] = useState('')
  const { error, ocupado, correr } = useAccion()

  useEffect(() => {
    correr(async () => {
      const inicio = await window.dmm.inicio.resumen()
      setResumen(inicio.finanzas)
      setProyectos(inicio.proyectos)
      setCotizaciones(inicio.cotizaciones)
      setTareas(inicio.tareas)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once on mount
  }, [])

  const nombreMes = resumen ? new Date(`${resumen.rango.hasta}T12:00:00`).toLocaleDateString('es-MX', { month: 'short' }) : ''
  const proyectado = resumen?.actual.ingresos ?? 0
  const real = resumen?.real ?? 0

  const tarea = (fn: () => Promise<ListaTareas>) => correr(async () => setTareas(await fn()))
  const agregar = () => {
    if (!nueva.trim()) return
    tarea(async () => {
      const lista = await window.dmm.tareas.agregar(nueva)
      setNueva('')
      return lista
    })
  }

  return (
    <>
      <div className="acts flex flex-wrap items-center justify-between gap-3">
        <h1 className={tituloCls}>Inicio</h1>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => navigate('/contactos?nuevo')}>
            Nuevo contacto
          </Button>
          <Button variant="secondary" onClick={() => navigate('/cotizaciones/nueva')}>
            Nueva cotización
          </Button>
          <Button onClick={() => navigate('/proyectos/nuevo')}>Nuevo proyecto</Button>
        </div>
      </div>

      {resumen && (
        <ul aria-label="Resumen" className="g-stats m-0 grid list-none grid-cols-5 gap-3 p-0">
          <Cifra label="Ingreso proyectado" valor={pesos(proyectado)} detalle={[nombreMes, 'cobrado y por cobrar']} />
          <Cifra label="Ingreso real" valor={pesos(real)} detalle={[proyectado > 0 ? `${Math.round((real / proyectado) * 100)}% de lo proyectado` : nombreMes]} />
          <Cifra label="Diferencia" valor={pesos(real - proyectado)} detalle={['real − proyectado']} />
          <Cifra label="Costos" valor={resumen.utilidadReal === null ? 'Sin datos' : pesos(resumen.actual.costos)} detalle={[nombreMes]} />
          <Cifra label="Utilidad" valor={resumen.utilidadReal === null ? 'Sin datos' : pesos(resumen.utilidadReal)} detalle={['real − costos']} />
        </ul>
      )}
      <Aviso error={error} />

      <div className="g-split grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)] items-start gap-[18px]">
        <div className="flex flex-col gap-[18px]">
          <Tarjeta id="inicio-cobros" titulo="Cobros">
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ['mes', 'Este mes'],
                  ['vencidos', 'Vencidos'],
                  ['porFacturar', 'Por facturar']
                ] as const
              ).map(([k, label]) => (
                <button key={k} type="button" aria-pressed={cobros === k} onClick={() => setCobros(k)} className={pestanaCls(cobros === k)}>
                  {k === 'mes' ? label : `${label} · ${resumen?.cobros[k].length ?? 0}`}
                </button>
              ))}
            </div>
            <Tabla
              vacio={{ mes: 'Nada por cobrar este mes.', vencidos: 'Nada vencido.', porFacturar: 'Nada por facturar.' }[cobros]}
              columnas={['Fecha', 'Contacto', MONTO]}
              filas={(resumen?.cobros[cobros] ?? []).map((i) => ({
                key: i.id,
                celdas: [
                  i.fecha ? dia(i.fecha) : '—',
                  <>
                    {i.contacto ?? '—'}
                    {i.proyecto && <span className="text-on-surface-muted"> · {i.proyecto}</span>}
                  </>,
                  pesos(i.subtotal)
                ]
              }))}
            />
          </Tarjeta>

          <Tarjeta id="inicio-costos" titulo="Costos pendientes">
            <Tabla
              vacio="Nada por pagar."
              columnas={['Vence', 'Costo', MONTO]}
              filas={(resumen?.costosPendientes ?? []).map((c) => ({
                key: c.id,
                celdas: [
                  dia(c.fecha),
                  <>
                    {c.nombre}
                    {c.proveedor && <span className="text-on-surface-muted"> · {c.proveedor}</span>}
                  </>,
                  pesos(c.subtotal)
                ]
              }))}
            />
          </Tarjeta>

          <Tarjeta id="inicio-proyectos" titulo="Proyectos en curso">
            <Tabla
              vacio="Ningún proyecto en curso."
              columnas={['Ref.', 'Proyecto', 'Contacto']}
              filas={proyectos.map((p) => ({
                key: p.id,
                ir: () => navigate(`/proyectos/${p.id}`),
                celdas: [p.referencia, p.nombre, p.contacto ?? 'Personal']
              }))}
            />
          </Tarjeta>

          <Tarjeta id="inicio-cotizaciones" titulo="Cotizaciones abiertas">
            <Tabla
              vacio="Ninguna cotización abierta."
              columnas={['Folio', 'Cotización', 'Estado', MONTO]}
              filas={cotizaciones.map((c) => ({
                key: c.id,
                ir: () => navigate(`/cotizaciones/${c.id}`),
                celdas: [
                  c.folio ? folioDmm(c.folio) : '—',
                  <>
                    {c.nombre ?? '—'}
                    <span className="text-on-surface-muted"> · {c.contacto}</span>
                  </>,
                  NOMBRES_ESTADO_COTIZACION[c.estado],
                  pesos(c.subtotal)
                ]
              }))}
            />
          </Tarjeta>
        </div>

        <Tarjeta id="inicio-tareas" titulo="Tareas">
          <div className="flex flex-wrap gap-2">
            <button type="button" aria-pressed={!hechas} onClick={() => setHechas(false)} className={pestanaCls(!hechas)}>
              Pendientes · {tareas?.pendientes.length ?? 0}
            </button>
            <button type="button" aria-pressed={hechas} onClick={() => setHechas(true)} className={pestanaCls(hechas)}>
              Hechas · {tareas?.diasHechas ?? 0} días
            </button>
          </div>
          {!hechas && (
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                agregar()
              }}
            >
              <input
                placeholder="Nueva tarea…"
                value={nueva}
                onChange={(e) => setNueva(e.target.value)}
                className="h-9 min-w-0 flex-1 rounded-control border border-border-strong bg-surface-sunken px-3 text-[13px] text-on-surface"
              />
              <Button type="submit" disabled={ocupado || !nueva.trim()}>
                Agregar
              </Button>
            </form>
          )}
          {hechas ? (
            <Tabla
              vacio={`Nada hecho en los últimos ${tareas?.diasHechas ?? 0} días.`}
              columnas={['Tarea', 'Registrada', 'Hecha']}
              filas={(tareas?.hechas ?? []).map((t) => ({ key: t.id, celdas: [t.texto, dia(t.fechaRegistro), dia(t.fechaHecha!)] }))}
            />
          ) : (
            <Tabla
              vacio="Nada pendiente."
              columnas={['Tarea', 'Registrada', '']}
              filas={(tareas?.pendientes ?? []).map((t) => ({
                key: t.id,
                celdas: [
                  t.texto,
                  dia(t.fechaRegistro),
                  <span className="flex gap-3">
                    <button type="button" disabled={ocupado} className={accionCls} onClick={() => tarea(() => window.dmm.tareas.completar(t.id))}>
                      Hecha
                    </button>
                    <button type="button" disabled={ocupado} className={accionCls} onClick={() => tarea(() => window.dmm.tareas.borrar(t.id))}>
                      Borrar
                    </button>
                  </span>
                ]
              }))}
            />
          )}
        </Tarjeta>
      </div>
    </>
  )
}

function Tarjeta({ id, titulo, children }: { id: string; titulo: string; children: ReactNode }) {
  return (
    <section className={cardCls} aria-labelledby={id}>
      <h2 id={id} className={`m-0 ${etiquetaCls}`}>
        {titulo}
      </h2>
      {children}
    </section>
  )
}

/** A table column: its header, and whether it holds money (right-aligned, monospace). */
type Columna = string | { titulo: string; monto: true }
const MONTO: Columna = { titulo: 'Monto', monto: true }
const titulo = (c: Columna) => (typeof c === 'string' ? c : c.titulo)
const esMonto = (c: Columna | undefined) => typeof c === 'object'

function Tabla({ columnas, filas, vacio }: { columnas: Columna[]; filas: { key: number; celdas: ReactNode[]; ir?: () => void }[]; vacio: string }) {
  if (filas.length === 0) return <p className="m-0 text-[13px] text-on-surface-muted">{vacio}</p>
  return (
    <table className="tbl w-full border-collapse text-[13px]">
      <thead>
        <tr className={etiquetaCls}>
          {columnas.map((c, k) => (
            <th key={k} className={`${celdaCls} ${esMonto(c) ? 'text-right' : ''}`}>
              {titulo(c)}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {filas.map((f) => (
          <tr key={f.key} className={f.ir ? 'cursor-pointer' : undefined} onClick={f.ir}>
            {f.celdas.map((celda, k) => (
              <td key={k} data-label={(columnas[k] && titulo(columnas[k])) || undefined} className={`${celdaCls} ${esMonto(columnas[k]) ? 'text-right font-mono text-[12px]' : ''}`}>
                {celda}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
