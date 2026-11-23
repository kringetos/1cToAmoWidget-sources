import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  
  // ВАЖНО: Добавляем этот блок для React, чтобы он не искал процесс Node.js в браузере
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
  },

  build: {
    outDir: 'widget',
    emptyOutDir: false,
    lib: {
      entry: 'src/main.jsx',
      name: 'AmoWidgetReact', 
      fileName: () => 'app.js',
      formats: ['iife'], 
    },
    rollupOptions: {
      external: [],
    }
  }
});