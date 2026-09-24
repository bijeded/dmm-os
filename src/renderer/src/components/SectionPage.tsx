import { tituloCls } from './estilos'

export function SectionPage({ title }: { title: string }) {
  return (
    <>
      <h1 className={tituloCls}>{title}</h1>
      <div className="card rounded-control border border-border p-6 text-on-surface-muted">Próximamente.</div>
    </>
  )
}
