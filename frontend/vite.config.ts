import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0', // 前端開放給外部瀏覽器使用（非後端）
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:5431',
        changeOrigin: true,
      }
    }
  }
})
