import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/constants.ts', 'src/types.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  splitting: false,
});
