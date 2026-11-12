import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app.tsx'
import { authConfigOf } from './auth/config.ts'
import { cookieSession } from './auth/session.ts'
import './styles.css'
import { applyTheme, readTheme } from './theme/theme.ts'

applyTheme(readTheme())

const session = authConfigOf(import.meta.env).mode === 'entra' ? cookieSession() : undefined

const root = document.getElementById('root')

if (root) {
  createRoot(root).render(
    <StrictMode>
      <App session={session} />
    </StrictMode>,
  )
}
