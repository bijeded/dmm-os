import { useEffect, useState } from 'react'
import {
  NOMBRES_ORIGEN_SUSCRIPCION,
  NOMBRES_PERIODO_FINANZAS,
  PERIODOS_AI,
  type FilaSuscripcion,
  type PeriodoAi,
  type ResumenAi
} from '../../../shared/dominio'
import { dia, monto, pesos } from '../../../shared/formato'
import { Aviso, Cifra, fecha, Seccion, useAccion } from './Seccion'
import { Button } from './ui/button'
import { celdaCls, etiquetaCls, tituloCls } from './estilos'

/** A token count as the cards show it: `15.7 M`, `840.0 K`, `312`. */
const tokens = (n: number) => {
  const uno = (x: number) => x.toLocaleString('es-MX', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
  return n >= 1e6 ? `${uno(n / 1e6)} M` : n >= 1e3 ? `${uno(n / 1e3)} K` : String(n)
}

const porcentaje = (x: number) => x.toLocaleString('es-MX', { style: 'percent', maximumFractionDigits: 1 })

/**
 * AI: token usage imported from CC Usage and RTK, for Este mes or Todo el tiempo. Usage is read
 * only when asked (Leer uso); a source that could not be read is named and the rest still shows.
 */
export function Ai() {
  const api = window.dmm.ai
  const [periodo, setPeriodo] = useState<PeriodoAi>('mes')
  const [resumen, setResumen] = useState<ResumenAi | null>(null)
  const { error, ocupado, correr } = useAccion()

  useEffect(() => {
    correr(async () => setResumen(await api.resumen(periodo)))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload per period
  }, [periodo])

  const leerUso = () =>
    correr(async () => {
      await api.leerUso()
      setResumen(await api.resumen(periodo))
    })

  return (
    <>
      <div className="acts flex flex-wrap items-center justify-between gap-3">
        <h1 className={tituloCls}>AI</h1>
        <div className="flex items-center gap-3">
          {resumen && (
            <span className="font-mono text-[12px] text-on-surface-muted">
              Último escaneo: {resumen.ultimoEscaneo ? fecha(resumen.ultimoEscaneo) : 'Nunca'}
            </span>
          )}
          <Button disabled={ocupado} onClick={leerUso}>
            Leer uso
          </Button>
        </div>
      </div>

      <div className="acts flex flex-wrap items-center gap-2">
        <div role="group" aria-label="Periodo" className="flex flex-wrap gap-1">
          {PERIODOS_AI.map((p) => (
            <button
              key={p}
              type="button"
              aria-pressed={periodo === p}
              onClick={() => setPeriodo(p)}
              className={`h-9 cursor-pointer rounded-control border px-3 text-[13px] ${periodo === p ? 'border-primary bg-primary text-on-primary' : 'border-border-strong text-on-surface'}`}
            >
              {NOMBRES_PERIODO_FINANZAS[p]}
            </button>
          ))}
        </div>
        <span className="text-[12px] text-on-surface-muted">Fuentes: CC Usage (costos API) · RTK (ahorro de tokens)</span>
      </div>
      <Aviso error={error} />

      {resumen && resumen.avisos.length > 0 && (
        <ul aria-label="Avisos de lectura" className="m-0 flex list-none flex-col gap-1 rounded-control border border-border-strong p-3 text-[13px] text-on-surface">
          {resumen.avisos.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
      )}

      {resumen && (
        <ul aria-label="Resumen" className="g-stats m-0 grid list-none grid-cols-3 gap-3 p-0">
          <Cifra label="Tokens totales" valor={tokens(resumen.tokens)} detalle={[]} />
          <Cifra label="Tokens ahorrados" valor={tokens(resumen.tokensAhorrados)} detalle={[resumen.ahorro !== null && `${porcentaje(resumen.ahorro)} vía RTK`]} />
          <Cifra
            label="Costo API aprox."
            valor={resumen.costoApiMxn === null ? monto(resumen.costoApiUsd, 'USD') : pesos(resumen.costoApiMxn)}
            detalle={[resumen.costoApiMxn === null ? 'sin tipo de cambio registrado' : `≈ ${monto(resumen.costoApiUsd, 'USD')}`]}
          />
          <Cifra label="Suscripciones" valor={pesos(resumen.suscripcionesTotal)} detalle={[...new Set(resumen.suscripciones.map((s) => s.plan))]} />
        </ul>
      )}

      {resumen && (
        <Seccion id="ai-suscripciones" titulo="Suscripciones">
          <p className="m-0 text-[12px] text-on-surface-muted">Vista filtrada de Costos · proveedor AI</p>
          <TablaSuscripciones filas={resumen.suscripciones} />
          <p className="m-0 text-[12px] text-on-surface-muted">Mismo registro que Finanzas → Costos.</p>
        </Seccion>
      )}
    </>
  )
}

function TablaSuscripciones({ filas }: { filas: FilaSuscripcion[] }) {
  if (filas.length === 0) return <p className="m-0 text-[13px] text-on-surface-muted">Ninguna suscripción en el periodo.</p>
  return (
    <table aria-labelledby="ai-suscripciones" className="tbl w-full border-collapse text-[13px]">
      <thead>
        <tr className={etiquetaCls}>
          <th className={celdaCls}>Proveedor</th>
          <th className={celdaCls}>Plan</th>
          <th className={celdaCls}>Fecha</th>
          <th className={`${celdaCls} text-right`}>Monto</th>
          <th className={celdaCls}>Origen</th>
        </tr>
      </thead>
      <tbody>
        {filas.map((s) => (
          <tr key={s.id}>
            <td data-label="Proveedor" className={celdaCls}>
              {s.proveedor ?? '—'}
            </td>
            <td data-label="Plan" className={celdaCls}>
              {s.plan}
            </td>
            <td data-label="Fecha" className={`${celdaCls} font-mono text-[12px]`}>
              {dia(s.fecha)}
            </td>
            <td data-label="Monto" className={`${celdaCls} text-right font-mono text-[12px]`}>
              {pesos(s.monto)}
            </td>
            <td data-label="Origen" className={celdaCls}>
              {NOMBRES_ORIGEN_SUSCRIPCION[s.origen]}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
