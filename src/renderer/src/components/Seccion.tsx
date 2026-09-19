import { useState, type ReactNode } from 'react'
import { etiquetaCls } from './estilos'

/**
 * The pieces screens are built from: Configuración cards (Seccion, Datos, Fila, Aviso), the stat
 * card (Cifra), and running an action (useAccion), so each screen only says what it shows.
 */

export const fecha = (iso: string) => new Date(iso).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })

// Electron wraps main-process errors as "Error invoking remote method '…': Error: <message>".
export const mensaje = (e: unknown) =>
  String(e instanceof Error ? e.message : e).replace(/^Error invoking remote method '[^']*': (?:Error: )?/, '')

/**
 * Running one action of a section: nothing else runs while it does, and whatever main answers
 * with — including why it refused — is what the section shows.
 */
export function useAccion() {
  const [error, setError] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)

  const correr = async (fn: () => Promise<unknown>) => {
    setError(null)
    setOcupado(true)
    try {
      await fn()
    } catch (e) {
      setError(mensaje(e))
    } finally {
      setOcupado(false)
    }
  }

  return { error, setError, ocupado, correr }
}

export function Seccion({ id, titulo, children }: { id: string; titulo: string; children: ReactNode }) {
  return (
    <section className="card flex flex-col gap-4 rounded-control border border-border p-6" aria-labelledby={id}>
      <h2 id={id} className="m-0 font-mono text-[10px] font-semibold tracking-[.12em] text-on-surface-muted uppercase">
        {titulo}
      </h2>
      {children}
    </section>
  )
}

export function Fila({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <>
      <dt className="text-on-surface-muted">{label}</dt>
      <dd className="m-0">{children}</dd>
    </>
  )
}

export function Datos({ children }: { children: ReactNode }) {
  return <dl className="m-0 grid grid-cols-[180px_1fr] items-center gap-x-4 gap-y-3 text-[13px]">{children}</dl>
}

/** What went wrong in the last action of a section; nothing when it went fine. */
export function Aviso({ error }: { error: string | null }) {
  if (!error) return null
  return (
    <p role="alert" className="m-0 text-[13px] text-error-text">
      {error}
    </p>
  )
}

/** A stat card: its figure, and the details under it joined by " · " (empty ones dropped). */
export function Cifra({ label, valor, detalle }: { label: string; valor: string; detalle: (string | null | false | undefined)[] }) {
  return (
    <li className="card flex flex-col gap-1 rounded-control border border-border p-4">
      <span className={etiquetaCls}>{label}</span>
      <span className="font-display text-[29px] leading-none font-bold text-on-surface">{valor}</span>
      <span className="text-[12px] text-on-surface-muted">{detalle.filter(Boolean).join(' · ')}</span>
    </li>
  )
}
