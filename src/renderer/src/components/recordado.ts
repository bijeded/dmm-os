import { useCallback, useSyncExternalStore } from 'react'

// What the screens remember while the app is open: searches, filters, Periodos and pages.
// It lives in memory only, so a restart opens every table fresh.
const valores = new Map<string, unknown>()
const oyentes = new Set<() => void>()

const avisar = () => oyentes.forEach((o) => o())
const suscribir = (oyente: () => void) => {
  oyentes.add(oyente)
  return () => oyentes.delete(oyente)
}

/** Like `useState`, but the value outlives the screen: it comes back when the screen opens again under the same `clave`. */
export function useRecordado<T>(clave: string, inicial: T): [T, (valor: T) => void] {
  const valor = useSyncExternalStore(suscribir, () => (valores.has(clave) ? (valores.get(clave) as T) : inicial))
  const fijar = useCallback(
    (nuevo: T) => {
      valores.set(clave, nuevo)
      avisar()
    },
    [clave]
  )
  return [valor, fijar]
}

/** Forgets everything remembered; tests call it so one case never opens on another's state. */
export function olvidarRecordado() {
  valores.clear()
  avisar()
}

/** A remembered filter value whose option is gone (a Contacto merged away, a year with no rows left) counts as Todos. */
export const siHayOpcion = (valor: string, opciones: string[]) => (opciones.includes(valor) ? valor : '')
