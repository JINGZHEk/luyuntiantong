import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import viteCompression from 'vite-plugin-compression';

export default defineConfig({
  plugins: [
    react(),
    viteCompression({
      verbose: true,
      disable: false,
      threshold: 10240,
      algorithm: 'gzip',
      ext: '.gz',
    }),
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  server: {
    port: 3000,
    open: true,
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('echarts')) return 'vendor-echarts';
          if (id.includes('three') || id.includes('@react-three') || id.includes('postprocessing')) return 'vendor-three';
          if (id.includes('antd') || id.includes('@ant-design')) return 'vendor-antd';
          if (id.includes('react') || id.includes('react-dom') || id.includes('react-router')) return 'vendor-react';
          return undefined;
        },
      },
    },
  },
});
