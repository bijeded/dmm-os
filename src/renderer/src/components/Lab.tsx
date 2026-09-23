import { useEffect, useRef, useState } from 'react'
import type { ArchivoEnLab, ArchivoLab, CarpetaLab, VistaPreviaLab } from '../../../shared/dominio'
import { diaLocal } from '../../../shared/fechas'
import { dia } from '../../../shared/formato'
import { Aviso, mensaje, useAccion } from './Seccion'
import { Button } from './ui/button'
import { celdaCls, etiquetaCls, tituloCls } from './estilos'

/** A file size as Finder rounds it: `512 B`, `18 KB`, `2.1 MB`. */
const tamano = (bytes: number) =>
  bytes < 1024 ? `${bytes} B` : bytes < 1024 ** 2 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / 1024 ** 2).toFixed(1)} MB`

/** The picked file (relative to Lab/) and its preview: absent while it loads, null when its type has none. */
interface Elegido {
  ruta: string
  vista?: VistaPreviaLab | null
  /** Why the preview could not be read. */
  error?: string
}

/**
 * Lab: a read-only view of `Lab/`, where Claude Desktop output lands. Every subfolder is listed,
 * so a new one shows up with no code change; the search spans all of them. A picked `.md` or
 * `.txt` file is previewed; any file opens in its default app.
 */
export function Lab() {
  const api = window.dmm.lab
  const [carpetas, setCarpetas] = useState<CarpetaLab[] | null>(null)
  const [carpeta, setCarpeta] = useState<string | null>(null)
  const [archivos, setArchivos] = useState<ArchivoLab[] | null>(null)
  const [busqueda, setBusqueda] = useState('')
  const [encontrados, setEncontrados] = useState<ArchivoEnLab[] | null>(null)
  const [elegido, setElegido] = useState<Elegido | null>(null)
  const { error, setError, ocupado, correr } = useAccion()
  // Answers arrive in any order; only the latest search's, and the latest pick's, are shown.
  const ultimaBusqueda = useRef(0)
  const ultimoElegido = useRef<string | null>(null)

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

  const consulta = busqueda.trim()

  // Searched as typed, like the other sections; not through `correr`, so typing never locks the screen.
  const buscar = (valor: string) => {
    setBusqueda(valor)
    const n = ++ultimaBusqueda.current
    const q = valor.trim()
    if (!q) {
      setEncontrados(null)
      return
    }
    setError(null)
    api.buscar(q).then(
      (r) => n === ultimaBusqueda.current && setEncontrados(r),
      (e) => n === ultimaBusqueda.current && setError(mensaje(e))
    )
  }

  const elegirCarpeta = (nombre: string) => {
    buscar('')
    elegir(null)
    correr(() => leer(nombre))
  }

  // Not through `correr` either: a preview loading never holds up the other actions.
  const elegir = (ruta: string | null) => {
    ultimoElegido.current = ruta
    setElegido(ruta === null ? null : { ruta })
    if (ruta === null) return
    api.vistaPrevia(ruta).then(
      (vista) => ultimoElegido.current === ruta && setElegido({ ruta, vista }),
      (e) => ultimoElegido.current === ruta && setElegido({ ruta, error: mensaje(e) })
    )
  }

  const abrir = (ruta: string) => correr(() => api.abrir(ruta))

  const filas: ArchivoEnLab[] | null = consulta ? encontrados : (archivos?.map((a) => ({ carpeta: carpeta ?? '', ...a })) ?? null)

  return (
    <>
      <h1 className={tituloCls}>Lab</h1>

      <div className="g-split grid grid-cols-[minmax(0,1fr)_minmax(0,3fr)] items-start gap-[18px]">
        <section className="card flex flex-col gap-3 rounded-control border border-border p-6" aria-labelledby="lab-carpetas">
          <h2 id="lab-carpetas" className={`m-0 ${etiquetaCls}`}>
            Carpetas
          </h2>
          <ul aria-label="Carpetas" className="m-0 flex list-none flex-col gap-1 p-0">
            {carpetas?.map((c) => {
              const actual = c.nombre === carpeta && !consulta
              return (
                <li key={c.nombre}>
                  <button
                    type="button"
                    aria-current={actual ? 'true' : undefined}
                    disabled={ocupado}
                    onClick={() => elegirCarpeta(c.nombre)}
                    className={`flex w-full cursor-pointer items-center justify-between rounded-control px-3 py-2 text-left text-[13px] ${
                      actual ? 'bg-surface-raised text-on-surface' : 'text-on-surface-muted hover:bg-surface-hover'
                    }`}
                  >
                    <span>{c.nombre}</span>
                    <span className="font-mono text-[12px]" title={c.archivos === null ? 'No se pudo leer' : undefined}>
                      {c.archivos ?? '—'}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
          {carpetas && <p className="m-0 text-[12px] text-on-surface-muted">Nuevas carpetas en Lab/ aparecen aquí</p>}
        </section>

        <section className="card flex flex-col gap-4 rounded-control border border-border p-6">
          {carpetas && carpetas.length > 0 && (
            <div className="acts flex flex-wrap items-center gap-2">
              <input
                type="search"
                placeholder="Buscar en Lab…"
                value={busqueda}
                onChange={(e) => buscar(e.target.value)}
                className="srch h-9 w-56 rounded-control border border-border-strong bg-surface-sunken px-3 text-[13px] text-on-surface"
              />
              <div className="flex-1" />
              <span className="text-[12px] text-on-surface-muted">Solo lectura</span>
              {carpeta && !consulta && (
                <Button variant="secondary" disabled={ocupado} onClick={() => abrir(carpeta)}>
                  Abrir en Finder
                </Button>
              )}
            </div>
          )}
          {(consulta || carpeta) && (
            <h2 className="m-0 text-[15px] font-semibold text-on-surface">{consulta ? 'Resultados en Lab' : carpeta}</h2>
          )}

          {filas && filas.length > 0 && (
            <table className="tbl w-full border-collapse text-[13px]">
              <thead>
                <tr className={etiquetaCls}>
                  <th className={celdaCls}>Nombre</th>
                  {consulta && <th className={celdaCls}>Carpeta</th>}
                  <th className={celdaCls}>Tipo</th>
                  <th className={celdaCls}>Tamaño</th>
                  <th className={celdaCls}>Modificado</th>
                  <th className={celdaCls}>
                    <span className="sr-only">Acciones</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {filas.map((a) => {
                  const ruta = `${a.carpeta}/${a.nombre}`
                  const esElegido = ruta === elegido?.ruta
                  return (
                    <tr key={ruta}>
                      <td data-label="Nombre" className={`${celdaCls} break-all`}>
                        <button
                          type="button"
                          aria-pressed={esElegido}
                          className={`cursor-pointer text-left ${esElegido ? 'text-primary-text' : 'text-on-surface'}`}
                          onClick={() => elegir(ruta)}
                        >
                          {a.nombre}
                        </button>
                      </td>
                      {consulta && (
                        <td data-label="Carpeta" className={celdaCls}>
                          {a.carpeta}
                        </td>
                      )}
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
                          onClick={() => abrir(ruta)}
                        >
                          Abrir
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
          {consulta && encontrados?.length === 0 && <p className="m-0 text-[13px] text-on-surface-muted">Ningún archivo coincide.</p>}
          {!consulta && archivos?.length === 0 && <p className="m-0 text-[13px] text-on-surface-muted">Sin archivos en esta carpeta todavía.</p>}
          {carpetas?.length === 0 && <p className="m-0 text-[13px] text-on-surface-muted">Lab/ no tiene carpetas todavía.</p>}

          {(consulta || carpeta) && (
            <section
              aria-label="Vista previa"
              className="flex min-h-[260px] flex-col gap-3 rounded-control border border-dashed border-border-strong bg-surface-sunken p-4"
            >
              {!elegido && <p className="m-auto text-[12px] text-on-surface-muted">Elige un archivo para ver su vista previa.</p>}
              {elegido && <span className={etiquetaCls}>{elegido.ruta}</span>}
              {elegido && (elegido.vista === null || elegido.error) && (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="m-0 text-[13px] text-on-surface-muted">{elegido.error ?? 'Sin vista previa para este tipo de archivo.'}</p>
                  <Button variant="secondary" disabled={ocupado} onClick={() => abrir(elegido.ruta)}>
                    Abrir
                  </Button>
                </div>
              )}
              {elegido?.vista && (
                <>
                  <pre className="m-0 max-h-[420px] overflow-auto font-mono text-[12px] break-words whitespace-pre-wrap text-on-surface">
                    {elegido.vista.texto}
                  </pre>
                  {elegido.vista.recortado && (
                    <p className="m-0 text-[12px] text-on-surface-muted">Vista previa recortada: abre el archivo para verlo completo.</p>
                  )}
                </>
              )}
            </section>
          )}
          <Aviso error={error} />
        </section>
      </div>
    </>
  )
}
