import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { tanstackRouter } from '@tanstack/router-plugin/vite';

// NOTE: the TanStack Router plugin MUST come before @vitejs/plugin-react,
// or route-tree codegen / HMR misbehaves.
export default defineConfig({
  plugins: [
    tanstackRouter({ target: 'react', autoCodeSplitting: true }),
    react(),
    tailwindcss(),
  ],
  server: {
    port: 5173,
  },
  build: {
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        // Split heavy vendors into cacheable chunks instead of one big route bundle.
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (
            id.includes('@tiptap') ||
            id.includes('prosemirror') ||
            id.includes('/yjs@') ||
            id.includes('y-protocols')
          ) {
            return 'editor-vendor';
          }
          if (id.includes('@tanstack')) return 'tanstack';
          return undefined;
        },
      },
    },
  },
});
