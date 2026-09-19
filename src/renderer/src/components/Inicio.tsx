import { useEffect, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router'
import {
  NOMBRES_ESTADO_COTIZACION,
  type FilaCotizacion,
  type FilaIngreso,
  type FilaProyecto,
  type ListaTareas,
  type ResumenFinanzas
} from '../../../shared/dominio'
import { dia, folioDmm } from '../../../shared/formato'
import { celdaCls, etiquetaCls, pesos, tituloCls } from './Contactos'
import { Aviso, useAccion } from './Seccion'
import { Button } from './ui/button'

const cardCls = 'card flex flex-col gap-4 rounded-control border border-border p-6'
const accionCls = 'cursor-pointer font-mono text-[11px] text-primary-text disabled:opacity-50'
const pestanaCls = (activa: boolean) =>
  `cursor-pointer rounded-control border px-2 py-1 text-[12px] ${activa ? 'border-primary text-primary-text' : 'border-border-strong text-on-surface-muted'}`

type Cobros = 'mes' | 'vencidos' | 'por_facturar'

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
      const [r, p, c, t] = await Promise.all([
        window.dmm.finanzas.resumen('mes'),
        window.dmm.proyectos.listar(),
        window.dmm.cotizaciones.listar(),
        window.dmm.tareas.listar()
      ])
      setResumen(r)
      setProyectos(p.proyectos.filter((x) => x.estado === 'en_curso'))
      setCotizaciones(c.cotizaciones.filter((x) => x.estado === 'borrador' || x.estado === 'enviada'))
      setTareas(t)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once on mount
  }, [])

  const mes = resumen?.rango.hasta.slice(0, 7)
  const nombreMes = resumen ? new Date(`${resumen.rango.hasta}T12:00:00`).toLocaleDateString('es-MX', { month: 'short' }) : ''
  const proyectado = resumen?.actual.ingresos ?? 0
  // Reembolsos are negative, so this is what actually stayed in the bank.
  const real = (resumen?.cobrado ?? []).reduce((s, i) => s + i.subtotal, 0)
  const costos = resumen?.actual.costos ?? 0

  const pendientes = resumen?.cobranza ?? []
  const grupos: Record<Cobros, FilaIngreso[]> = {
    // Everything collectable up to this month that is not overdue: earlier sin_factura ones never become vencidas.
    mes: pendientes.filter((i) => !i.vencida && i.fecha !== null && i.fecha.slice(0, 7) <= (mes ?? '')),
    vencidos: pendientes.filter((i) => i.vencida),
    por_facturar: pendientes.filter((i) => i.estadoFacturacion === 'por_facturar')
  }

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
          <Cifra label="Ingreso proyectado" valor={pesos(proyectado)} detalle={`${nombreMes} · cobrado y por cobrar`} />
          <Cifra label="Ingreso real" valor={pesos(real)} detalle={proyectado > 0 ? `${Math.round((real / proyectado) * 100)}% de lo proyectado` : nombreMes} />
          <Cifra label="Diferencia" valor={pesos(real - proyectado)} detalle="real − proyectado" />
          <Cifra label="Costos" valor={resumen.actual.utilidad === null ? 'Sin datos' : pesos(costos)} detalle={nombreMes} />
          <Cifra label="Utilidad" valor={resumen.actual.utilidad === null ? 'Sin datos' : pesos(real - costos)} detalle="real − costos" />
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
                  ['por_facturar', 'Por facturar']
                ] as const
              ).map(([k, label]) => (
                <button key={k} type="button" aria-pressed={cobros === k} onClick={() => setCobros(k)} className={pestanaCls(cobros === k)}>
                  {k === 'mes' ? label : `${label} · ${grupos[k].length}`}
                </button>
              ))}
            </div>
            <Tabla
              vacio={{ mes: 'Nada por cobrar este mes.', vencidos: 'Nada vencido.', por_facturar: 'Nada por facturar.' }[cobros]}
              columnas={['Fecha', 'Contacto', 'Monto']}
              filas={grupos[cobros].map((i) => ({
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
              columnas={['Vence', 'Costo', 'Monto']}
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
              columnas={['Folio', 'Cotización', 'Estado', 'Monto']}
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
              Hechas · 30 días
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
              vacio="Nada hecho en los últimos 30 días."
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

function Cifra({ label, valor, detalle }: { label: string; valor: string; detalle: string }) {
  return (
    <li className="card flex flex-col gap-1 rounded-control border border-border p-4">
      <span className={etiquetaCls}>{label}</span>
      <span className="font-display text-[29px] leading-none font-bold text-on-surface">{valor}</span>
      <span className="text-[12px] text-on-surface-muted">{detalle}</span>
    </li>
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

function Tabla({ columnas, filas, vacio }: { columnas: string[]; filas: { key: number; celdas: ReactNode[]; ir?: () => void }[]; vacio: string }) {
  if (filas.length === 0) return <p className="m-0 text-[13px] text-on-surface-muted">{vacio}</p>
  return (
    <table className="tbl w-full border-collapse text-[13px]">
      <thead>
        <tr className={etiquetaCls}>
          {columnas.map((c, k) => (
            <th key={k} className={`${celdaCls} ${c === 'Monto' ? 'text-right' : ''}`}>
              {c}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {filas.map((f) => (
          <tr key={f.key} className={f.ir ? 'cursor-pointer' : undefined} onClick={f.ir}>
            {f.celdas.map((celda, k) => (
              <td key={k} data-label={columnas[k] || undefined} className={`${celdaCls} ${columnas[k] === 'Monto' ? 'text-right font-mono text-[12px]' : ''}`}>
                {celda}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
