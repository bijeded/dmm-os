/** A stamped CFDI 4.0 as the SAT writes it, for tests. Amounts are decimal pesos, as in the file. */
export function cfdiXml({
  uuid = 'A1B2C3D4-0000-4444-8888-99AABBCCDDEE',
  fecha = '2026-02-03',
  tipo = 'I',
  emisor = 'DMM170101AB1',
  nombreEmisor = 'DMM STUDIOS SA DE CV',
  receptor = 'EOC180202XY9',
  nombreReceptor = 'ESTUDIO OCHO SA DE CV',
  moneda = 'MXN',
  tipoCambio = '',
  subtotal = '1000.00',
  descuento = '',
  iva = '160.00',
  retenciones = '',
  descripcion = 'Diseño de sitio web',
  metodoPago = '',
  sustituye = [] as string[],
  complemento = ''
} = {}): string {
  const atributo = (nombre: string, valor: string) => (valor === '' ? '' : ` ${nombre}="${valor}"`)
  return `<?xml version="1.0" encoding="UTF-8"?>
<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital" Version="4.0" Fecha="${fecha}T12:00:00" TipoDeComprobante="${tipo}" Moneda="${moneda}"${atributo('TipoCambio', tipoCambio)}${atributo('MetodoPago', metodoPago)} SubTotal="${subtotal}"${atributo('Descuento', descuento)} Total="0.00">
${relacionados(sustituye)}  <cfdi:Emisor Rfc="${emisor}" Nombre="${nombreEmisor}" RegimenFiscal="601"/>
  <cfdi:Receptor Rfc="${receptor}" Nombre="${nombreReceptor}" UsoCFDI="G03"/>
  <cfdi:Conceptos>
    <cfdi:Concepto ClaveProdServ="81112100" Cantidad="1" Descripcion="${descripcion}" ValorUnitario="${subtotal}" Importe="${subtotal}"/>
  </cfdi:Conceptos>
  <cfdi:Impuestos TotalImpuestosTrasladados="${iva}"${atributo('TotalImpuestosRetenidos', retenciones)}/>
  <cfdi:Complemento>
${complemento}    <tfd:TimbreFiscalDigital Version="1.1" UUID="${uuid}" FechaTimbrado="${fecha}T12:00:05"/>
  </cfdi:Complemento>
</cfdi:Comprobante>`
}

function relacionados(uuids: string[]): string {
  if (uuids.length === 0) return ''
  const filas = uuids.map((u) => `    <cfdi:CfdiRelacionado UUID="${u}"/>\n`).join('')
  return `  <cfdi:CfdiRelacionados TipoRelacion="04">\n${filas}  </cfdi:CfdiRelacionados>\n`
}

/** One payment in a complemento de pago: amounts in decimal pesos of the paid invoice's currency. */
export interface PagoXml {
  factura: string
  parcialidad: number
  fecha: string
  pagado: string
  saldoAnterior: string
  saldo: string
}

/** A stamped complemento de pago (tipo `P`, Pagos 2.0) recording `pagos`, each as its own Pago. */
export function complementoXml({ uuid, pagos }: { uuid: string; pagos: PagoXml[] }): string {
  const pago = (p: PagoXml) => `      <pago20:Pago FechaPago="${p.fecha}T10:00:00" FormaDePagoP="03" MonedaP="MXN" Monto="${p.pagado}">
        <pago20:DoctoRelacionado IdDocumento="${p.factura.toUpperCase()}" MonedaDR="MXN" NumParcialidad="${p.parcialidad}" ImpSaldoAnt="${p.saldoAnterior}" ImpPagado="${p.pagado}" ImpSaldoInsoluto="${p.saldo}" ObjetoImpDR="01"/>
      </pago20:Pago>
`
  return cfdiXml({
    uuid,
    tipo: 'P',
    moneda: 'XXX',
    subtotal: '0',
    iva: '0',
    complemento: `    <pago20:Pagos xmlns:pago20="http://www.sat.gob.mx/Pagos20" Version="2.0">\n${pagos.map(pago).join('')}    </pago20:Pagos>\n`
  })
}

export const RFC_DMM = 'DMM170101AB1'
export const RFC_CLIENTE = 'EOC180202XY9'
