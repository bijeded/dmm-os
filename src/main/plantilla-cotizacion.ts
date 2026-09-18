import { NOMBRES_FACTURACION, type FichaCotizacion } from '../shared/ipc'

/**
 * The Cotización as the Contacto receives it, in the DMM Studios brand (DMM/Brand/DESIGN.md):
 * paper and ink, amber accent, Antonio for display, Asap for text. Estimated costs are
 * internal and never printed.
 */

const escapar = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

const dinero = (centavos: number, moneda: string) =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: moneda, currencyDisplay: 'narrowSymbol' }).format(centavos / 100) + ` ${moneda}`

const fechaLarga = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })

const sumarDias = (iso: string, dias: number) => {
  const d = new Date(`${iso}T12:00:00`)
  d.setDate(d.getDate() + dias)
  return d.toISOString().slice(0, 10)
}

const parrafos = (s: string | null) => (s ? s.split(/\n+/).map((p) => `<p>${escapar(p)}</p>`).join('') : '')

export function plantillaCotizacion(c: FichaCotizacion): string {
  const $ = (n: number) => dinero(n, c.moneda)
  const facturacion =
    c.facturacion === 'parcialidades' ? `${c.parcialidades} parcialidades` : NOMBRES_FACTURACION[c.facturacion]
  const filas = c.partidas
    .map(
      (p) =>
        `<tr><td>${escapar(p.concepto)}</td><td class="n">${p.cantidad}</td><td class="n">${$(p.precio)}</td><td class="n">${$(Math.round(p.cantidad * p.precio))}</td></tr>`
    )
    .join('')

  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><title>DMM${escapar(c.folio ?? '')} · ${escapar(c.nombre)}</title>
<style>
  @page { size: Letter; margin: 0 }
  * { box-sizing: border-box }
  body { margin: 0; background: #F7F5F2; color: #1A1A1A; font: 11pt/1.5 Asap, 'Helvetica Neue', Arial, sans-serif }
  .pg { padding: 0.75in }
  header { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 3px solid #EBA51C; padding-bottom: 14px }
  .marca { font: 700 26pt/1 Antonio, 'Arial Narrow', sans-serif; letter-spacing: .02em; text-transform: uppercase }
  .marca span { color: #7C550B }
  .folio { font: 600 9pt 'JetBrains Mono', Menlo, monospace; letter-spacing: .12em; color: #5C5C5C; text-align: right; text-transform: uppercase }
  .folio b { display: block; font-size: 14pt; color: #1A1A1A }
  h1 { font: 700 22pt/1.2 Antonio, 'Arial Narrow', sans-serif; text-transform: uppercase; margin: 28px 0 6px }
  .meta { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin: 18px 0 24px }
  .meta div { background: #EDEAE4; border: 1px solid #DCD7CE; border-radius: 6px; padding: 10px 12px }
  .etq { display: block; font: 600 8pt 'JetBrains Mono', Menlo, monospace; letter-spacing: .12em; color: #5C5C5C; text-transform: uppercase }
  table { width: 100%; border-collapse: collapse }
  th { font: 600 8pt 'JetBrains Mono', Menlo, monospace; letter-spacing: .12em; color: #5C5C5C; text-transform: uppercase; text-align: left; border-bottom: 1px solid #DCD7CE; padding: 8px 6px }
  td { border-bottom: 1px solid #DCD7CE; padding: 10px 6px }
  .n { text-align: right; white-space: nowrap }
  .totales { margin: 16px 0 0 auto; width: 45% }
  .totales div { display: flex; justify-content: space-between; padding: 4px 6px }
  .totales .total { border-top: 2px solid #1A1A1A; font-weight: 700; font-size: 13pt; margin-top: 4px; padding-top: 8px }
  section { margin-top: 26px }
  footer { margin-top: 40px; font-size: 9pt; color: #5C5C5C }
</style></head>
<body><div class="pg">
  <header><div class="marca">DMM <span>Studios</span></div><div class="folio">Cotización<b>DMM${escapar(c.folio ?? '')}</b></div></header>
  <h1>${escapar(c.nombre)}</h1>
  <div class="meta">
    <div><span class="etq">Cliente</span>${escapar(c.contacto)}</div>
    <div><span class="etq">Fecha</span>${fechaLarga(c.fecha)}</div>
    <div><span class="etq">Vigencia</span>Hasta el ${fechaLarga(sumarDias(c.fecha, c.validezDias))}</div>
  </div>
  <table>
    <thead><tr><th>Concepto</th><th class="n">Cant.</th><th class="n">Precio</th><th class="n">Importe</th></tr></thead>
    <tbody>${filas}</tbody>
  </table>
  <div class="totales">
    <div><span>Subtotal</span><span>${$(c.subtotal)}</span></div>
    ${c.iva > 0 ? `<div><span>IVA 16%</span><span>${$(c.iva)}</span></div>` : ''}
    <div class="total"><span>Total</span><span>${$(c.total)}</span></div>
  </div>
  <section><span class="etq">Forma de pago</span><p>${escapar(facturacion)}</p></section>
  ${c.stack ? `<section><span class="etq">Stack</span>${parrafos(c.stack)}</section>` : ''}
  ${c.terminos ? `<section><span class="etq">Términos</span>${parrafos(c.terminos)}</section>` : ''}
  ${c.notas ? `<section><span class="etq">Notas</span>${parrafos(c.notas)}</section>` : ''}
  <footer>DMM Studios</footer>
</div></body></html>`
}
