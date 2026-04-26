import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [react()],
    server: {
      proxy: {
        '/pmapi': {
          target: 'https://www.premiumize.me',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/pmapi/, '/api'),
          secure: true,
        },
        '/imdbapi': {
          target: 'https://api.imdbapi.dev',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/imdbapi/, ''),
          secure: true,
        },
        '/scenenzbsapi': {
          target: 'https://scenenzbs.com',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/scenenzbsapi/, ''),
          secure: true,
        },
        '/ossub': {
          target: 'https://dl.opensubtitles.org',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/ossub/, ''),
          secure: true,
        },
        // TMDB proxy (mirrors the Vercel function for local dev)
        '/api/tmdb': {
          target: 'https://api.themoviedb.org/3',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/tmdb/, ''),
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq) => {
              const key = env.VITE_TMDB_API_KEY || ''
              if (key) {
                const sep = proxyReq.path.includes('?') ? '&' : '?'
                proxyReq.path += `${sep}api_key=${key}`
              }
            })
          },
          secure: true,
        },
      }
    },
    preview: {
      proxy: {
        '/pmapi': {
          target: 'https://www.premiumize.me',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/pmapi/, '/api'),
          secure: true,
        },
        '/imdbapi': {
          target: 'https://api.imdbapi.dev',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/imdbapi/, ''),
          secure: true,
        },
        '/scenenzbsapi': {
          target: 'https://scenenzbs.com',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/scenenzbsapi/, ''),
          secure: true,
        },
        '/ossub': {
          target: 'https://dl.opensubtitles.org',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/ossub/, ''),
          secure: true,
        },
        '/api/tmdb': {
          target: 'https://api.themoviedb.org/3',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/tmdb/, ''),
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq) => {
              const key = env.VITE_TMDB_API_KEY || ''
              if (key) {
                const sep = proxyReq.path.includes('?') ? '&' : '?'
                proxyReq.path += `${sep}api_key=${key}`
              }
            })
          },
          secure: true,
        },
      }
    },
    build: {
      chunkSizeWarningLimit: 600,
      rollupOptions: {
        output: {
          manualChunks: {
            'react-vendor': ['react', 'react-dom', 'react-router-dom'],
            'hls': ['hls.js'],
            'dexie': ['dexie'],
          }
        }
      }
    }
  }
})
