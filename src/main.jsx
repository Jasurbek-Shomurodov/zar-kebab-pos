import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import './index.css'
import './styles/workspace.css'
import './styles/dark-theme.css'
import { releaseBootTheme } from './lib/theme.js'

function Root() {
  // Runs after the first screen's own layout effects, so a themed screen is already dark.
  React.useEffect(releaseBootTheme, [])
  return <App />
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter future={{ v7_startTransition: true }}>
      <Root />
    </BrowserRouter>
  </React.StrictMode>,
)
