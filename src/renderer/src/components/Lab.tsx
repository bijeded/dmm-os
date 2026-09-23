import { useEffect, useState } from 'react'
import type { ArchivoLab, CarpetaLab } from '../../../shared/dominio'
import { diaLocal } from '../../../shared/fechas'
import { dia } from '../../../shared/formato'
import { Aviso, useAccion } from './Seccion'
import { Button } from './ui/button'
import { celdaCls, etiquetaCls, tituloCls } from './estilos'

/** A file size as Finder rounds it: `512 B`, `18 KB`, `2.1 MB`. */
const tamano = (bytes: number) =>
  bytes < 1024 ? `${bytes} B` : bytes < 1024 ** 2 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / 1024 ** 2).toFixed(1)} MB`

/**
 * Lab: a read-only view of `Lab/`, where Claude Desktop output lands. Every subfolder is listed,
 * so a new one shows up with no code change; files open in their default app.
 */
export function Lab() {
  const api = window.dmm.lab
  const [carpetas, setCarpetas] = useState<CarpetaLab[] | null>(null)
  const [carpeta, setCarpeta] = useState<string | null>(null)
  const [archivos, setArchivos] = useState<ArchivoLab[] | null>(null)
  const { error, ocupado, correr } = useAccion()

  // Lab is re-read on every pick, so a folder added on disk shows up without leaving the screen.
  // The first folder is picked on arrival.
  const leer = async (nombre?: string) => {
    const c = await api.carpetas()
    setCarpetas(c)
    const elegida = nombre ?? c[0]?.nombre
    if (!elegida) return
    setCarpeta(elegida)
    setArchivos(null)
    setArchivos(await api.archivos(elegida))
  }

  useEffect(() => {
    correr(() => leer())
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once on mount
  }, [])

  const abrir = (ruta: string) => correr(() => api.abrir(ruta))

  return (
    <>
      <h1 className={tituloCls}>Lab</h1>

      <div className="g-split grid grid-cols-[minmax(0,1fr)_minmax(0,3fr)] items-start gap-[18px]">
        <section className="card flex flex-col gap-3 rounded-control border border-border p-6" aria-labelledby="lab-carpetas">
          <h2 id="lab-carpetas" className={`m-0 ${etiquetaCls}`}>
            Carpetas
          </h2>
          <ul aria-label="Carpetas" className="m-0 flex list-none flex-col gap-1 p-0">
            {carpetas?.map((c) => (
              <li key={c.nombre}>
                <button
                  type="button"
                  aria-current={c.nombre === carpeta ? 'true' : undefined}
                  disabled={ocupado}
                  onClick={() => correr(() => leer(c.nombre))}
                  className={`flex w-full cursor-pointer items-center justify-between rounded-control px-3 py-2 text-left text-[13px] ${
                    c.nombre === carpeta ? 'bg-surface-raised text-on-surface' : 'text-on-surface-muted hover:bg-surface-hover'
                  }`}
                >
                  <span>{c.nombre}</span>
                  <span className="font-mono text-[12px]" title={c.archivos === null ? 'No se pudo leer' : undefined}>
                    {c.archivos ?? '—'}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {carpetas && <p className="m-0 text-[12px] text-on-surface-muted">Nuevas carpetas en Lab/ aparecen aquí</p>}
        </section>

        <section className="card flex flex-col gap-4 rounded-control border border-border p-6">
          {carpeta && (
            <div className="acts flex flex-wrap items-center justify-between gap-2">
              <h2 className="m-0 text-[15px] font-semibold text-on-surface">{carpeta}</h2>
              <div className="flex items-center gap-3">
                <span className="text-[12px] text-on-surface-muted">Solo lectura</span>
                <Button variant="secondary" disabled={ocupado} onClick={() => abrir(carpeta)}>
                  Abrir en Finder
                </Button>
              </div>
            </div>
          )}

          {archivos && archivos.length > 0 && (
            <table className="tbl w-full border-collapse text-[13px]">
              <thead>
                <tr className={etiquetaCls}>
                  <th className={celdaCls}>Nombre</th>
                  <th className={celdaCls}>Tipo</th>
                  <th className={celdaCls}>Tamaño</th>
                  <th className={celdaCls}>Modificado</th>
                  <th className={celdaCls}>
                    <span className="sr-only">Acciones</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {archivos.map((a) => (
                  <tr key={a.nombre}>
                    <td data-label="Nombre" className={`${celdaCls} break-all`}>
                      {a.nombre}
                    </td>
                    <td data-label="Tipo" className={`${celdaCls} font-mono text-[12px]`}>
                      {a.tipo || '—'}
                    </td>
                    <td data-label="Tamaño" className={`${celdaCls} font-mono text-[12px]`}>
                      {tamano(a.bytes)}
                    </td>
                    <td data-label="Modificado" className={celdaCls}>
                      {dia(diaLocal(new Date(a.modificado)))}
                    </td>
                    <td className={celdaCls}>
                      <button
                        type="button"
                        disabled={ocupado}
                        className="cursor-pointer font-mono text-[11px] text-primary-text"
                        onClick={() => abrir(`${carpeta}/${a.nombre}`)}
                      >
                        Abrir
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {archivos?.length === 0 && <p className="m-0 text-[13px] text-on-surface-muted">Sin archivos en esta carpeta todavía.</p>}
          {carpetas?.length === 0 && <p className="m-0 text-[13px] text-on-surface-muted">Lab/ no tiene carpetas todavía.</p>}
          <Aviso error={error} />
        </section>
      </div>
    </>
  )
}
