import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // flag #6: proxy /api/* to Flask on port 5001 (flag #5)
    proxy: {
      '/api': 'http://localhost:5001',
    },
  },
})
