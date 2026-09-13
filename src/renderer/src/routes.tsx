import type { RouteObject } from 'react-router'
import { AppShell } from './components/AppShell'
import { Configuracion } from './components/Configuracion'
import { SectionPage } from './components/SectionPage'
import { sections } from './sections'

const pages: Record<string, () => React.JSX.Element> = { '/configuracion': Configuracion }

export const routes: RouteObject[] = [
  {
    path: '/',
    element: <AppShell />,
    children: sections.map(({ path, label }) => {
      const Page = pages[path]
      const element = Page ? <Page /> : <SectionPage title={label} />
      return path === '/' ? { index: true, element } : { path: path.slice(1), element }
    })
  }
]
