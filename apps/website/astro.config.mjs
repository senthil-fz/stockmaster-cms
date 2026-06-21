// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import icon from 'astro-icon';

// https://astro.build/config
export default defineConfig({
  site: 'https://stockmasternagaraj.com',
  // Static landing page - no SSR adapter needed.
  output: 'static',
  // Real icon set (Phosphor via Iconify) so the page never hand-rolls SVG glyphs.
  integrations: [icon()],
  // Old route -> renamed route (keeps existing links working).
  redirects: {
    '/privacy': '/privacy-policy',
  },
  server: {
    port: 4321,
  },
  vite: {
    plugins: [tailwindcss()],
  },
});
