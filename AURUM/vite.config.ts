import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'
import { fileURLToPath } from 'url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  main: {
    build: {
      lib: {
        entry: resolve(__dirname, 'electron/main.ts')
      },
      rollupOptions: {
        external: ['electron-store']
      }
    }
  },
  preload: {
    build: {
      lib: {
        entry: resolve(__dirname, 'electron/preload.ts')
      },
      rollupOptions: {
        external: ['electron-store']
      }
    }
  },
  renderer: {
    root: resolve(__dirname, '.'),
    build: {
      rollupOptions: {
        input: resolve(__dirname, 'index.html')
      }
    },
    plugins: [react()],
    resolve: {
      alias: { '@': resolve(__dirname, 'src') }
    },
    worker: { format: 'es' },
    server: { port: 5173 },
    base: './'
  }
})
