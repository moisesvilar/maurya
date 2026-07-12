import '@/assets/main.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from '@/App'
import { initTheme } from '@/lib/theme'

// Tema ANTES del primer render: evita el flash claro al arrancar en oscuro
// (no puede ir inline en index.html: el CSP bloquea 'unsafe-inline')
initTheme()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
