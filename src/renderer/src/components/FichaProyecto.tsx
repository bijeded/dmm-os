import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { NOMBRES_CATEGORIA, NOMBRES_ESTADO_PROYECTO, type FichaProyecto as Ficha } from '../../../shared/dominio'
import { dia, folioDmm, monto } from '../../../shared/formato'
import { pesos } from './Contactos'
import { NOMBRES_CARPETA } from './Proyectos'
import { Aviso, Datos, Fila, Seccion, useAccion } from './Seccion'
import { Button } from './ui/button'
import { tituloCls } from './estilos'

/** The Proyecto's record: its data, its folder, what is still owed and what can happen to it next. */
export function FichaProyecto() {
  const id = Number(useParams().id)
  const navigate = useNavigate()
  const [ficha, setFicha] = useState<Ficha | null>(null)
  const { error, ocupado, correr } = useAccion()

  useEffect(() => {
    correr(async () => setFicha(await window.dmm.proyectos.ficha(id)))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload only when the Proyecto changes
  }, [id])

  const api = window.dmm.proyectos
  const accion = (fn: (id: number) => Promise<Ficha>) => () => correr(async () => setFicha(await fn(id)))
  const f = ficha
  const puede = (a: Ficha['acciones'][number]) => f?.acciones.includes(a)
  const fecha = (d: string | null) => (d ? dia(d) : '—')

  return (
    <>
      <nav aria-label="Ruta" className="font-mono text-[10px] tracking-[.12em] text-on-surface-muted uppercase">
        <Link to="/proyectos" className="text-primary-text">
          Proyectos
        </Link>{' '}
        / {f?.referencia}
      </nav>
      <div className="acts flex flex-wrap items-center justify-between gap-3">
        <h1 className={tituloCls}>{f?.nombre || 'Proyecto'}</h1>
        {f && (
          <div className="flex flex-wrap gap-2">
            {f.carpeta.abrible && (
              <Button variant="secondary" disabled={ocupado} onClick={() => correr(() => api.abrirCarpeta(id))}>
                Abrir carpeta
              </Button>
            )}
            {puede('borrar') && (
              <Button variant="ghost" disabled={ocupado} onClick={() => correr(async () => (await api.borrar(id), navigate('/proyectos')))}>
                Eliminar
              </Button>
            )}
            {puede('editar') && (
              <Button variant="secondary" disabled={ocupado} onClick={() => navigate(`/proyectos/${id}/editar`)}>
                Editar
              </Button>
            )}
            {puede('pausar') && (
              <Button variant="secondary" disabled={ocupado} onClick={accion(api.pausar)}>
                Pausar
              </Button>
            )}
            {puede('reanudar') && (
              <Button variant="secondary" disabled={ocupado} onClick={accion(api.reanudar)}>
                Reanudar
              </Button>
            )}
            {(puede('completar') || f.falta) && (
              <Button disabled={ocupado || f.falta !== null} aria-describedby={f.falta ? 'sin-completar' : undefined} onClick={accion(api.completar)}>
                Completar
              </Button>
            )}
            {puede('cancelar') && (
              <Button variant="ghost" disabled={ocupado} onClick={accion(api.cancelar)}>
                Cancelar proyecto
              </Button>
            )}
          </div>
        )}
      </div>
      <Aviso error={error} />

      {f && (
        <div className="g-split grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)] items-start gap-[18px]">
          <Seccion id="datos" titulo="Datos">
            <Datos>
              <Fila label="Estado">{NOMBRES_ESTADO_PROYECTO[f.estado]}</Fila>
              <Fila label="Contacto">
                {f.contactoId !== null ? (
                  <Link to={`/contactos/${f.contactoId}`} className="text-primary-text">
                    {f.contacto}
                  </Link>
                ) : (
                  'Personal'
                )}
              </Fila>
              {f.clienteFinal && <Fila label="Cliente final">{f.clienteFinal}</Fila>}
              {f.cotizacionId !== null && (
                <Fila label="Cotización">
                  <Link to={`/cotizaciones/${f.cotizacionId}`} className="text-primary-text">
                    {f.folio ? folioDmm(f.folio) : 'Ver cotización'}
                  </Link>
                </Fila>
              )}
              <Fila label="Categoría">{NOMBRES_CATEGORIA[f.categoria]}</Fila>
              <Fila label="Inicio">{fecha(f.fechaInicio)}</Fila>
              <Fila label="Entrega">{fecha(f.fechaEntrega)}</Fila>
              {f.fechaFin && <Fila label="Fin">{fecha(f.fechaFin)}</Fila>}
              {f.notas && <Fila label="Notas">{f.notas}</Fila>}
            </Datos>
          </Seccion>

          <div className="flex flex-col gap-[18px]">
            <Seccion id="cobro" titulo="Cobro">
              <Datos>
                <Fila label="Cobrado">{pesos(f.cobrado)}</Fila>
                <Fila label="Por cobrar">{pesos(f.porCobrar)}</Fila>
              </Datos>
              {f.falta && (
                <p id="sin-completar" className="m-0 text-[13px] text-on-surface-muted">
                  Se completa cuando esté pagado por completo:{' '}
                  {[
                    f.falta.pendientes > 0 && `${f.falta.pendientes} ${f.falta.pendientes === 1 ? 'pago pendiente' : 'pagos pendientes'} por cobrar`,
                    f.falta.faltante > 0 && `faltan ${monto(f.falta.faltante, f.falta.moneda)} para el total de la cotización`
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                  .
                </p>
              )}
            </Seccion>
            <Seccion id="carpeta" titulo="Carpeta">
              <Datos>
                <Fila label="Ubicación">{NOMBRES_CARPETA[f.carpeta.estado]}</Fila>
                {f.carpeta.ruta && (
                  <Fila label="Ruta">
                    <span className="font-mono text-[12px] break-all">{f.carpeta.ruta}</span>
                  </Fila>
                )}
              </Datos>
            </Seccion>
          </div>
        </div>
      )}
    </>
  )
}
