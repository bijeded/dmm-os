import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import {
  NOMBRES_CATEGORIA,
  NOMBRES_CATEGORIA_COSTO,
  NOMBRES_ESTADO_COTIZACION,
  NOMBRES_ESTADO_PROYECTO,
  NOMBRES_FACTURACION,
  type FichaCotizacion as Ficha,
  type OpcionesAceptacionTardia
} from '../../../shared/dominio'
import { dia, folioDmm, pesos } from '../../../shared/formato'
import { CambiarContacto } from './Atribucion'
import { Dialogo } from './Dialogo'
import { Campo } from './NuevaCotizacion'
import { Aviso, Datos, Fila, Seccion, useAccion } from './Seccion'
import { Button } from './ui/button'
import { campoCls, celdaCls, etiquetaCls, tituloCls } from './estilos'
import { useRuta } from './ruta'

/** The quote's record: its data, its PDF and what can happen to it next. */
export function FichaCotizacion() {
  const id = Number(useParams().id)
  const navigate = useNavigate()
  const [ficha, setFicha] = useState<Ficha | null>(null)
  const [tipoCambio, setTipoCambio] = useState('')
  const [cambiandoContacto, setCambiandoContacto] = useState(false)
  const [aceptandoTarde, setAceptandoTarde] = useState(false)
  const { error, ocupado, correr } = useAccion()

  useEffect(() => {
    correr(async () => setFicha(await window.dmm.cotizaciones.ficha(id)))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload only when the quote changes
  }, [id])

  const accion = (fn: (id: number) => Promise<Ficha>) => () => correr(async () => setFicha(await fn(id)))
  const api = window.dmm.cotizaciones
  const f = ficha

  useRuta(f?.folio ? folioDmm(f.folio) : 'Borrador')

  return (
    <>
      <div className="acts flex flex-wrap items-center justify-between gap-3">
        <h1 className={tituloCls}>{f?.nombre || 'Cotización'}</h1>
        {f && (
          <div className="flex flex-wrap gap-2">
            {f.pdf && (
              <Button variant="secondary" disabled={ocupado} onClick={() => correr(() => api.abrirPdf(id))}>
                Abrir PDF
              </Button>
            )}
            {f.acciones.includes('borrar') && (
              <Button variant="ghost" disabled={ocupado} onClick={() => correr(async () => (await api.borrar(id), navigate('/cotizaciones')))}>
                Eliminar
              </Button>
            )}
            {f.acciones.includes('editar') && (
              <Button variant="secondary" disabled={ocupado} onClick={() => navigate(`/cotizaciones/${id}/editar`)}>
                Editar
              </Button>
            )}
            {f.acciones.includes('enviar') && (
              <Button disabled={ocupado} onClick={accion(api.enviar)}>
                Generar PDF y archivar
              </Button>
            )}
            {f.acciones.includes('rechazar') && (
              <Button variant="ghost" disabled={ocupado} onClick={accion(api.rechazar)}>
                Rechazada
              </Button>
            )}
            {f.acciones.includes('aceptar') && (
              <>
                {f.moneda === 'USD' && (
                  <input
                    aria-label="Tipo de cambio"
                    type="number"
                    min={0}
                    step="0.0001"
                    placeholder="MXN por USD"
                    value={tipoCambio}
                    onChange={(e) => setTipoCambio(e.target.value)}
                    className="h-9 w-32 rounded-control border border-border-strong bg-surface-sunken px-2 font-mono text-[12px] text-on-surface"
                  />
                )}
                <Button disabled={ocupado} onClick={accion((id) => (f.moneda === 'USD' ? api.aceptar(id, Number(tipoCambio)) : api.aceptar(id)))}>
                  Aceptada
                </Button>
              </>
            )}
            {f.acciones.includes('aceptarTarde') && (
              <Button disabled={ocupado} onClick={() => setAceptandoTarde(true)}>
                Marcar como aceptada…
              </Button>
            )}
            {f.acciones.includes('cambiarContacto') && (
              <Button variant="secondary" disabled={ocupado} onClick={() => setCambiandoContacto(true)}>
                Cambiar contacto
              </Button>
            )}
            {f.acciones.includes('cancelar') && (
              <Button variant="ghost" disabled={ocupado} onClick={accion(api.cancelar)}>
                Cancelar cotización
              </Button>
            )}
          </div>
        )}
      </div>
      <Aviso error={error} />
      {cambiandoContacto && f && (
        <CambiarContacto<Ficha>
          entidad="cotizacion"
          id={id}
          contactoId={f.contactoId}
          onCerrar={() => setCambiandoContacto(false)}
          onCambiado={(nueva) => {
            setFicha(nueva)
            setCambiandoContacto(false)
          }}
        />
      )}

      {aceptandoTarde && f && (
        <AceptacionTardia
          ficha={f}
          onCerrar={() => setAceptandoTarde(false)}
          onAceptada={(nueva) => {
            setFicha(nueva)
            setAceptandoTarde(false)
          }}
        />
      )}

      {f && (
        <div className="g-split grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)] items-start gap-[18px]">
          <Seccion id="conceptos" titulo="Conceptos">
            <table className="tbl w-full border-collapse text-[13px]">
              <thead>
                <tr className={etiquetaCls}>
                  <th className={celdaCls}>Concepto</th>
                  <th className={celdaCls}>Cant.</th>
                  <th className={celdaCls}>Precio</th>
                  <th className={celdaCls}>Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {f.partidas.map((p, i) => (
                  <tr key={i}>
                    <td className={celdaCls}>
                      {p.concepto}
                      {p.recurrente && <span className="text-on-surface-muted"> · recurrente</span>}
                    </td>
                    <td className={celdaCls}>{p.cantidad}</td>
                    <td className={`${celdaCls} font-mono text-[12px]`}>{pesos(p.precio)}</td>
                    <td className={`${celdaCls} font-mono text-[12px]`}>{pesos(p.cantidad * p.precio)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Datos>
              <Fila label="Subtotal">{pesos(f.subtotal)}</Fila>
              <Fila label="IVA">{pesos(f.iva)}</Fila>
              <Fila label="Total">{pesos(f.total)}</Fila>
            </Datos>
            {f.costosEstimados.length > 0 && (
              <>
                <h3 className={`m-0 ${etiquetaCls}`}>Costos estimados (internos)</h3>
                <Datos>
                  {f.costosEstimados.map((e, i) => (
                    <Fila key={i} label={e.concepto}>
                      {pesos(e.monto)} · {e.categoria === 'msi' ? `${e.parcialidades} MSI` : NOMBRES_CATEGORIA_COSTO[e.categoria ?? 'unico']}
                    </Fila>
                  ))}
                </Datos>
              </>
            )}
          </Seccion>

          <Seccion id="datos" titulo="Datos">
            <Datos>
              <Fila label="Estado">{NOMBRES_ESTADO_COTIZACION[f.estado]}</Fila>
              <Fila label="Contacto">
                <Link to={`/contactos/${f.contactoId}`} className="text-primary-text">
                  {f.contacto}
                </Link>
              </Fila>
              <Fila label="Categoría">{NOMBRES_CATEGORIA[f.categoria]}</Fila>
              <Fila label="Fecha">{dia(f.fecha)}</Fila>
              <Fila label="Vigencia">{f.validezDias} días</Fila>
              <Fila label="Moneda">{f.moneda}</Fila>
              <Fila label="Facturación">
                {f.facturacion === 'parcialidades' ? `${f.parcialidades} parcialidades` : NOMBRES_FACTURACION[f.facturacion]}
              </Fila>
              {f.pdf && (
                <Fila label="PDF">
                  <span className="font-mono text-[12px] break-all">{f.pdf}</span>
                </Fila>
              )}
              {f.proyectoId !== null && (
                <Fila label="Proyecto">
                  <Link to={`/proyectos/${f.proyectoId}`} className="text-primary-text">
                    Ver proyecto
                  </Link>
                </Fila>
              )}
              {f.stack && <Fila label="Stack">{f.stack}</Fila>}
              {f.terminos && <Fila label="Términos">{f.terminos}</Fila>}
              {f.notas && <Fila label="Notas">{f.notas}</Fila>}
            </Datos>
          </Seccion>
        </div>
      )}
    </>
  )
}

const textoCls = 'm-0 text-[13px] text-on-surface-muted'
const NUEVO = 'nuevo'

/**
 * Aceptación tardía: the Contacto took an expirada or rechazada quote after all. One made in the app
 * is accepted as a sent one is, with its Plan de cobro dated today; an imported one records no money
 * (ADR-0002), only the Proyecto it led to. Closing the dialog writes nothing.
 */
function AceptacionTardia({ ficha, onAceptada, onCerrar }: { ficha: Ficha; onAceptada: (ficha: Ficha) => void; onCerrar: () => void }) {
  const [opciones, setOpciones] = useState<OpcionesAceptacionTardia | null>(null)
  const [proyecto, setProyecto] = useState(NUEVO)
  const [tipoCambio, setTipoCambio] = useState('')
  const { error, ocupado, correr } = useAccion()
  const api = window.dmm.cotizaciones

  useEffect(() => {
    correr(async () => setOpciones(await api.opcionesAceptarTarde(ficha.id)))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once per dialog
  }, [ficha.id])

  const usd = opciones?.moneda === 'USD'
  const aceptar = () =>
    correr(async () => {
      if (!opciones) return
      const eleccion = opciones.importado
        ? { proyectoId: proyecto === NUEVO ? ('nuevo' as const) : Number(proyecto) }
        : usd
          ? { tipoCambio: Number(tipoCambio) }
          : {}
      onAceptada(await api.aceptarTarde(ficha.id, eleccion))
    })

  return (
    <Dialogo id="aceptacion-tardia-titulo" titulo="Marcar como aceptada">
      {opciones && !opciones.importado && (
        <>
          <p className={textoCls}>
            Se registra como si se aceptara hoy: se crea el proyecto en curso con su carpeta, los ingresos pendientes y los costos estimados.
          </p>
          {usd && (
            <Campo label="Tipo de cambio">
              <input type="number" min={0} step="0.0001" placeholder="MXN por USD" value={tipoCambio} onChange={(e) => setTipoCambio(e.target.value)} className={campoCls} />
            </Campo>
          )}
        </>
      )}
      {opciones?.importado && (
        <>
          <Campo label="Proyecto">
            <select value={proyecto} onChange={(e) => setProyecto(e.target.value)} className={campoCls}>
              <option value={NUEVO}>Proyecto nuevo (completado)</option>
              {opciones.proyectos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre} · {NOMBRES_ESTADO_PROYECTO[p.estado]}
                </option>
              ))}
            </select>
          </Campo>
          <p className={textoCls}>
            Es una cotización importada: no se registran ingresos ni costos.
            {proyecto === NUEVO && ' El proyecto nuevo queda completado y no se puede cancelar después.'}
          </p>
        </>
      )}
      <Aviso error={error} />
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onCerrar}>
          Cancelar
        </Button>
        <Button disabled={ocupado || opciones === null || (usd && !opciones.importado && !tipoCambio)} onClick={aceptar}>
          Marcar como aceptada
        </Button>
      </div>
    </Dialogo>
  )
}
