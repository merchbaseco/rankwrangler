import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwind from '@tailwindcss/vite';

export default defineConfig({
  srcDir: 'src',
  publicDir: 'public',
  site: 'https://rankwrangler.com',
  integrations: [react()],
  server: {
    host: true
  },
  vite: {
    plugins: [tailwind()]
  }
});
