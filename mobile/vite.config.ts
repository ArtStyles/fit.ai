import { defineConfig } from 'vite'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  envDir: fileURLToPath(new URL('.', import.meta.url)),
  resolve: { alias: { '@': fileURLToPath(new URL('../src', import.meta.url)) } },
  oxc: { jsx: { runtime: 'automatic' } },
  build: { outDir: 'dist', emptyOutDir: true, target: 'es2022' },
  server: { host: '127.0.0.1', port: 4178, strictPort: true },
  preview: { host: '127.0.0.1', port: 4178, strictPort: true },
})
