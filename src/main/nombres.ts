/**
 * Nombre canónico: the accented, correctly written name of a Contacto. File and folder names
 * may omit accents or punctuation, so names are compared by a stripped `clave` and the
 * best-written spelling wins. Near-duplicates are never merged here; they are only flagged.
 */

/** The comparison key: no accents, no case, no punctuation, single spaces. */
export function clave(nombre: string): string {
  return nombre
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, ' ')
    .trim()
}

/**
 * Of two spellings of the same name, the one written with more accents, then more
 * punctuation. A tie keeps the first, so an existing Contacto is not renamed for nothing.
 */
export function mejorEscrito(actual: string, otro: string): string {
  const puntaje = (n: string) => [
    n.normalize('NFD').match(/\p{Diacritic}/gu)?.length ?? 0,
    n.match(/[.,&'-]/g)?.length ?? 0
  ]
  const [a, b] = [puntaje(actual), puntaje(otro)]
  return b[0] > a[0] || (b[0] === a[0] && b[1] > a[1]) ? otro : actual
}

/** Edit distance, capped: anything past `max` is just "far apart". */
function distancia(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1
  let fila = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const siguiente = [i]
    for (let j = 1; j <= b.length; j++) {
      siguiente[j] = Math.min(
        fila[j] + 1,
        siguiente[j - 1] + 1,
        fila[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      )
    }
    fila = siguiente
    if (Math.min(...fila) > max) return max + 1
  }
  return fila[b.length]
}

/**
 * Two different names that likely mean the same Contacto: one extends the other with further
 * words ("Sublime" / "Sublime Inspiración"), or they are a single character apart. Same name
 * is not "parecido": there is nothing to suggest.
 */
export function parecidos(a: string, b: string): boolean {
  const [x, y] = [clave(a), clave(b)]
  if (x === y || x === '' || y === '') return false
  const [corto, largo] = x.length <= y.length ? [x, y] : [y, x]
  if (largo.startsWith(`${corto} `)) return true
  return corto.length >= 5 && distancia(x, y, 1) <= 1
}
