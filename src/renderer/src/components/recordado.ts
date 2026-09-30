import { useCallback, useEffect, useSyncExternalStore } from 'react'

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

/**
 * A remembered select filter. Once its `opciones` are loaded (null while loading), a value whose
 * option is gone (a Contacto merged away, a year with no rows left) is forgotten and reads as Todos,
 * so it never turns itself back on if the option returns.
 */
export function useFiltroRecordado(clave: string, opciones: string[] | null): [string, (valor: string) => void] {
  const [guardado, fijar] = useRecordado(clave, '')
  const perdido = opciones !== null && guardado !== '' && !opciones.includes(guardado)
  useEffect(() => {
    if (perdido) fijar('')
  }, [perdido, fijar])
  return [perdido ? '' : guardado, fijar]
}
