import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import registerAuth from './api/auth/register.js'
import deleteAuthUser from './api/auth/delete-user.js'
import uploadMenuImage from './api/menu-image/upload.js'
import deleteMenuImage from './api/menu-image/delete.js'
import notifyTelegramEmployee from './api/telegram/employee-notification.js'
import notifyTelegramOrderStatus from './api/telegram/order-status.js'
import assistant from './api/assistant/index.js'
import { darkThemePlugin } from './scripts/build-dark-theme.mjs'

const SERVER_ENV_KEYS = [
  'VITE_SUPABASE_URL',
  'SUPABASE_URL',
  'VITE_SUPABASE_ANON_KEY',
  'SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'R2_ACCOUNT_ID',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'R2_BUCKET',
  'R2_PUBLIC_BASE_URL',
  'R2_ENDPOINT',
  'TELEGRAM_BOT_TOKEN',
  'TELEGRAM_COMPLETED_ORDERS_CHAT_ID',
  'TELEGRAM_COMPLETED_ORDERS_CHAT_IDS',
  'TELEGRAM_SALARY_PAYMENTS_CHAT_ID',
  'TELEGRAM_SALARY_PAYMENTS_LANGUAGE',
  'TELEGRAM_TEAM_CHAT_ID',
  'TELEGRAM_TEAM_LANGUAGE',
  'TELEGRAM_SESSION_SECRET',
  'ASSISTANT_PROVIDER',
  'ASSISTANT_MODEL',
  'ANTHROPIC_API_KEY',
  'GEMINI_API_KEY',
]

function loadServerEnv(mode) {
  const env = loadEnv(mode, process.cwd(), '')
  SERVER_ENV_KEYS.forEach(key => {
    if (!process.env[key] && env[key]) process.env[key] = env[key]
  })
}

function localApiRoutes() {
  return {
    name: 'local-api-routes',
    configureServer(server) {
      server.middlewares.use('/api/auth/register', (req, res) => registerAuth(req, res))
      server.middlewares.use('/api/auth/delete-user', (req, res) => deleteAuthUser(req, res))
      server.middlewares.use('/api/menu-image/upload', (req, res) => uploadMenuImage(req, res))
      server.middlewares.use('/api/menu-image/delete', (req, res) => deleteMenuImage(req, res))
      server.middlewares.use('/api/telegram/employee-notification', (req, res) => notifyTelegramEmployee(req, res))
      server.middlewares.use('/api/telegram/order-status', (req, res) => notifyTelegramOrderStatus(req, res))
      server.middlewares.use('/api/assistant', (req, res) => assistant(req, res))
    },
  }
}

export default defineConfig(({ mode }) => {
  loadServerEnv(mode)
  const supabaseUrl = loadEnv(mode, process.cwd(), '').VITE_SUPABASE_URL

  return {
    plugins: [darkThemePlugin(), react(), localApiRoutes()],
    server: {
      port: 5173,
      strictPort: true,
      // Mirrors the vercel.json same-origin REST rewrite (src/lib/restProxy.js).
      proxy: supabaseUrl ? {
        '/sb/rest/v1': { target: supabaseUrl, changeOrigin: true, rewrite: path => path.replace(/^\/sb/, '') },
      } : undefined,
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if ((id.includes('commonjsHelpers') || id.includes('vite/preload-helper'))) return 'vendor'
            if (!id.includes('node_modules')) return undefined
            if (/node_modules\/(jspdf|fflate|fast-png|iobuffer|pako|html2canvas|dompurify|canvg|raf|rgbcolor|stackblur-canvas|text-segmentation|utrie|base64-arraybuffer|core-js|svg-pathdata)\//.test(id)) return 'pdf-vendor'
            if (id.includes('@supabase')) return 'supabase'
            if (id.includes('@dnd-kit')) return 'dnd'
            if (id.includes('react')) return 'react-vendor'
            if (id.includes('lucide-react')) return 'icons'
            return 'vendor'
          },
        },
      },
    },
  }
})
