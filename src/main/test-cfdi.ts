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
  descripcion = 'Diseño de sitio web'
} = {}): string {
  const atributo = (nombre: string, valor: string) => (valor === '' ? '' : ` ${nombre}="${valor}"`)
  return `<?xml version="1.0" encoding="UTF-8"?>
<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital" Version="4.0" Fecha="${fecha}T12:00:00" TipoDeComprobante="${tipo}" Moneda="${moneda}"${atributo('TipoCambio', tipoCambio)} SubTotal="${subtotal}"${atributo('Descuento', descuento)} Total="0.00">
  <cfdi:Emisor Rfc="${emisor}" Nombre="${nombreEmisor}" RegimenFiscal="601"/>
  <cfdi:Receptor Rfc="${receptor}" Nombre="${nombreReceptor}" UsoCFDI="G03"/>
  <cfdi:Conceptos>
    <cfdi:Concepto ClaveProdServ="81112100" Cantidad="1" Descripcion="${descripcion}" ValorUnitario="${subtotal}" Importe="${subtotal}"/>
  </cfdi:Conceptos>
  <cfdi:Impuestos TotalImpuestosTrasladados="${iva}"${atributo('TotalImpuestosRetenidos', retenciones)}/>
  <cfdi:Complemento>
    <tfd:TimbreFiscalDigital Version="1.1" UUID="${uuid}" FechaTimbrado="${fecha}T12:00:05"/>
  </cfdi:Complemento>
</cfdi:Comprobante>`
}

export const RFC_DMM = 'DMM170101AB1'
export const RFC_CLIENTE = 'EOC180202XY9'
