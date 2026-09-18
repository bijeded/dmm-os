import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { NOMBRES_CATEGORIA, NOMBRES_CATEGORIA_COSTO, NOMBRES_ESTADO_COTIZACION, NOMBRES_FACTURACION, type FichaCotizacion as Ficha } from '../../../shared/ipc'
import { folioDmm } from '../../../shared/formato'
import { celdaCls, etiquetaCls, pesos, tituloCls } from './Contactos'
import { dia } from './Cotizaciones'
import { Aviso, Datos, Fila, Seccion, useAccion } from './Seccion'
import { Button } from './ui/button'

/** The quote's record: its data, its PDF and what can happen to it next. */
export function FichaCotizacion() {
  const id = Number(useParams().id)
  const navigate = useNavigate()
  const [ficha, setFicha] = useState<Ficha | null>(null)
  const [tipoCambio, setTipoCambio] = useState('')
  const { error, ocupado, correr } = useAccion()

  useEffect(() => {
    correr(async () => setFicha(await window.dmm.cotizaciones.ficha(id)))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload only when the quote changes
  }, [id])

  const accion = (fn: (id: number) => Promise<Ficha>) => () => correr(async () => setFicha(await fn(id)))
  const api = window.dmm.cotizaciones
  const f = ficha

  return (
    <>
      <nav aria-label="Ruta" className="font-mono text-[10px] tracking-[.12em] text-on-surface-muted uppercase">
        <Link to="/cotizaciones" className="text-primary-text">
          Cotizaciones
        </Link>{' '}
        / {f?.folio ? folioDmm(f.folio) : 'Borrador'}
      </nav>
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
            {f.acciones.includes('cancelar') && (
              <Button variant="ghost" disabled={ocupado} onClick={accion(api.cancelar)}>
                Cancelar cotización
              </Button>
            )}
          </div>
        )}
      </div>
      <Aviso error={error} />

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
                    <td className={celdaCls}>{p.concepto}</td>
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
