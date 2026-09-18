import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { NOMBRES_ESTADO_CONTACTO, type FichaContacto as Ficha, type Movimiento } from '../../../shared/ipc'
import { dia } from '../../../shared/formato'
import { celdaCls, etiquetaCls, pesos, tituloCls } from './Contactos'
import { Aviso, Datos, Fila, Seccion, useAccion } from './Seccion'
import { Button } from './ui/button'

const tipos: Record<Movimiento['tipo'], string> = { cotizacion: 'Cotización', proyecto: 'Proyecto', pago: 'Pago' }
const filtros = [
  ['todo', 'Todo'],
  ['cotizacion', 'Cotizaciones'],
  ['proyecto', 'Proyectos'],
  ['pago', 'Pagos']
] as const

const estados: Record<string, string> = {
  borrador: 'Borrador',
  enviada: 'Enviada',
  aceptada: 'Aceptada',
  rechazada: 'Rechazada',
  cancelada: 'Cancelada',
  expirada: 'Expirada',
  en_curso: 'En curso',
  pausado: 'Pausado',
  completado: 'Completado',
  cancelado: 'Cancelado',
  pendiente: 'Pendiente',
  pagado: 'Cobrado',
  incobrable: 'Incobrable'
}

// Dates are stored as 'YYYY-MM-DD'; read them as that calendar day, not as UTC midnight.

