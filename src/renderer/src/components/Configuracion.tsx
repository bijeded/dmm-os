import { useEffect, useState, type ReactNode } from 'react'
import type { EstadoRespaldos } from '../../../shared/ipc'
import { Button } from './ui/button'

const fecha = (iso: string) => new Date(iso).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })

const motivos: Record<string, string> = {
  semanal: 'Semanal',
  migracion: 'Antes de migración',
  manual: 'Manual',
  'antes-de-restaurar': 'Antes de restaurar'
}

// Electron wraps main-process errors as "Error invoking remote method '…': Error: <message>".
const mensaje = (e: unknown) => String(e instanceof Error ? e.message : e).replace(/^.*Error: /, '')

export function Configuracion() {
  const api = window.dmm.respaldos
  const [estado, setEstado] = useState<EstadoRespaldos | null>(null)
  const [frecuencia, setFrecuencia] = useState('')
  const [conservar, setConservar] = useState('')
  const [confirmar, setConfirmar] = useState<{ path?: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)

  const cargar = (e: EstadoRespaldos) => {
    setEstado(e)
    setFrecuencia(String(e.frecuenciaDias))
    setConservar(String(e.conservar))
  }

  useEffect(() => {
    api.estado().then(cargar, (e) => setError(mensaje(e)))
  }, [api])

  const run = async (fn: () => Promise<unknown>) => {
    setError(null)
    setOcupado(true)
    try {
      await fn()
      cargar(await api.estado())
    } catch (e) {
      setError(mensaje(e))
    } finally {
      setOcupado(false)
    }
  }

  return (
    <>
      <h1 className="m-0 font-display text-[29px] leading-[1.22] font-bold tracking-[-.01em] text-on-surface uppercase">Configuración</h1>
      <section className="card flex flex-col gap-4 rounded-control border border-border p-6" aria-labelledby="exportar">
        <h2 id="exportar" className="m-0 font-mono text-[10px] font-semibold tracking-[.12em] text-on-surface-muted uppercase">
          Exportar
        </h2>
        {estado && (
          <>
            <dl className="m-0 grid grid-cols-[180px_1fr] items-center gap-x-4 gap-y-3 text-[13px]">
              <Fila label="Destino">
                <span className="font-mono text-[12px] break-all">{estado.dir}</span>
              </Fila>
              <Fila label={<label htmlFor="frecuencia">Frecuencia (días)</label>}>
                <input id="frecuencia" type="number" min={1} value={frecuencia} onChange={(e) => setFrecuencia(e.target.value)} className={inputCls} />
              </Fila>
              <Fila label={<label htmlFor="conservar">Respaldos a conservar</label>}>
                <input id="conservar" type="number" min={1} value={conservar} onChange={(e) => setConservar(e.target.value)} className={inputCls} />
              </Fila>
              <Fila label="Último respaldo">{estado.ultimo ? fecha(estado.ultimo) : 'Nunca'}</Fila>
            </dl>
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
                    {fecha(r.creadoEn)} <span className="text-on-surface-muted">· {motivos[r.motivo] ?? r.motivo} · {Math.ceil(r.bytes / 1024)} KB</span>
                  </span>
                  <Button variant="ghost" disabled={ocupado} onClick={() => setConfirmar({ path: r.path })}>
                    Restaurar
                  </Button>
                </li>
              ))}
            </ul>
          </>
        )}
        {error && (
          <p role="alert" className="m-0 text-[13px] text-error-text">
            {error}
          </p>
        )}
      </section>
    </>
  )
}

const inputCls = 'h-9 w-24 rounded-control border border-border-strong bg-surface-sunken px-2 font-mono text-[12px] text-on-surface'

function Fila({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <>
      <dt className="text-on-surface-muted">{label}</dt>
      <dd className="m-0">{children}</dd>
    </>
  )
}
