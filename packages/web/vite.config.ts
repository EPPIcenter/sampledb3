import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: process.env.API_TARGET || 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  optimizeDeps: {
    // Pre-bundle these dependencies to prevent 504 errors during navigation
    include: [
      'react',
      'react-dom',
      'react-router-dom',
      '@tanstack/react-query',
    ],
    // Don't hold requests until crawl ends - process optimizations in background
    holdUntilCrawlEnd: false,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
})
