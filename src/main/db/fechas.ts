// Calendar arithmetic on the app's strings: periods are 'YYYY-MM', days are 'YYYY-MM-DD'.

/** The period `n` months after `periodo` (before it when `n` is negative). */
export function sumarMeses(periodo: string, n: number): string {
  const [anio, mes] = periodo.split('-').map(Number)
  const total = anio * 12 + (mes - 1) + n
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`
}

/** Day `dia` of `periodo`, or its last day when the month is shorter. */
export function fechaEnPeriodo(periodo: string, dia: number): string {
  const [anio, mes] = periodo.split('-').map(Number)
  const ultimo = new Date(anio, mes, 0).getDate()
  return `${periodo}-${String(Math.min(dia, ultimo)).padStart(2, '0')}`
}

/** The same day `n` years later (earlier when `n` is negative); a leap day becomes 28 February. */
export function sumarAnios(fecha: string, n: number): string {
  return fechaEnPeriodo(sumarMeses(fecha.slice(0, 7), n * 12), Number(fecha.slice(8, 10)))
}

/** The day `n` days after `fecha` (before it when `n` is negative). */
export function sumarDias(fecha: string, n: number): string {
  const dia = new Date(`${fecha}T12:00:00Z`)
  dia.setUTCDate(dia.getUTCDate() + n)
  return dia.toISOString().slice(0, 10)
}
