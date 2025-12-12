import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0', // 前端開放給外部瀏覽器使用（非後端）
    port: 5766,
    proxy: {
      '/api': {
        target: 'http://localhost:5341',
        changeOrigin: true,
      }
    }
  },
  preview: {
    host: '0.0.0.0',  // 允許外部存取
    port: 5766,
    strictPort: true,
    allowedHosts: ['localhost'],
    proxy: {
      '/api': {
        target: 'http://localhost:5341',
        changeOrigin: true,
      }
    }
  }
})
