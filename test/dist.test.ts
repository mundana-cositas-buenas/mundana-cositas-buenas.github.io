// Builds the app into a temp dir and checks what gets deployed.
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { build } from 'vite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const raiz = new URL('..', import.meta.url).pathname;
let dist: string;
let archivos: string[];
const leer = (f: string) => readFileSync(join(dist, f), 'utf8');

beforeAll(async () => {
  dist = mkdtempSync(join(tmpdir(), 'mundana-dist-'));
  await build({ root: raiz, logLevel: 'silent', build: { outDir: dist, emptyOutDir: true } });
  archivos = readdirSync(dist, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => relative(dist, join(e.parentPath, e.name)))
    .sort();
}, 120_000);

afterAll(() => rmSync(dist, { recursive: true, force: true }));

/** The `["…"]` array the plugin injected into sw.js. */
const precacheDe = (sw: string): string[] => {
  const m = sw.match(/\[("[^"\]]*"(?:,"[^"\]]*")*)\]/);
  expect(m, 'precache list in sw.js').toBeTruthy();
  return JSON.parse(`[${m![1]}]`);
};

describe('dist/', () => {
  it('has the page, manifest, icons and the service worker at the root', () => {
    for (const f of ['index.html', 'manifest.webmanifest', 'sw.js', 'icons/icon-192.png', 'icons/maskable-512.png'])
      expect(archivos).toContain(f);
  });

  it('precaches every deployed file except sw.js', () => {
    const lista = precacheDe(leer('sw.js'));
    expect(lista).toEqual(archivos.filter((f) => f !== 'sw.js'));
  });

  it('builds a self-contained classic-script SW with the placeholders replaced', () => {
    const sw = leer('sw.js');
    expect(sw).not.toMatch(/\bimport\s*[({"'`\w*]|\bexport\s*[{\w*]/);
    expect(sw).not.toContain('__PRECACHE__');
    expect(sw).not.toContain('__VERSION__');
    expect(sw).toMatch(/"[0-9a-f]{8}"/);
  });

  it('loads the app script and stylesheet from the build', () => {
    const html = leer('index.html');
    for (const [, src] of html.matchAll(/(?:src|href)="\/([^"]+)"/g)) expect(archivos, src).toContain(src);
  });

  it('references no external host at runtime', () => {
    // Svelte's error messages link to its docs, and SVG/XML namespaces are identifiers, not requests.
    const permitido = /^https?:\/\/(svelte\.dev\/e\/|www\.w3\.org\/)/;
    const externos = archivos
      .filter((f) => /\.(html|js|css|webmanifest|svg)$/.test(f))
      .flatMap((f) => [...leer(f).matchAll(/https?:\/\/[^\s"'`)<>]+/g)].map((m) => `${f}: ${m[0]}`))
      .filter((s) => !permitido.test(s.split(': ')[1]));
    expect(externos).toEqual([]);
  });
});
