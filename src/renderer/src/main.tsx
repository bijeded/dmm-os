import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createHashRouter, RouterProvider } from 'react-router'
import '@fontsource/antonio/700.css'
import '@fontsource/asap/400.css'
import '@fontsource/asap/600.css'
import '@fontsource/jetbrains-mono/400.css'
import '@fontsource/jetbrains-mono/600.css'
import './index.css'
import { routes } from './routes'

// Hash routing: the packaged app loads index.html over file://
const router = createHashRouter(routes)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>
)
