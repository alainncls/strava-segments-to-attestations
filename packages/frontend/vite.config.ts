import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5174,
    open: true,
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: 'wallet',
              test: /node_modules[\\/](?:\.pnpm[\\/].*[\\/])?(?:@coinbase|@noble|@reown|@safe-global|@wagmi|ox|viem|wagmi)[\\/]/,
              priority: 10,
            },
          ],
        },
      },
    },
  },
  legacy: {
    inconsistentCjsInterop: true,
  },
  define: {
    global: 'globalThis',
  },
});
