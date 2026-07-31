import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Analytics } from '@vercel/analytics/react'
import { SpeedInsights } from '@vercel/speed-insights/react'
import './index.css'
import App from './App.tsx'
import { ErrorBoundary } from './components/ErrorBoundary.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* Root boundary. The per-panel boundaries contain a failed surface; this one is the
        backstop for App's own render, so no failure can ever leave a white page. */}
    <ErrorBoundary label="The dashboard">
      <App />
    </ErrorBoundary>
    <Analytics />
    <SpeedInsights />
  </StrictMode>,
)
