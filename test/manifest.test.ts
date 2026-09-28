import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import config from '../vite.config.ts';

const PUBLIC = new URL('../public/', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('manifest.webmanifest', PUBLIC), 'utf8'));
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

type Icono = { src: string; sizes: string; type: string; purpose?: string };

/** Width/height from a PNG's IHDR chunk. */
function tamPng(buf: Buffer) {
  expect(buf.subarray(1, 4).toString('ascii')).toBe('PNG');
  return `${buf.readUInt32BE(16)}x${buf.readUInt32BE(20)}`;
}

describe('manifest.webmanifest', () => {
  it('has the fields Chrome needs to offer installation', () => {
    for (const k of ['name', 'short_name', 'start_url', 'scope', 'display', 'background_color', 'theme_color'])
      expect(manifest[k], k).toBeTruthy();
    expect(manifest.display).toBe('standalone');
  });

  it('has start_url inside scope, both inside the Vite base', () => {
    const base = new URL(config.base ?? '/', 'https://mundana.example');
    const url = new URL('manifest.webmanifest', base);
    const start = new URL(manifest.start_url, url).href;
    const scope = new URL(manifest.scope, url).href;
    expect(scope.startsWith(base.href)).toBe(true);
    expect(start.startsWith(scope)).toBe(true);
  });

  it('declares 192, 512 and maskable PNG icons that exist with the declared size', () => {
    const iconos: Icono[] = manifest.icons;
    const png = iconos.filter((i) => i.type === 'image/png');
    expect(png.some((i) => i.sizes === '192x192')).toBe(true);
    expect(png.some((i) => i.sizes === '512x512' && (i.purpose ?? 'any').includes('any'))).toBe(true);
    expect(png.some((i) => i.purpose?.includes('maskable'))).toBe(true);
    for (const i of iconos) {
      const f = new URL(i.src, PUBLIC);
      expect(existsSync(f), i.src).toBe(true);
      if (i.type === 'image/png') expect(tamPng(readFileSync(f)), i.src).toBe(i.sizes);
    }
  });

  it('is linked from index.html along with theme color and icon', () => {
    expect(html).toMatch(/<link rel="manifest" href="\/manifest\.webmanifest"/);
    expect(html).toContain(`<meta name="theme-color" content="${manifest.theme_color}"`);
    for (const [, href] of html.matchAll(/<link rel="icon" href="\/([^"]+)"/g))
      expect(existsSync(new URL(href, PUBLIC)), href).toBe(true);
  });
});
