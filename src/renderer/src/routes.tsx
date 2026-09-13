import type { RouteObject } from 'react-router'
import { AppShell } from './components/AppShell'
import { SectionPage } from './components/SectionPage'
import { sections } from './sections'

export const routes: RouteObject[] = [
  {
    path: '/',
    element: <AppShell />,
    children: sections.map(({ path, label }) =>
      path === '/' ? { index: true, element: <SectionPage title={label} /> } : { path: path.slice(1), element: <SectionPage title={label} /> }
    )
  }
]
