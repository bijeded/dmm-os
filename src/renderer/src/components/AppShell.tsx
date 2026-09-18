import { NavLink, Outlet, useLocation } from 'react-router'
import { sections } from '../sections'
import { Logo } from './Logo'

export function AppShell() {
  const { pathname } = useLocation()
  // A record under a section (e.g. /contactos/7) still belongs to that section.
  const current = sections.find((s) => s.path !== '/' && (pathname === s.path || pathname.startsWith(`${s.path}/`))) ?? sections[0]
  const main = sections.slice(0, -1)
  const settings = sections[sections.length - 1]

  return (
    <div className="flex min-h-screen w-full bg-surface text-on-surface">
      <aside className="sb sticky top-0 flex h-screen w-[186px] shrink-0 flex-col gap-[3px] self-start overflow-y-auto border-r border-border px-3 py-[18px]">
        <div className="app-drag -mt-[18px] mb-6 flex h-12 items-center px-1.5 pl-[72px]">
          <Logo />
        </div>
        <nav className="flex flex-1 flex-col gap-[3px]">
          {main.map((s) => (
            <NavItem key={s.path} {...s} />
          ))}
          <div className="flex-1" />
          <div className="my-1.5 h-px bg-border" />
          <NavItem {...settings} />
        </nav>
      </aside>
      <main className="shell-main relative isolate flex min-w-0 flex-1 flex-col">
        <header className="hd app-drag sticky top-0 z-10 flex h-12 items-center justify-between gap-3 border-b border-border px-[30px] backdrop-blur-[14px]">
          <div className="font-mono text-[10px] tracking-[.12em] text-on-surface-muted uppercase">
            DMM OS <span className="text-primary-text">/</span> {current.label}
          </div>
        </header>
        <div className="pg flex flex-col gap-[18px] px-[30px] pt-6 pb-9">
          <Outlet />
        </div>
      </main>
    </div>
  )
}

function NavItem({ path, label, icon: Icon }: (typeof sections)[number]) {
  return (
    <NavLink
      to={path}
      end
      className="nav-item flex h-11 items-center gap-[9px] rounded-control px-3 text-[11px] whitespace-nowrap text-on-surface-muted hover:bg-surface-hover hover:text-on-surface aria-[current=page]:text-on-surface"
    >
      <Icon size={15} className="shrink-0" aria-hidden />
      {label}
    </NavLink>
  )
}
