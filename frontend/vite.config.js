import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Browser calls /api/... and Vite forwards to Flask - no CORS headaches in development
    proxy: { '/api': { target: 'http://127.0.0.1:5000', changeOrigin: true } },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/__tests__/setup.js',
    css: false,
  },
})
