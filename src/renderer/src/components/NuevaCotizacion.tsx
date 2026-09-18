import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import {
  CATEGORIAS,
  CATEGORIAS_COSTO,
  FACTURACIONES,
  NOMBRES_CATEGORIA,
  NOMBRES_CATEGORIA_COSTO,
  NOMBRES_FACTURACION,
  type ConceptoCatalogo,
  type CotizacionNueva,
  type FilaContacto
} from '../../../shared/ipc'
import { celdaCls, etiquetaCls, pesos, tituloCls } from './Contactos'
import { Aviso, useAccion } from './Seccion'
import { Button } from './ui/button'

const campoCls = 'h-9 rounded-control border border-border-strong bg-surface-sunken px-2 text-[13px] text-on-surface'
const numCls = `${campoCls} w-28 font-mono text-[12px]`

const hoy = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Money is typed in pesos and kept in centavos.
const aCentavos = (pesos: string) => Math.round(Number(pesos || 0) * 100)
const aPesos = (centavos: number) => String(centavos / 100)

const vacia = (): CotizacionNueva => ({
  contactoId: 0,
  nombre: '',
  categoria: 'website',
  fecha: hoy(),
  validezDias: 30,
  moneda: 'MXN',
  partidas: [],
  conIva: true,
  facturacion: 'unica',
  parcialidades: null,
  stack: null,
  terminos: null,
  notas: null,
  costosEstimados: []
})

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className={etiquetaCls}>{label}</span>
      {children}
    </label>
  )
}

/**
 * Nueva cotización, or editing a draft (`/cotizaciones/:id/editar`). Items come from the
 * Catálogo with their price copied and editable here; sending prints and archives the PDF.
 */
