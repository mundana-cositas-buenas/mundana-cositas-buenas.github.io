import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';

// Organization Pages site (mundana-cositas-buenas.github.io): served at the domain root.
export default defineConfig({
  base: '/',
  plugins: [svelte()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
