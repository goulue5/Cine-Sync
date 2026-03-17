import React from 'react'
import ReactDOM from 'react-dom/client'
import './styles/global.css'
import { PlayerShell } from './components/layout/PlayerShell'
import { initTheme } from './store/themeStore'

// Load saved theme before first render
initTheme()

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <PlayerShell />
  </React.StrictMode>
)
