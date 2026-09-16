import type { ReactNode } from 'react'

/** The pieces every Configuración card is built from, so each section only says what it shows. */

export const fecha = (iso: string) => new Date(iso).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })

// Electron wraps main-process errors as "Error invoking remote method '…': Error: <message>".
export const mensaje = (e: unknown) =>
  String(e instanceof Error ? e.message : e).replace(/^Error invoking remote method '[^']*': (?:Error: )?/, '')

export const inputCls = 'h-9 w-24 rounded-control border border-border-strong bg-surface-sunken px-2 font-mono text-[12px] text-on-surface'

export const monoCls = 'font-mono text-[12px] break-all'

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
