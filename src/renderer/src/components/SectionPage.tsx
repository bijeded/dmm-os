export function SectionPage({ title }: { title: string }) {
  return (
    <>
      <h1 className="m-0 font-display text-[29px] leading-[1.22] font-bold tracking-[-.01em] text-on-surface uppercase">{title}</h1>
      <div className="card rounded-control border border-border p-6 text-on-surface-muted">Próximamente.</div>
    </>
  )
}
