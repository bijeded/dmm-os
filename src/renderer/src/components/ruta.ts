import { createContext, useContext, useEffect } from 'react'
import { useLocation } from 'react-router'

/** What a record or form page adds to the header path, `DMM OS / <sección> / <cola>`, tagged with the page it belongs to. */
export interface Ruta {
  path: string
  cola: string
}

// Outside the app shell (page tests) the tail goes nowhere.
export const RutaContext = createContext<(ruta: Ruta | null) => void>(() => {})

/** Shows `cola` after the section in the header path while this page is open. */
export function useRuta(cola: string | undefined) {
  const fijar = useContext(RutaContext)
  const { pathname } = useLocation()
  useEffect(() => {
    if (!cola) return
    fijar({ path: pathname, cola })
    // Leaving the page (or its record changing) clears the tail, so a revisit never shows a stale one.
    return () => fijar(null)
  }, [fijar, pathname, cola])
}