export function NuevaCotizacion() {
  const params = useParams()
  const editando = params.id ? Number(params.id) : undefined
  const navigate = useNavigate()
  const [c, setC] = useState<CotizacionNueva>(vacia)
  const [contactos, setContactos] = useState<FilaContacto[]>([])
  const [catalogo, setCatalogo] = useState<ConceptoCatalogo[]>([])
  const [buscar, setBuscar] = useState('')
  const { error, ocupado, correr } = useAccion()

  useEffect(() => {
    correr(async () => {
      const [lista, conceptos] = await Promise.all([window.dmm.contactos.listar(), window.dmm.catalogo.listar()])
      setContactos(lista.contactos)
      setCatalogo(conceptos)
      if (editando !== undefined) {
        const f = await window.dmm.cotizaciones.ficha(editando)
        setC({ ...f, id: f.id })
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once per quote
  }, [editando])

  const cambiar = (cambios: Partial<CotizacionNueva>) => setC((prev) => ({ ...prev, ...cambios }))
  const partida = (i: number, cambios: Partial<CotizacionNueva['partidas'][number]>) =>
    cambiar({ partidas: c.partidas.map((p, j) => (j === i ? { ...p, ...cambios } : p)) })
  const costo = (i: number, cambios: Partial<CotizacionNueva['costosEstimados'][number]>) =>
    cambiar({ costosEstimados: c.costosEstimados.map((e, j) => (j === i ? { ...e, ...cambios } : e)) })

  const subtotal = Math.round(c.partidas.reduce((s, p) => s + p.cantidad * p.precio, 0))
  const iva = c.conIva ? Math.round(subtotal * 0.16) : 0
  const visibles = catalogo.filter((k) => k.concepto.toLowerCase().includes(buscar.trim().toLowerCase()))

  const guardar = (enviar: boolean) =>
    correr(async () => {
      if (!c.contactoId) throw new Error('Elige un cliente')
      const f = await window.dmm.cotizaciones.guardar(c)
      if (enviar) await window.dmm.cotizaciones.enviar(f.id)
      navigate(`/cotizaciones/${f.id}`)
    })

  return (
    <>
      <nav aria-label="Ruta" className="font-mono text-[10px] tracking-[.12em] text-on-surface-muted uppercase">
        <Link to="/cotizaciones" className="text-primary-text">
          Cotizaciones
        </Link>{' '}
        / {editando ? 'Editar borrador' : 'Nueva'}
      </nav>
      <div className="acts flex flex-wrap items-center justify-between gap-3">
        <h1 className={tituloCls}>{editando ? 'Editar cotización' : 'Nueva cotización'}</h1>
        <div className="flex gap-2">
          <Button variant="ghost" disabled={ocupado} onClick={() => navigate(editando ? `/cotizaciones/${editando}` : '/cotizaciones')}>
            Cancelar
          </Button>
          <Button variant="secondary" disabled={ocupado} onClick={() => guardar(false)}>
            Guardar borrador
          </Button>
          <Button disabled={ocupado} onClick={() => guardar(true)}>
            Generar PDF y archivar
          </Button>
        </div>
      </div>
      <Aviso error={error} />

      <div className="g-split grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)] items-start gap-[18px]">
        <div className="flex flex-col gap-[18px]">
          <section className="card grid grid-cols-2 gap-4 rounded-control border border-border p-6" aria-label="Datos">
            <Campo label="Cliente">
              <select value={c.contactoId || ''} onChange={(e) => cambiar({ contactoId: Number(e.target.value) })} className={campoCls}>
                <option value="">Elige un cliente</option>
                {contactos.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.nombre}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo label="Categoría">
              <select value={c.categoria} onChange={(e) => cambiar({ categoria: e.target.value as CotizacionNueva['categoria'] })} className={campoCls}>
                {CATEGORIAS.map((k) => (
                  <option key={k} value={k}>
                    {NOMBRES_CATEGORIA[k]}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo label="Título">
              <input value={c.nombre} onChange={(e) => cambiar({ nombre: e.target.value })} className={campoCls} />
            </Campo>
            <Campo label="Fecha">
              <input type="date" value={c.fecha} onChange={(e) => cambiar({ fecha: e.target.value })} className={campoCls} />
            </Campo>
            <Campo label="Vigencia (días)">
              <input type="number" min={1} value={c.validezDias} onChange={(e) => cambiar({ validezDias: Number(e.target.value) })} className={numCls} />
            </Campo>
            <Campo label="Moneda">
              <select value={c.moneda} onChange={(e) => cambiar({ moneda: e.target.value as 'MXN' | 'USD' })} className={campoCls}>
                <option>MXN</option>
                <option>USD</option>
              </select>
            </Campo>
            <Campo label="Facturación">
              <select
                value={c.facturacion}
                onChange={(e) => {
                  const facturacion = e.target.value as CotizacionNueva['facturacion']
                  cambiar({ facturacion, parcialidades: facturacion === 'parcialidades' ? (c.parcialidades ?? 2) : null })
                }}
                className={campoCls}
              >
                {FACTURACIONES.map((f) => (
                  <option key={f} value={f}>
                    {NOMBRES_FACTURACION[f]}
                  </option>
                ))}
              </select>
            </Campo>
            {c.facturacion === 'parcialidades' && (
              <Campo label="Parcialidades">
                <input type="number" min={2} value={c.parcialidades ?? 2} onChange={(e) => cambiar({ parcialidades: Number(e.target.value) })} className={numCls} />
              </Campo>
            )}
          </section>

          <section className="card flex flex-col gap-4 rounded-control border border-border p-6" aria-label="Conceptos">
            <h2 className={`m-0 ${etiquetaCls}`}>Conceptos</h2>
            <table className="tbl w-full border-collapse text-[13px]">
              <thead>
                <tr className={etiquetaCls}>
                  <th className={celdaCls}>Concepto</th>
                  <th className={celdaCls}>Cant.</th>
                  <th className={celdaCls}>Precio</th>
                  <th className={celdaCls}>Subtotal</th>
                  <th className={celdaCls} />
                </tr>
              </thead>
              <tbody>
                {c.partidas.map((p, i) => (
                  <tr key={i}>
                    <td className={celdaCls}>
                      <input aria-label="Concepto" value={p.concepto} onChange={(e) => partida(i, { concepto: e.target.value })} className={`${campoCls} w-full`} />
                    </td>
                    <td className={celdaCls}>
                      <input aria-label="Cantidad" type="number" min={1} value={p.cantidad} onChange={(e) => partida(i, { cantidad: Number(e.target.value) })} className={`${numCls} w-16`} />
                    </td>
                    <td className={celdaCls}>
                      <input aria-label="Precio" type="number" min={0} value={aPesos(p.precio)} onChange={(e) => partida(i, { precio: aCentavos(e.target.value) })} className={numCls} />
                    </td>
                    <td className={`${celdaCls} font-mono text-[12px]`}>{pesos(p.cantidad * p.precio)}</td>
                    <td className={celdaCls}>
                      <Button variant="ghost" aria-label="Quitar concepto" onClick={() => cambiar({ partidas: c.partidas.filter((_, j) => j !== i) })}>
                        ×
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Button
              variant="secondary"
              className="self-start"
              onClick={() => cambiar({ partidas: [...c.partidas, { concepto: '', categoria: c.categoria, cantidad: 1, precio: 0 }] })}
            >
              Concepto libre
            </Button>
            <dl aria-label="Totales" className="m-0 ml-auto grid w-64 grid-cols-2 gap-y-1.5 text-[13px]">
              <dt className="text-on-surface-muted">Subtotal</dt>
              <dd className="m-0 text-right font-mono">{pesos(subtotal)}</dd>
              <dt className="text-on-surface-muted">
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={c.conIva} onChange={(e) => cambiar({ conIva: e.target.checked })} />
                  IVA 16%
                </label>
              </dt>
              <dd className="m-0 text-right font-mono">{pesos(iva)}</dd>
              <dt className="font-bold">Total</dt>
              <dd className="m-0 text-right font-mono font-bold">{pesos(subtotal + iva)}</dd>
            </dl>
          </section>

          <section className="card flex flex-col gap-4 rounded-control border border-border p-6" aria-label="Costos estimados">
            <h2 className={`m-0 ${etiquetaCls}`}>Costos estimados</h2>
            <p className="m-0 text-[12px] text-on-surface-muted">
              Internos: no aparecen en el PDF. Al aceptarse, se registran en Finanzas; los recurrentes generan un costo por periodo. El monto es por
              periodo (por mensualidad a MSI).
            </p>
            {c.costosEstimados.map((e, i) => (
              <div key={i} className="flex gap-2">
                <input aria-label="Concepto del costo" value={e.concepto} onChange={(ev) => costo(i, { concepto: ev.target.value })} className={`${campoCls} flex-1`} />
                <input aria-label="Monto del costo" type="number" min={0} value={aPesos(e.monto)} onChange={(ev) => costo(i, { monto: aCentavos(ev.target.value) })} className={numCls} />
                <select
                  aria-label="Tipo del costo"
                  value={e.categoria}
                  onChange={(ev) => {
                    const categoria = ev.target.value as (typeof CATEGORIAS_COSTO)[number]
                    costo(i, { categoria, parcialidades: categoria === 'msi' ? (e.parcialidades ?? 12) : null })
                  }}
                  className={campoCls}
                >
                  {CATEGORIAS_COSTO.map((k) => (
                    <option key={k} value={k}>
                      {NOMBRES_CATEGORIA_COSTO[k]}
                    </option>
                  ))}
                </select>
                {e.categoria === 'msi' && (
                  <input
                    aria-label="Mensualidades"
                    type="number"
                    min={2}
                    value={e.parcialidades ?? 12}
                    onChange={(ev) => costo(i, { parcialidades: Number(ev.target.value) })}
                    className={`${numCls} w-20`}
                  />
                )}
                <Button variant="ghost" aria-label="Quitar costo" onClick={() => cambiar({ costosEstimados: c.costosEstimados.filter((_, j) => j !== i) })}>
                  ×
                </Button>
              </div>
            ))}
            <Button variant="secondary" className="self-start" onClick={() => cambiar({ costosEstimados: [...c.costosEstimados, { concepto: '', monto: 0, categoria: 'unico', parcialidades: null }] })}>
              Agregar costo
            </Button>
          </section>

          <section className="card grid grid-cols-1 gap-4 rounded-control border border-border p-6" aria-label="Notas y condiciones">
            {(
              [
                ['stack', 'Stack'],
                ['terminos', 'Términos'],
                ['notas', 'Notas']
              ] as const
            ).map(([k, label]) => (
              <Campo key={k} label={label}>
                <textarea rows={3} value={c[k] ?? ''} onChange={(e) => cambiar({ [k]: e.target.value || null })} className={`${campoCls} h-auto py-2`} />
              </Campo>
            ))}
          </section>
        </div>

        <section className="card flex flex-col gap-3 rounded-control border border-border p-6" aria-labelledby="catalogo">
          <h2 id="catalogo" className={`m-0 ${etiquetaCls}`}>
            Catálogo
          </h2>
          <input type="search" placeholder="Buscar producto o servicio" value={buscar} onChange={(e) => setBuscar(e.target.value)} className={campoCls} />
          <ul className="m-0 flex list-none flex-col gap-2 p-0 text-[13px]">
            {visibles.map((k) => (
              <li key={k.id} className="flex items-center justify-between gap-2 border-t border-border pt-2">
                <span className="truncate">{k.concepto}</span>
                <span className="flex shrink-0 items-center gap-2">
                  <span className="font-mono text-[12px] text-on-surface-muted">{pesos(k.precio)}</span>
                  <Button
                    variant="secondary"
                    aria-label={`Agregar ${k.concepto}`}
                    onClick={() => cambiar({ partidas: [...c.partidas, { concepto: k.concepto, categoria: k.categoria, cantidad: 1, precio: k.precio }] })}
                  >
                    +
                  </Button>
                </span>
              </li>
            ))}
          </ul>
          <p className="m-0 text-[12px] text-on-surface-muted">Precios por defecto · editables en la cotización</p>
        </section>
      </div>
    </>
  )
}
