// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  site: 'https://stockmasternagaraj.com',
  // Static landing page — no SSR adapter needed.
  output: 'static',
  server: {
    port: 4321,
  },
  vite: {
    plugins: [tailwindcss()],
  },
});