/** Ficha de contacto: the Contacto's data, its complete history and its files in `Clientes/`. */
export function FichaContacto() {
  const id = Number(useParams().id)
  const navigate = useNavigate()
  const [ficha, setFicha] = useState<Ficha | null>(null)
  const [filtro, setFiltro] = useState<(typeof filtros)[number][0]>('todo')
  const [confirmar, setConfirmar] = useState(false)
  const { error, ocupado, correr } = useAccion()

  useEffect(() => {
    correr(async () => setFicha(await window.dmm.contactos.ficha(id)))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload only when the Contacto changes
  }, [id])

  const eliminar = () => {
    setConfirmar(false)
    correr(async () => {
      await window.dmm.contactos.borrar(id)
      navigate('/contactos')
    })
  }

  const c = ficha?.contacto
  const historial = ficha?.historial.filter((m) => filtro === 'todo' || m.tipo === filtro) ?? []
  const conversion = ficha && ficha.cotizaciones.total > 0 ? Math.round((ficha.cotizaciones.aceptadas / ficha.cotizaciones.total) * 100) : 0

  return (
    <>
      <nav aria-label="Ruta" className="font-mono text-[10px] tracking-[.12em] text-on-surface-muted uppercase">
        <Link to="/contactos" className="text-primary-text">
          Contactos
        </Link>{' '}
        / {c?.nombre}
      </nav>
      <div className="acts flex flex-wrap items-center justify-between gap-3">
        <h1 className={tituloCls}>{c?.nombre ?? 'Contacto'}</h1>
        {ficha && (
          <Button variant="secondary" disabled={ocupado} onClick={() => setConfirmar(true)}>
            Eliminar
          </Button>
        )}
      </div>
      <Aviso error={error} />

      {confirmar && c && (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/60 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="eliminar-titulo"
            className="card flex w-full max-w-md flex-col gap-4 rounded-control border border-border-strong bg-surface-raised p-6"
          >
            <h2 id="eliminar-titulo" className="m-0 text-[15px] font-semibold text-on-surface">
              ¿Eliminar a {c.nombre}?
            </h2>
            <p className="m-0 text-[13px] text-on-surface-muted">
              Solo se puede eliminar un contacto sin cotizaciones, proyectos ni pagos. Esto no se puede deshacer; los archivos en disco no se tocan.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setConfirmar(false)}>
                Cancelar
              </Button>
              <Button onClick={eliminar}>Sí, eliminar</Button>
            </div>
          </div>
        </div>
      )}

      {ficha && c && (
        <>
          <div className="g-2 grid grid-cols-2 items-start gap-[18px]">
            <Seccion id="datos" titulo="Datos">
              <Datos>
                <Fila label="Estado">{NOMBRES_ESTADO_CONTACTO[ficha.estado]}</Fila>
                <Fila label="Registrado">{dia(c.creadoEn)}</Fila>
                {c.empresa && <Fila label="Empresa">{c.empresa}</Fila>}
                <Fila label="Email">{c.email ?? '—'}</Fila>
                <Fila label="Teléfono">{c.telefono ?? '—'}</Fila>
                {c.rfc && <Fila label="RFC">{c.rfc}</Fila>}
                {c.direccion && <Fila label="Dirección">{c.direccion}</Fila>}
                <Fila label="Valor total">{pesos(ficha.valor)}</Fila>
                <Fila label="Por cobrar">{pesos(ficha.porCobrar)}</Fila>
                <Fila label="Proyectos">{ficha.proyectos}</Fila>
                <Fila label="Cotizaciones">{`${ficha.cotizaciones.total} · ${conversion}% conversión`}</Fila>
              </Datos>
            </Seccion>
            <Seccion id="notas" titulo="Notas">
              <p className="m-0 text-[13px] whitespace-pre-wrap">{c.notas || 'Sin notas.'}</p>
            </Seccion>
          </div>

          <Seccion id="historial" titulo="Historial">
            <div role="tablist" aria-label="Filtrar historial" className="flex gap-1">
              {filtros.map(([valor, label]) => (
                <Button key={valor} role="tab" aria-selected={filtro === valor} variant={filtro === valor ? 'secondary' : 'ghost'} onClick={() => setFiltro(valor)}>
                  {label}
                </Button>
              ))}
            </div>
            <table aria-label="Historial" className="tbl w-full border-collapse text-[13px]">
              <thead>
                <tr className={etiquetaCls}>
                  <th className={celdaCls}>Fecha</th>
                  <th className={celdaCls}>Tipo</th>
                  <th className={celdaCls}>Ref.</th>
                  <th className={celdaCls}>Detalle</th>
                  <th className={`${celdaCls} text-right`}>Monto</th>
                  <th className={celdaCls}>Estado</th>
                </tr>
              </thead>
              <tbody>
                {historial.map((m) => (
                  <tr key={`${m.tipo}-${m.id}`}>
                    <td data-label="Fecha" className={`${celdaCls} font-mono text-[12px]`}>
                      {dia(m.fecha)}
                    </td>
                    <td data-label="Tipo" className={celdaCls}>
                      {tipos[m.tipo]}
                    </td>
                    <td data-label="Ref." className={`${celdaCls} font-mono text-[12px]`}>
                      {m.referencia ?? '—'}
                    </td>
                    <td data-label="Detalle" className={celdaCls}>
                      {m.detalle}
                    </td>
                    <td data-label="Monto" className={`${celdaCls} text-right font-mono text-[12px]`}>
                      {m.monto === null ? '—' : pesos(m.monto)}
                    </td>
                    <td data-label="Estado" className={celdaCls}>
                      {estados[m.estado] ?? m.estado}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {historial.length === 0 && <p className="m-0 text-[13px] text-on-surface-muted">Nada que mostrar.</p>}
          </Seccion>

          <Seccion id="archivos" titulo="Archivos">
            {ficha.carpeta ? (
              <>
                <p className="m-0 text-[12px] text-on-surface-muted">
                  <span className="font-mono text-on-surface">{ficha.carpeta}/</span> · Archivos existentes en disco · solo lectura
                </p>
                <table aria-label="Archivos" className="tbl w-full border-collapse text-[13px]">
                  <thead>
                    <tr className={etiquetaCls}>
                      <th className={celdaCls}>Nombre</th>
                      <th className={celdaCls}>Tipo</th>
                      <th className={celdaCls}>Modificado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ficha.archivos.map((a) => (
                      <tr key={a.nombre}>
                        <td data-label="Nombre" className={celdaCls}>
                          {a.tipo === 'Carpeta' ? `${a.nombre}/` : a.nombre}
                        </td>
                        <td data-label="Tipo" className={`${celdaCls} font-mono text-[12px]`}>
                          {a.tipo}
                        </td>
                        <td data-label="Modificado" className={`${celdaCls} font-mono text-[12px]`}>
                          {dia(a.modificado)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            ) : (
              <p className="m-0 text-[13px] text-on-surface-muted">No hay carpeta en Clientes/ para este contacto.</p>
            )}
          </Seccion>
        </>
      )}
    </>
  )
}
