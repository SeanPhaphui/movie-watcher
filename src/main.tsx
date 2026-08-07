import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import '@fontsource-variable/fraunces'
import '@fontsource-variable/manrope'
import './styles.css'
import App from './App'

registerSW({ immediate: true })

// ScrollManager owns this. Left on 'auto', the browser also restores scroll —
// but it does so against a page that has not rendered its list yet, so it
// clamps to a short document and fights our restore.
if ('scrollRestoration' in history) history.scrollRestoration = 'manual'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
