import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
)

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    if (import.meta.env.DEV) {
      // In dev the SW caches Vite module files and HMR payloads, which breaks
      // hot reload and poisons the shell with stale HTML — remove it and its caches.
      navigator.serviceWorker.getRegistrations().then((regs) => {
        for (const reg of regs) reg.unregister()
      })
      if ('caches' in window) {
        caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
      }
    } else {
      navigator.serviceWorker.register('/sw.js').catch(() => {})
    }
  })
}
