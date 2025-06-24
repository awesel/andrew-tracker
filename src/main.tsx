import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Expose Vite's env object to `globalThis.importMeta.env` so libraries that
// rely on that shape (e.g. our Firebase config helper) can still function
// without directly referencing `import.meta`.
(globalThis as any).importMeta = { env: import.meta.env }

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
