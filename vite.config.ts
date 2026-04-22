import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // Proxy Premiumize API calls to avoid CORS
      '/pmapi': {
        target: 'https://www.premiumize.me',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/pmapi/, '/api'),
        secure: true,
      },
      // Proxy imdbapi.dev calls to avoid CORS (API does not send CORS headers)
      '/imdbapi': {
        target: 'https://api.imdbapi.dev',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/imdbapi/, ''),
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
})
