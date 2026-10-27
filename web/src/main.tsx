import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app.tsx'
import { authConfigOf } from './auth/config.ts'
import './styles.css'
import { applyTheme, readTheme } from './theme/theme.ts'

applyTheme(readTheme())

const config = authConfigOf(import.meta.env)
const session = import.meta.env.VITE_AUTH_MODE === 'entra' && config.mode === 'entra' ? await (await import('./auth/msal-session.ts')).msalSession(config) : undefined

const root = document.getElementById('root')

if (root) {
  createRoot(root).render(
    <StrictMode>
      <App session={session} />
    </StrictMode>,
  )
}
