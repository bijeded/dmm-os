import { createPortal } from 'react-dom'

/**
 * A modal dialog over a dimmed backdrop, titled by its heading. Drawn in `document.body`: page
 * sections keep their rise-in animation applied, which makes each one the frame of any fixed
 * overlay inside it, cropped by the card.
 */
export function Dialogo({ id, titulo, children }: { id: string; titulo: string; children: React.ReactNode }) {
  return createPortal(
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/60 p-4">
      <div role="dialog" aria-modal="true" aria-labelledby={id} className="card flex w-full max-w-md flex-col gap-4 rounded-control border border-border-strong bg-surface-raised p-6">
        <h2 id={id} className="m-0 text-[15px] font-semibold text-on-surface">
          {titulo}
        </h2>
        {children}
      </div>
    </div>,
    document.body
  )
}
