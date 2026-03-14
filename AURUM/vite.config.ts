import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  main: {
    build: {
      rollupOptions: {
        external: ['electron-store']
      }
    }
  },
  preload: {
    build: {
      rollupOptions: {
        external: ['electron-store']
      }
    }
  },
  renderer: {
    plugins: [react()],
    resolve: {
      alias: { '@': path.resolve(__dirname, './src') }
    },
    worker: { format: 'es' },
    server: { port: 5173 },
    base: './'
  }
})
