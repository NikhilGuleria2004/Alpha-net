import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ThemeProvider } from './contexts/ThemeContext'
import { AuthProvider } from './contexts/AuthContext'
import { ToastProvider } from './contexts/ToastContext'
import { AppDataProvider } from './contexts/AppDataContext'
import { NotificationProvider } from './contexts/NotificationContext'

// Guideline → interface_guide.txt:109 ("Preconnect to origins"): warm the
// DNS/TLS handshake to the API origin before the first request. The default
// deployment is same-origin ('/api/v1' through the Vite dev proxy), where this
// is a no-op; when VITE_API_BASE_URL points at a cross-origin API, the
// connection is opened while the bundle boots (EMSFrontend.md §12 tactics).
const apiBase = import.meta.env.VITE_API_BASE_URL || '/api/v1'
try {
  const apiOrigin = new URL(apiBase, window.location.origin).origin
  if (apiOrigin !== window.location.origin) {
    const preconnect = document.createElement('link')
    preconnect.rel = 'preconnect'
    preconnect.href = apiOrigin
    preconnect.crossOrigin = 'anonymous'
    document.head.appendChild(preconnect)
  }
} catch {
  // Malformed VITE_API_BASE_URL — apiClient's own error handling will surface
  // it on the first request; preconnect is best-effort only.
}

// EMSFrontend.md §10 — provider nesting: Theme → Toast → Auth → AppData →
// Notification → App. Toast wraps Auth because AuthProvider needs addToast
// for sign-in error surfacing; the rest is a dependency-free singleton layer.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <ToastProvider>
        <AuthProvider>
          <AppDataProvider>
            <NotificationProvider>
              <App />
            </NotificationProvider>
          </AppDataProvider>
        </AuthProvider>
      </ToastProvider>
    </ThemeProvider>
  </StrictMode>,
)
