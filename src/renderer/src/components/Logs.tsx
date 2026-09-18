import { useEffect, useState } from 'react'
import type { Corrida, EstadoImportacion, LogCarpetas, LogImportacion, RespuestaSugerencia, Sugerencia } from '../../../shared/dominio'
import { Aviso, Seccion, fecha, mensaje, useAccion } from './Seccion'
import { Button } from './ui/button'

/**
 * Configuración → Logs: what each import run found, and the Sugerencias de importación it
 * left. A rescan reports; it never merges silently. Each Sugerencia is answered once, and an
 * answered one is never asked again.
 */
export function Logs() {
  const api = window.dmm.importacion
  const [estado, setEstado] = useState<EstadoImportacion>({ facturas: null, carpetas: null })
  const [sugerencias, setSugerencias] = useState<Sugerencia[]>([])
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

  return (
    <Seccion id="logs" titulo="Logs">
      <div className="flex flex-wrap gap-2">
        <Button disabled={ocupado} onClick={() => importar(() => api.carpetas())}>
          Re-escanear carpetas
        </Button>
        <Button variant="secondary" disabled={ocupado} onClick={() => importar(() => api.facturas())}>
          Importar facturas
        </Button>
      </div>

      <Corridas estado={estado} />

      <h3 className="m-0 font-mono text-[10px] font-semibold tracking-[.12em] text-on-surface-muted uppercase">
        Sugerencias de importación
      </h3>
      {sugerencias.length === 0 ? (
        <p className="m-0 text-[13px] text-on-surface-muted">Sin sugerencias pendientes.</p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-1 p-0">
          {sugerencias.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-2 text-[13px]">
              <span className="min-w-0">
                {s.registro}
                {s.destino && <span className="text-on-surface-muted"> → {s.destino}</span>}
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
                    <Button disabled={ocupado} onClick={() => contestar(s.id, 'aceptada')}>
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
      {estado.carpetas && <CorridaVista titulo="Carpetas" corrida={estado.carpetas} lineas={lineasCarpetas(estado.carpetas.log)} />}
      {estado.facturas && <CorridaVista titulo="Facturas" corrida={estado.facturas} lineas={lineasFacturas(estado.facturas.log)} />}
    </div>
  )
}

function CorridaVista<L extends { errores: { archivo: string; error: string }[]; noDisponibles: string[] }>({
  titulo,
  corrida,
  lineas
}: {
  titulo: string
  corrida: Corrida<L>
  lineas: string[]
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
    </div>
  )
}

const lineasCarpetas = (l: LogCarpetas) => [
  `Cotizaciones: ${l.cotizaciones.importadas} importadas · ${l.cotizaciones.duplicadas} duplicadas`,
  `Contactos: ${l.contactos.creados} creados`,
  `Proyectos: ${l.proyectos.creados} creados · ${l.proyectos.actualizados} actualizados · ${l.proyectosSinCarpeta} sin carpeta`,
  `Sugerencias: ${l.sugerencias}`,
  `Disco externo: ${l.hddConectado ? 'conectado' : 'no conectado'}`
]

const lineasFacturas = (l: LogImportacion) => [
  `Facturas: ${l.importados} importadas · ${l.duplicados} duplicadas · ${l.ignorados} ignoradas`,
  `Sugerencias: ${l.sugerencias}`,
  ...(l.rfcsDesconocidos.length > 0 ? [`RFC sin Contacto: ${l.rfcsDesconocidos.join(', ')}`] : [])
]
