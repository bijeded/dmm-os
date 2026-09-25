/**
 * A one-page PDF holding `lineas`, one per text line, for tests. Written by hand so the tests
 * need no PDF writer: Helvetica in WinAnsi covers the accents and curly quotes the quotes use.
 */
export function pdfDeTexto(lineas: string[]): Uint8Array {
  const escapar = (s: string) => s.replace(/[\\()]/g, (c) => `\\${c}`)
  const contenido = ['BT', '/F1 11 Tf', '14 TL', '50 780 Td', ...lineas.map((l) => `(${escapar(l)}) '`), 'ET'].join('\n')
  const flujo = winAnsi(contenido)
  const objetos = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    null,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'
  ]

  const partes: Uint8Array[] = []
  let largo = 0
  const escribir = (b: Uint8Array) => {
    partes.push(b)
    largo += b.length
  }
  const offsets: number[] = []
  escribir(winAnsi('%PDF-1.4\n'))
  objetos.forEach((o, i) => {
    offsets.push(largo)
    if (o === null) {
      escribir(winAnsi(`${i + 1} 0 obj\n<< /Length ${flujo.length} >>\nstream\n`))
      escribir(flujo)
      escribir(winAnsi('\nendstream\nendobj\n'))
    } else escribir(winAnsi(`${i + 1} 0 obj\n${o}\nendobj\n`))
  })
  const xref = largo
  const filas = offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')
  escribir(winAnsi(`xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n${filas}`))
  escribir(winAnsi(`trailer\n<< /Size ${objetos.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`))

  const pdf = new Uint8Array(largo)
  let i = 0
  for (const p of partes) {
    pdf.set(p, i)
    i += p.length
  }
  return pdf
}

// The characters WinAnsi places outside Latin-1.
const FUERA_DE_LATIN1: Record<string, number> = { '“': 0x93, '”': 0x94, '•': 0x95, '–': 0x96, '—': 0x97, '‘': 0x91, '’': 0x92 }

function winAnsi(s: string): Uint8Array {
  return Uint8Array.from([...s], (c) => FUERA_DE_LATIN1[c] ?? (c.charCodeAt(0) <= 0xff ? c.charCodeAt(0) : 0x3f))
}
