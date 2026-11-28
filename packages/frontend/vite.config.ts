import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// One policy, written in netlify.toml for production.
const csp = /Content-Security-Policy = "([^"]+)"/.exec(
  readFileSync(resolve(import.meta.dirname, '../../netlify.toml'), 'utf8'),
)?.[1];
if (!csp) throw new Error('netlify.toml has no Content-Security-Policy');
// The dev server needs the React refresh inline script, HMR and the local functions.
const devCsp = csp
  .replace("script-src 'self'", "script-src 'self' 'unsafe-inline'")
  .replace("connect-src 'self'", "connect-src 'self' ws://localhost:5174 http://localhost:8888")
  .replace('; upgrade-insecure-requests', '');

export default defineConfig({
  base: './',
  plugins: [react()],
  resolve: {
    alias: {
      '@': resolve(import.meta.dirname, './src'),
    },
  },
  server: {
    port: 5174,
    // The dev policy allows HMR on this port only.
    strictPort: true,
    open: true,
    headers: { 'Content-Security-Policy': devCsp },
  },
  preview: {
    headers: { 'Content-Security-Policy': csp },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
  legacy: {
    inconsistentCjsInterop: true,
  },
  define: {
    global: 'globalThis',
  },
});
