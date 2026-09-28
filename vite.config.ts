import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Plugin, ResolvedConfig } from 'vite';
import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { listaPrecache, versionBuild } from './src/pwa/logic.ts';

const SW = fileURLToPath(new URL('./src/pwa/sw.ts', import.meta.url));

const archivosDe = (dir: string): string[] =>
  readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => relative(dir, join(e.parentPath, e.name)));

/**
 * Builds src/pwa/sw.ts to /sw.js and injects the list of every build + public file
 * (__PRECACHE__) and a content hash of them (__VERSION__, used as the cache name).
 */
function precache(): Plugin {
  let config: ResolvedConfig;
  return {
    name: 'mundana-precache',
    apply: 'build',
    configResolved(c) {
      config = c;
    },
    buildStart() {
      this.emitFile({ type: 'chunk', id: SW, fileName: 'sw.js' });
    },
    generateBundle: {
      order: 'post',
      handler(_, bundle) {
        const sw = bundle['sw.js'];
        if (sw?.type !== 'chunk') return this.error('sw.js missing from the bundle');
        if (sw.imports.length) return this.error(`sw.js must be self-contained, imports: ${sw.imports}`);
        const publicos = config.publicDir ? archivosDe(config.publicDir) : [];
        const archivos = [
          ...Object.values(bundle).map((f) => ({
            nombre: f.fileName,
            contenido: f.type === 'chunk' ? f.code : f.source,
          })),
          ...publicos.map((p) => ({ nombre: p, contenido: readFileSync(join(config.publicDir, p)) })),
        ];
        const lista = listaPrecache(archivos.map((a) => a.nombre));
        const version = versionBuild(archivos.filter((a) => lista.includes(a.nombre) || a.nombre === 'sw.js'));
        sw.code = sw.code
          .replaceAll('__PRECACHE__', JSON.stringify(lista))
          .replaceAll('__VERSION__', JSON.stringify(version));
      },
    },
  };
}

// Organization Pages site (mundana-cositas-buenas.github.io): served at the domain root.
export default defineConfig({
  base: '/',
  plugins: [svelte(), precache()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
  },
});
