import { useEffect, useState } from 'react'
import type { CobroAlCompletar, FichaProyecto, OpcionesCobro, PagoAlCompletar } from '../../../shared/dominio'
import { hoy } from '../../../shared/fechas'
import { dia, monto } from '../../../shared/formato'
import { centavosDe } from '../../../shared/montos'
import { Campo } from './NuevaCotizacion'
import { campoCls, etiquetaCls } from './estilos'
import { Aviso, useAccion } from './Seccion'
import { Button } from './ui/button'

/** The CFDI chosen in "¿Con factura?", or the invoice that is not on disk. */
const FUERA_DE_DISCO = 'fuera'

const aTexto = (centavos: number) => (centavos / 100).toFixed(2)

/**
 * Completar con cobro: what a Proyecto that is not fully paid still misses, and how it was paid.
 * Pending Ingresos are Cobrado or Incobrable; what is missing after them was paid without an
 * invoice, by a CFDI already in `Facturas/Emitidas`, or by an invoice not on disk. Less than
 * what is missing leaves the rest Incobrable. Main checks the answer and writes it with the
 * Proyecto completed, or nothing; closing writes nothing.
 */
export function CompletarConCobro({ id, onCompletado, onCerrar }: { id: number; onCompletado: (f: FichaProyecto) => void; onCerrar: () => void }) {
  const [o, setO] = useState<OpcionesCobro | null>(null)
  const [fecha, setFecha] = useState(hoy)
  const [incobrables, setIncobrables] = useState<number[]>([])
  const [conFactura, setConFactura] = useState<boolean | null>(null)
  const [factura, setFactura] = useState<string | null>(null)
  const [recibido, setRecibido] = useState('')
  const [conIva, setConIva] = useState(true)
  const [tipoCambio, setTipoCambio] = useState('')
  const { error, ocupado, correr, setError } = useAccion()

  useEffect(() => {
    correr(async () => {
      const opciones = await window.dmm.proyectos.opcionesCobro(id)
      setO(opciones)
      setRecibido(aTexto(opciones.falta))
      setTipoCambio(opciones.tipoCambio === null ? '' : String(opciones.tipoCambio))
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once per Proyecto
  }, [id])

  const moneda = o?.moneda ?? 'MXN'
  const vincula = conFactura === true && factura !== null && factura !== FUERA_DE_DISCO
  const elegida = o?.facturas.find((f) => f.cfdiUuid === factura)
  const conMonto = conFactura === false || (conFactura === true && factura === FUERA_DE_DISCO)
  const leido = (() => {
    try {
      return conMonto ? centavosDe(recibido) : vincula ? (elegida?.total ?? 0) : null
    } catch {
      return null
    }
  })()
  const incobrable = o && leido !== null && leido < o.falta ? o.falta - leido : 0

  const pago = (): PagoAlCompletar | null => {
    if (!o || o.falta === 0) return null
    if (conFactura === false) return { tipo: 'sin_factura', monto: centavosDe(recibido) }
    if (conFactura === true && factura === FUERA_DE_DISCO) return { tipo: 'factura_fuera_de_disco', monto: centavosDe(recibido), conIva }
    if (vincula) return { tipo: 'cfdi', cfdiUuid: factura }
    throw new Error(conFactura === null ? 'Indica si el pago fue con factura' : 'Elige la factura')
  }

  const confirmar = () => {
    if (fecha > hoy()) return setError('La fecha de pago no puede ser futura')
    correr(async () => {
      const cobro: CobroAlCompletar = { fecha, incobrables, pago: pago(), tipoCambio: moneda === 'USD' ? Number(tipoCambio) : null }
      onCompletado(await window.dmm.proyectos.completarConCobro(id, cobro))
    })
  }

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/60 p-4">
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="cobro-titulo"
        className="card flex max-h-full w-full max-w-lg flex-col gap-4 overflow-y-auto rounded-control border border-border-strong bg-surface-raised p-6"
        onSubmit={(e) => {
          e.preventDefault()
          confirmar()
        }}
      >
        <h2 id="cobro-titulo" className="m-0 text-[15px] font-semibold text-on-surface">
          Completar con cobro
        </h2>
        {o && (
          <>
            <p className="m-0 text-[13px] text-on-surface-muted">
              {o.totalCotizacion !== null && `Cotización ${monto(o.totalCotizacion, moneda)}`}
              {o.subtotalCotizacion !== null && o.subtotalCotizacion !== o.totalCotizacion && ` (subtotal ${monto(o.subtotalCotizacion, moneda)})`}
              {o.totalCotizacion !== null && ` · pagado ${monto(o.saldado, moneda)} · `}
              {`falta ${monto(o.falta, moneda)}`}
              {o.pendientes.length > 0 && ` después de ${o.pendientes.length === 1 ? 'el pago pendiente' : `los ${o.pendientes.length} pagos pendientes`}`}
            </p>
            <Campo label="Fecha de pago">
              <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className={campoCls} />
            </Campo>
            {moneda === 'USD' && (
              <Campo label="Tipo de cambio">
                <input type="number" step="0.0001" min="0" value={tipoCambio} onChange={(e) => setTipoCambio(e.target.value)} className={campoCls} />
              </Campo>
            )}
            {o.pendientes.length > 0 && (
              <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
                <legend className={etiquetaCls}>Pagos pendientes</legend>
                {o.pendientes.map((i) => (
                  <label key={i.id} className="flex items-center justify-between gap-3 text-[13px]">
                    <span>
                      {i.fecha ? dia(i.fecha) : 'Sin fecha'} · {monto(i.monto, moneda)}
                    </span>
                    <select
                      aria-label={`Pago de ${monto(i.monto, moneda)}`}
                      value={incobrables.includes(i.id) ? 'incobrable' : 'cobrado'}
                      onChange={(e) => setIncobrables(e.target.value === 'incobrable' ? [...incobrables, i.id] : incobrables.filter((x) => x !== i.id))}
                      className={campoCls}
                    >
                      <option value="cobrado">Cobrado</option>
                      <option value="incobrable">Incobrable</option>
                    </select>
                  </label>
                ))}
              </fieldset>
            )}
            {o.falta > 0 && (
              <>
                <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
                  <legend className={etiquetaCls}>¿Con factura?</legend>
                  <div className="flex gap-4 text-[13px]">
                    <label className="flex items-center gap-2">
                      <input type="radio" name="con-factura" checked={conFactura === true} onChange={() => setConFactura(true)} /> Sí
                    </label>
                    <label className="flex items-center gap-2">
                      <input type="radio" name="con-factura" checked={conFactura === false} onChange={() => setConFactura(false)} /> No
                    </label>
                  </div>
                </fieldset>
                {conFactura === true && (
                  <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
                    <legend className={etiquetaCls}>Factura</legend>
                    {o.facturas.length === 0 && <p className="m-0 text-[13px] text-on-surface-muted">El contacto no tiene facturas sin proyecto.</p>}
                    {o.facturas.map((f) => (
                      <label key={f.cfdiUuid} className="flex items-center gap-2 text-[13px]">
                        <input type="radio" name="factura" checked={factura === f.cfdiUuid} onChange={() => setFactura(f.cfdiUuid)} />
                        {dia(f.fecha)} · {monto(f.total, moneda)} · <span className="font-mono text-[12px]">{f.cfdiUuid.slice(0, 8)}</span>
                        {f.coincide && ' · coincide con la cotización'}
                        {f.pendiente && ' · con pago pendiente'}
                      </label>
                    ))}
                    <label className="flex items-center gap-2 text-[13px]">
                      <input type="radio" name="factura" checked={factura === FUERA_DE_DISCO} onChange={() => setFactura(FUERA_DE_DISCO)} />
                      La factura no está en Facturas/Emitidas
                    </label>
                  </fieldset>
                )}
                {conMonto && (
                  <>
                    <Campo label={`Monto recibido (${moneda})`}>
                      <input inputMode="decimal" value={recibido} onChange={(e) => setRecibido(e.target.value)} className={campoCls} />
                    </Campo>
                    {conFactura === true && (
                      <label className="flex items-center gap-2 text-[13px]">
                        <input type="checkbox" checked={conIva} onChange={(e) => setConIva(e.target.checked)} /> Incluye 16% IVA
                      </label>
                    )}
                  </>
                )}
                {incobrable > 0 && <p className="m-0 text-[13px] text-on-surface-muted">{monto(incobrable, moneda)} quedará como incobrable.</p>}
              </>
            )}
          </>
        )}
        <Aviso error={error} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button type="submit" disabled={ocupado || !o}>
            Completar
          </Button>
        </div>
      </form>
    </div>
  )
}
