import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { AuthProvider } from './contexts/AuthContext'
import { ToastProvider } from './contexts/ToastContext'
import { AppDataProvider } from './contexts/AppDataContext'
import { NotificationProvider } from './contexts/NotificationContext'
import { AIChatProvider } from './contexts/AIContext'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <ToastProvider>
        <AppDataProvider>
          <NotificationProvider>
            <AIChatProvider>
              <App />
            </AIChatProvider>
          </NotificationProvider>
        </AppDataProvider>
      </ToastProvider>
    </AuthProvider>
  </StrictMode>,
)
