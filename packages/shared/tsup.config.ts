import { defineConfig } from 'tsup';

// Dual-format build so the package has real, statically-analyzable named exports
// for BOTH consumers: Vite/Rollup (ESM, .mjs) and NestJS (CommonJS, .js).
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  sourcemap: true,
});
