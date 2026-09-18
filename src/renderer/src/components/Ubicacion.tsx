import { useEffect, useState } from 'react'
import type { Rutas } from '../../../shared/dominio'
import { Aviso, Datos, Fila, Seccion, mensaje, monoCls, useAccion } from './Seccion'
import { Button } from './ui/button'

/**
 * Configuración → Ubicación: the folders the app reads. The external HDD is a secondary
 * source, usually disconnected; while it is absent its Proyectos are No disponible, never
 * lost. `Entrada/` is the inbox of loose files, counted here and opened in Finder.
 */
export function Ubicacion() {
  const api = window.dmm.rutas
  const [rutas, setRutas] = useState<Rutas | null>(null)
  const { error, setError, ocupado, correr } = useAccion()

  useEffect(() => {
    api.leer().then(setRutas, (e) => setError(mensaje(e)))
  }, [api, setError])

  // Every action answers with the rutas as they are afterwards, except opening a folder.
  const run = (fn: () => Promise<Rutas | void>) =>
    correr(async () => {
      const r = await fn()
      if (r) setRutas(r)
    })

  return (
    <Seccion id="ubicacion" titulo="Ubicación">
      {rutas && (
        <>
          <Datos>
            <Fila label="Carpeta DMM OS">
              <span className={monoCls}>{rutas.dmmOsRoot}</span>
            </Fila>
            <Fila label="Disco externo">
              {rutas.hddRoot ? (
                <span className={monoCls}>
                  {rutas.hddRoot} <span className="text-on-surface-muted">· {rutas.hddConectado ? 'Conectado' : 'No conectado'}</span>
                </span>
              ) : (
                <span className="text-on-surface-muted text-[13px]">Sin disco externo</span>
              )}
            </Fila>
            <Fila label="Entrada">
              {rutas.entrada === null ? (
                <span className="text-on-surface-muted text-[13px]">No disponible</span>
              ) : (
                <span className="text-[13px]">
                  <span className="font-mono">{rutas.entrada}</span> <span className="text-on-surface-muted">sin clasificar</span>
                </span>
              )}
            </Fila>
          </Datos>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" disabled={ocupado} onClick={() => run(() => api.elegirHdd())}>
              Elegir disco externo…
            </Button>
            {rutas.hddRoot && (
              <Button variant="ghost" disabled={ocupado} onClick={() => run(() => api.olvidarHdd())}>
                Olvidar disco externo
              </Button>
            )}
            <Button variant="ghost" disabled={ocupado} onClick={() => run(() => api.abrir('raiz'))}>
              Abrir carpeta DMM OS
            </Button>
            <Button variant="ghost" disabled={ocupado} onClick={() => run(() => api.abrir('entrada'))}>
              Abrir Entrada
            </Button>
          </div>
        </>
      )}
      <Aviso error={error} />
    </Seccion>
  )
}
