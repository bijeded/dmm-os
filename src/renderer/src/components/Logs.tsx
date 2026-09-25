import { useEffect, useState, type ReactNode } from 'react'
import type {
  Bloqueo,
  CambioFactura,
  Corrida,
  EstadoImportacion,
  LogCarpetas,
  LogImportacion,
  OrigenImportado,
  ProblemaFilaMapa,
  RespuestaSugerencia,
  RegistroAMano,
  Sugerencia,
  VistaPreviaDesdeCero
} from '../../../shared/dominio'
import { dia, pesos } from '../../../shared/formato'
import { Aviso, Seccion, fecha, mensaje, useAccion } from './Seccion'
import { campoCls } from './estilos'
import { Button } from './ui/button'

/**
 * Configuración → Logs: what each import run found, and the Sugerencias de importación it
 * left. A rescan reports; it never merges silently. Each Sugerencia is answered once, with its
 * guess or another of its opciones, and an answered one is never asked again.
 */
export function Logs() {
  const api = window.dmm.importacion
  const [estado, setEstado] = useState<EstadoImportacion>({ facturas: null, carpetas: null })
  const [sugerencias, setSugerencias] = useState<Sugerencia[]>([])
  const [vista, setVista] = useState<LogCarpetas | null>(null)
  const [desdeCero, setDesdeCero] = useState<VistaPreviaDesdeCero | null>(null)
  const [confirmar, setConfirmar] = useState(false)
  const [rechazo, setRechazo] = useState<Bloqueo[]>([])
  const { error, setError, ocupado, correr } = useAccion()

  useEffect(() => {
    Promise.all([api.estado(), api.sugerencias()]).then(([e, s]) => {
      setEstado(e)
      setSugerencias(s)
    }, (e) => setError(mensaje(e)))
  }, [api, setError])

  const importar = (fn: () => Promise<unknown>) =>
    correr(async () => {
      await fn()
      setEstado(await api.estado())
      setSugerencias(await api.sugerencias())
    })

  const contestar = (id: number, respuesta: RespuestaSugerencia) =>
    correr(async () => setSugerencias(await api.responder(id, respuesta)))

  // The opción picked on each row, by Sugerencia id. A pick the refreshed list no longer offers
  // falls back to the guess, so the selector never holds an id it cannot send.
  const [elegidas, setElegidas] = useState<Record<number, number>>({})
  const sugeridaDe = (s: Sugerencia) => s.opciones.find((o) => o.sugerida)?.id
  const elegidaDe = (s: Sugerencia) =>
    s.opciones.some((o) => o.id === elegidas[s.id]) ? elegidas[s.id] : sugeridaDe(s)
  const aceptar = (s: Sugerencia) => {
    const elegida = elegidaDe(s)
    contestar(s.id, elegida === undefined || elegida === sugeridaDe(s) ? 'aceptada' : { elegidas: [elegida] })
  }

  // A real scan makes the last preview stale.
  const escanear = () => importar(async () => {
    setVista(null)
    setDesdeCero(null)
    await api.carpetas()
  })
  const previsualizar = () => correr(async () => setVista(await api.vistaPrevia()))
  const previsualizarDesdeCero = () => correr(async () => setDesdeCero(await api.vistaPreviaDesdeCero()))
  const reimportar = () => {
    setConfirmar(false)
    setRechazo([])
    importar(async () => {
      const r = await api.reimportar()
      if (!r.reimportado) return setRechazo(r.bloqueos)
      setVista(null)
      setDesdeCero(null)
    })
  }
  const aceptarTodas = () => correr(async () => setSugerencias(await api.aceptarVincular()))

  return (
    <Seccion id="logs" titulo="Logs">
      <div className="flex flex-wrap gap-2">
        <Button disabled={ocupado} onClick={escanear}>
          Re-escanear carpetas
        </Button>
        <Button variant="secondary" disabled={ocupado} onClick={previsualizar}>
          Vista previa
        </Button>
        <Button variant="secondary" disabled={ocupado} onClick={previsualizarDesdeCero}>
          Vista previa desde cero
        </Button>
        <Button variant="secondary" disabled={ocupado} onClick={() => importar(() => api.facturas())}>
          Importar facturas
        </Button>
        <Button variant="ghost" className="text-error-text" disabled={ocupado} onClick={() => setConfirmar(true)}>
          Reimportar desde cero
        </Button>
      </div>

      {confirmar && (
        <div className="flex flex-wrap items-center gap-3 rounded-control border border-border-strong p-3 text-[13px]">
          <span>
            Se quitarán todos los Contactos, Cotizaciones, Proyectos, Ingresos y Costos que hizo la importación, y se volverán a
            importar. Las respuestas a las Sugerencias de importación y las ediciones a registros importados se pierden. Antes se toma
            un respaldo.
          </span>
          <Button disabled={ocupado} onClick={reimportar}>
            Sí, reimportar
          </Button>
          <Button variant="ghost" onClick={() => setConfirmar(false)}>
            Cancelar
          </Button>
        </div>
      )}
      {rechazo.length > 0 && <Bloqueos titulo="No se puede reimportar desde cero:" bloqueos={rechazo} alerta />}

      {vista && <VistaPrevia log={vista} />}
      {desdeCero && (
        <>
          {desdeCero.bloqueos.length > 0 && <Bloqueos titulo="Reimportar desde cero se rechazaría:" bloqueos={desdeCero.bloqueos} />}
          <VistaPrevia titulo="Desde cero" log={desdeCero.log} />
        </>
      )}

      <Corridas estado={estado} />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="m-0 font-mono text-[10px] font-semibold tracking-[.12em] text-on-surface-muted uppercase">
          Sugerencias de importación
        </h3>
        {sugerencias.some((s) => s.accion === 'vincular') && (
          <Button variant="secondary" disabled={ocupado} onClick={aceptarTodas}>
            Aceptar todas
          </Button>
        )}
      </div>
      {sugerencias.length === 0 ? (
        <p className="m-0 text-[13px] text-on-surface-muted">Sin sugerencias pendientes.</p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-1 p-0">
          {sugerencias.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-2 text-[13px]">
              <span className="min-w-0">
                {s.registro}
                {s.opciones.length > 1 ? (
                  <span className="text-on-surface-muted">
                    {' → '}
                    <select
                      aria-label={`${s.accion === 'fusionar' ? 'Fusionar con' : 'Vincular a'} (${s.registro})`}
                      value={elegidaDe(s) ?? ''}
                      onChange={(e) => setElegidas({ ...elegidas, [s.id]: Number(e.target.value) })}
                      disabled={ocupado}
                      className={campoCls}
                    >
                      {s.opciones.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.nombre}
                        </option>
                      ))}
                    </select>
                  </span>
                ) : (
                  s.destino && <span className="text-on-surface-muted"> → {s.destino}</span>
                )}
                <span className="block text-on-surface-muted">{s.motivo}</span>
              </span>
              <span className="flex gap-2">
                {s.accion === 'ubicacion' ? (
                  <>
                    <Button disabled={ocupado} onClick={() => contestar(s.id, 'aceptada')}>
                      Archivado
                    </Button>
                    <Button variant="secondary" disabled={ocupado} onClick={() => contestar(s.id, 'rechazada')}>
                      No disponible
                    </Button>
                  </>
                ) : (
                  <>
                    <Button disabled={ocupado} onClick={() => aceptar(s)}>
                      Aceptar
                    </Button>
                    <Button variant="ghost" disabled={ocupado} onClick={() => contestar(s.id, 'rechazada')}>
                      Rechazar
                    </Button>
                  </>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
      <Aviso error={error} />
    </Seccion>
  )
}

function Corridas({ estado }: { estado: EstadoImportacion }) {
  if (!estado.carpetas && !estado.facturas) {
    return <p className="m-0 text-[13px] text-on-surface-muted">Sin ejecuciones en esta sesión.</p>
  }
  return (
    <div className="flex flex-col gap-3">
      {estado.carpetas && (
        <CorridaVista titulo="Carpetas" corrida={estado.carpetas} lineas={lineasCarpetas(estado.carpetas.log)}>
          <DetalleMapa log={estado.carpetas.log} />
        </CorridaVista>
      )}
      {estado.facturas && (
        <CorridaVista titulo="Facturas" corrida={estado.facturas} lineas={lineasFacturas(estado.facturas.log)}>
          <CambiosFacturas log={estado.facturas.log} />
        </CorridaVista>
      )}
    </div>
  )
}

function CorridaVista<L extends { errores: { archivo: string; error: string }[]; noDisponibles: string[] }>({
  titulo,
  corrida,
  lineas,
  children
}: {
  titulo: string
  corrida: Corrida<L>
  lineas: string[]
  children?: ReactNode
}) {
  return (
    <div className="flex flex-col gap-1 border-t border-border pt-2 text-[13px]">
      <span className="text-on-surface-muted">
        {titulo} · {fecha(corrida.corridoEn)}
      </span>
      {lineas.map((l) => (
        <span key={l}>{l}</span>
      ))}
      {corrida.log.noDisponibles.map((n) => (
        <span key={n} className="text-on-surface-muted">
          No disponible: {n}
        </span>
      ))}
      {corrida.log.errores.map((e) => (
        <span key={e.archivo} className="text-error-text">
          {e.archivo}: {e.error}
        </span>
      ))}
      {children}
    </div>
  )
}

const ORIGENES: Record<OrigenImportado, string> = {
  clientes: 'Clientes/',
  proyectos: 'Proyectos/',
  cotizacion: 'Cotizaciones',
  mapa: 'Mapa de nombres'
}

const PROBLEMAS: Record<ProblemaFilaMapa, string> = {
  'sin uso': 'no coincide con nada en disco',
  incompleta: 'incompleta: falta "contacto", o "en disco" y "rfc"',
  duplicada: 'repite "en disco" de una fila anterior',
  'rfc invalido': 'RFC inválido',
  'rfc generico': 'RFC genérico',
  'rfc de otro contacto': 'el RFC ya es de otro Contacto',
  'contacto con otro rfc': 'el Contacto ya tiene otro RFC'
}

const A_MANO: Record<RegistroAMano, [string, string]> = {
  contacto: ['Contacto creado en la app', 'Contactos creados en la app'],
  cotizacion: ['Cotización creada en la app', 'Cotizaciones creadas en la app'],
  proyecto: ['Proyecto creado en la app', 'Proyectos creados en la app'],
  ingreso: ['Ingreso registrado a mano', 'Ingresos registrados a mano'],
  costo: ['Costo registrado a mano', 'Costos registrados a mano'],
  definicion_ingreso: ['Ingreso recurrente definido', 'Ingresos recurrentes definidos'],
  definicion_costo: ['Costo recurrente definido', 'Costos recurrentes definidos']
}

const textoBloqueo = (b: Bloqueo) => {
  if (b.motivo === 'a_mano') return `${b.cantidad} ${A_MANO[b.registro][b.cantidad === 1 ? 0 : 1]}`
  if (b.motivo === 'mapa') return b.error
  return `Conecta el disco externo (${b.ruta}): sus Proyectos no se volverían a importar.`
}

/** Why Reimportar desde cero is refused, one line per kind of record with its count. */
function Bloqueos({ titulo, bloqueos, alerta = false }: { titulo: string; bloqueos: Bloqueo[]; alerta?: boolean }) {
  return (
    <div role={alerta ? 'alert' : undefined} className="flex flex-col gap-1 text-[13px] text-error-text">
      <span>{titulo}</span>
      <ul className="m-0 flex list-disc flex-col gap-0.5 pl-5">
        {bloqueos.map((b) => (
          <li key={textoBloqueo(b)}>{textoBloqueo(b)}</li>
        ))}
      </ul>
    </div>
  )
}

/**
 * Vista previa: what a real scan would add to the database as it is now, or, desde cero, what
 * Reimportar desde cero would create. Nothing of it was saved, and it never replaces the last
 * real run below.
 */
function VistaPrevia({ log, titulo }: { log: LogCarpetas; titulo?: string }) {
  const { contactos, proyectos, rfcs } = log.nuevos
  return (
    <div className="flex flex-col gap-1 border-t border-border pt-2 text-[13px]">
      <span className="text-on-surface-muted">Vista previa{titulo && ` · ${titulo}`} · Nada se guardó.</span>
      {typeof log.mapa !== 'object' && (
        <>
          {lineasCarpetas(log).map((l) => (
            <span key={l}>{l}</span>
          ))}
          <PorOrigen titulo="Contactos nuevos" items={contactos.map((c) => ({ texto: c.nombre, origen: c.origen }))} />
          <PorOrigen
            titulo="Proyectos nuevos"
            items={proyectos.map((p) => ({ texto: `${p.nombre} (${p.contacto})`, origen: p.origen }))}
          />
          {rfcs.length > 0 && <span>RFC a asignar: {rfcs.map((r) => `${r.contacto} ${r.rfc}`).join(', ')}</span>}
          {log.noDisponibles.map((n) => (
            <span key={n} className="text-on-surface-muted">
              No disponible: {n}
            </span>
          ))}
          {log.errores.map((e) => (
            <span key={e.archivo} className="text-error-text">
              {e.archivo}: {e.error}
            </span>
          ))}
        </>
      )}
      <DetalleMapa log={log} />
    </div>
  )
}

function PorOrigen({ titulo, items }: { titulo: string; items: { texto: string; origen: OrigenImportado }[] }) {
  const origenes = (Object.keys(ORIGENES) as OrigenImportado[]).filter((o) => items.some((i) => i.origen === o))
  return origenes.map((o) => {
    const deOrigen = items.filter((i) => i.origen === o)
    return (
      <span key={`${titulo}-${o}`}>
        <span className="text-on-surface-muted">
          {titulo} · {ORIGENES[o]} ({deOrigen.length}):
        </span>{' '}
        {deOrigen.map((i) => i.texto).join(', ')}
      </span>
    )
  })
}

/** What the Mapa de nombres did not apply, and the subfolders left out because of it. */
function DetalleMapa({ log }: { log: LogCarpetas }) {
  return (
    <>
      {typeof log.mapa === 'object' && <span className="text-error-text">{log.mapa.error}</span>}
      {log.filasMapa.map((f) => (
        <span key={`${f.linea}-${f.problema}`} className="text-error-text">
          Mapa de nombres, línea {f.linea}
          {f.enDisco && ` (${f.enDisco})`}: {PROBLEMAS[f.problema]}
        </span>
      ))}
      {log.subcarpetasSinProyecto.map((s) => (
        <span key={s} className="text-on-surface-muted">
          Subcarpeta sin Proyecto: {s}
        </span>
      ))}
    </>
  )
}

const lineasCarpetas = (l: LogCarpetas) => [
  `Cotizaciones: ${l.cotizaciones.importadas} importadas · ${l.cotizaciones.duplicadas} duplicadas`,
  `Contactos: ${l.contactos.creados} creados`,
  `Proyectos: ${l.proyectos.creados} creados · ${l.proyectos.actualizados} actualizados · ${l.proyectosSinCarpeta} sin carpeta`,
  `Sugerencias: ${l.sugerencias}`,
  `Disco externo: ${l.hddConectado ? 'conectado' : 'no conectado'}`
]

const MOTIVOS: Record<CambioFactura['motivo'], string> = {
  cancelada: 'en una carpeta de canceladas',
  sustituida: 'sustituida por otro CFDI',
  pagos: 'según sus complementos de pago',
  editado: 'editado a mano',
  reembolso: 'tiene un reembolso',
  complementos: 'sus complementos de pago ya no cuadran con las parcialidades pagadas'
}

const CAMBIOS: [keyof LogImportacion['cambios'], string][] = [
  ['cancelados', 'Canceladas'],
  ['refechados', 'Fecha de pago corregida'],
  ['divididos', 'Divididas en parcialidades'],
  ['intactos', 'Sin cambiar']
]

/** The Ingresos and Costos an earlier run imported that this run corrected, or left alone and why. */
function CambiosFacturas({ log }: { log: LogImportacion }) {
  return (
    <>
      {CAMBIOS.filter(([k]) => log.cambios[k].length > 0).map(([k, titulo]) => (
        <span key={k}>
          <span className="text-on-surface-muted">
            {titulo} ({log.cambios[k].length}):
          </span>{' '}
          {log.cambios[k]
            .map((c) => `${c.entidad === 'ingreso' ? 'Ingreso' : 'Costo'} ${c.id} · ${c.fecha ? dia(c.fecha) : 'sin fecha'} · ${pesos(c.total)} (${MOTIVOS[c.motivo]})`)
            .join('; ')}
        </span>
      ))}
      {log.noCfdi.map((a) => (
        <span key={a} className="text-on-surface-muted">
          No es CFDI: {a}
        </span>
      ))}
    </>
  )
}

const lineasFacturas = (l: LogImportacion) => [
  `Facturas: ${l.importados} importadas · ${l.duplicados} duplicadas · ${l.ignorados} ignoradas`,
  `Omitidas: ${l.cancelados} canceladas · ${l.sustituidos} sustituidas · ${l.noCfdi.length} no son CFDI`,
  `Recibidas: ${l.recibidas} leídas, no importadas (los costos se capturan en Finanzas)`,
  `Sugerencias: ${l.sugerencias}`,
  ...(l.rfcsDesconocidos.length > 0 ? [`RFC sin Contacto: ${l.rfcsDesconocidos.join(', ')}`] : []),
  ...l.ivasInusuales.map((f) => `IVA inusual (${f.tasa}%): ${f.archivo}`)
]
