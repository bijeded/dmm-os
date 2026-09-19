import { useEffect, useState } from 'react'
import type { EstadoRespaldos, MotivoRespaldo } from '../../../shared/dominio'
import { Aviso, Datos, Fila, Seccion, fecha, mensaje, useAccion } from './Seccion'
import { inputCls, monoCls } from './estilos'
import { Button } from './ui/button'

const motivos: Record<MotivoRespaldo, string> = {
  semanal: 'Semanal',
  migracion: 'Antes de migración',
  manual: 'Manual',
  'antes-de-restaurar': 'Antes de restaurar'
}

/** Configuración → Exportar: where the backups go, how often, and restoring from one. */
export function Exportar() {
  const api = window.dmm.respaldos
  const [estado, setEstado] = useState<EstadoRespaldos | null>(null)
  const [frecuencia, setFrecuencia] = useState('')
  const [conservar, setConservar] = useState('')
  const [confirmar, setConfirmar] = useState<{ path?: string } | null>(null)
  const { error, setError, ocupado, correr } = useAccion()

  const cargar = (e: EstadoRespaldos) => {
    setEstado(e)
    setFrecuencia(String(e.frecuenciaDias))
    setConservar(String(e.conservar))
  }

  useEffect(() => {
    api.estado().then(cargar, (e) => setError(mensaje(e)))
  }, [api, setError])

  const run = (fn: () => Promise<unknown>) =>
    correr(async () => {
      await fn()
      cargar(await api.estado())
    })

  return (
    <Seccion id="exportar" titulo="Exportar">
      {estado && (
        <>
          <Datos>
            <Fila label="Destino">
              <span className={monoCls}>{estado.dir}</span>
            </Fila>
            <Fila label={<label htmlFor="frecuencia">Frecuencia (días)</label>}>
              <input id="frecuencia" type="number" min={1} value={frecuencia} onChange={(e) => setFrecuencia(e.target.value)} className={inputCls} />
            </Fila>
            <Fila label={<label htmlFor="conservar">Respaldos a conservar</label>}>
              <input id="conservar" type="number" min={1} value={conservar} onChange={(e) => setConservar(e.target.value)} className={inputCls} />
            </Fila>
            <Fila label="Último respaldo">{estado.ultimo ? fecha(estado.ultimo) : 'Nunca'}</Fila>
          </Datos>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" disabled={ocupado} onClick={() => run(() => api.configurar({ frecuenciaDias: Number(frecuencia), conservar: Number(conservar) }))}>
              Guardar
            </Button>
            <Button disabled={ocupado} onClick={() => run(() => api.crear())}>
              Respaldar ahora
            </Button>
            <Button variant="ghost" disabled={ocupado} onClick={() => setConfirmar({})}>
              Restaurar desde archivo…
            </Button>
          </div>

          {confirmar && (
            <div className="flex flex-wrap items-center gap-3 rounded-control border border-border-strong p-3 text-[13px]">
              <span>Los datos actuales se reemplazarán (se respaldan antes) y la app se reiniciará.</span>
              <Button
                disabled={ocupado}
                onClick={() => {
                  const path = confirmar.path
                  setConfirmar(null)
                  run(() => api.restaurar(path))
                }}
              >
                Sí, restaurar
              </Button>
              <Button variant="ghost" onClick={() => setConfirmar(null)}>
                Cancelar
              </Button>
            </div>
          )}

          <ul className="m-0 flex list-none flex-col gap-1 p-0">
            {estado.respaldos.map((r) => (
              <li key={r.path} className="flex items-center justify-between gap-3 border-t border-border pt-2 text-[13px]">
                <span>
                  {fecha(r.creadoEn)} <span className="text-on-surface-muted">· {motivos[r.motivo]} · {Math.ceil(r.bytes / 1024)} KB</span>
                </span>
                <Button variant="ghost" disabled={ocupado} onClick={() => setConfirmar({ path: r.path })}>
                  Restaurar
                </Button>
              </li>
            ))}
          </ul>
        </>
      )}
      <Aviso error={error} />
    </Seccion>
  )
}
