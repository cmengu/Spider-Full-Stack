import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [tailwindcss(), react()],
  optimizeDeps: {
    include: ['react-plotly.js/factory', 'plotly.js-dist-min'],
  },
  test: {
    environment: 'jsdom',
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:5001',
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
})
