import { describe, expect, it } from 'vitest';
import {
  cachesViejos,
  esMensajeActivar,
  estrategia,
  listaPrecache,
  nombreCache,
  urlsPrecache,
  versionBuild,
} from './logic';

const SCOPE = 'https://mundana.example/';
const PRECACHE = new Set(urlsPrecache(['index.html', 'assets/index-abc.js', 'icons/icon-192.png'], SCOPE));
const get = (url: string, mode = 'no-cors') => ({ method: 'GET', url, mode });

describe('cachesViejos', () => {
  it('deletes only our other versions', () => {
    const actual = nombreCache('bbbb');
    expect(cachesViejos(['mundana-aaaa', actual, 'otra-cosa', 'mundana-cccc'], actual)).toEqual([
      'mundana-aaaa',
      'mundana-cccc',
    ]);
    expect(cachesViejos([actual], actual)).toEqual([]);
  });
});

describe('listaPrecache', () => {
  it('sorts, dedupes, normalizes and drops the SW, maps and dotfiles', () => {
    expect(
      listaPrecache([
        'sw.js',
        'index.html',
        'assets\\index-abc.js',
        '/assets/index-abc.js',
        'assets/index-abc.js.map',
        'icons/.DS_Store',
        'manifest.webmanifest',
      ]),
    ).toEqual(['assets/index-abc.js', 'index.html', 'manifest.webmanifest']);
  });

  it('keeps files that merely contain sw.js in their name', () => {
    expect(listaPrecache(['assets/sw.js-helper.js', 'icons/sw.js'])).toEqual(['assets/sw.js-helper.js', 'icons/sw.js']);
  });
});

describe('versionBuild', () => {
  const base = [
    { nombre: 'index.html', contenido: '<html>' },
    { nombre: 'icons/a.png', contenido: new Uint8Array([1, 2, 3]) },
  ];

  it('is stable and independent of order', () => {
    const v = versionBuild(base);
    expect(v).toMatch(/^[0-9a-f]{8}$/);
    expect(versionBuild([...base].reverse())).toBe(v);
  });

  it('changes when any content or name changes', () => {
    const v = versionBuild(base);
    expect(versionBuild([base[0], { nombre: 'icons/a.png', contenido: new Uint8Array([1, 2, 4]) }])).not.toBe(v);
    expect(versionBuild([{ nombre: 'index.html', contenido: '<html >' }, base[1]])).not.toBe(v);
    expect(versionBuild([base[0], { ...base[1], nombre: 'icons/b.png' }])).not.toBe(v);
    // Name/content boundary is unambiguous.
    expect(versionBuild([{ nombre: 'ab', contenido: 'c' }])).not.toBe(versionBuild([{ nombre: 'a', contenido: 'bc' }]));
  });
});

describe('urlsPrecache', () => {
  it('resolves against the scope, also under a sub-path', () => {
    expect(urlsPrecache(['index.html', 'assets/x.js'], SCOPE)).toEqual([
      'https://mundana.example/index.html',
      'https://mundana.example/assets/x.js',
    ]);
    expect(urlsPrecache(['index.html'], 'https://u.github.io/repo/')).toEqual(['https://u.github.io/repo/index.html']);
  });
});

describe('estrategia', () => {
  it('serves precached files from the cache', () => {
    expect(estrategia(get(SCOPE + 'assets/index-abc.js'), SCOPE, PRECACHE)).toEqual({
      tipo: 'cache',
      clave: SCOPE + 'assets/index-abc.js',
    });
  });

  it('serves index.html for any navigation in scope (hash routing)', () => {
    const index = { tipo: 'cache', clave: SCOPE + 'index.html' };
    expect(estrategia(get(SCOPE, 'navigate'), SCOPE, PRECACHE)).toEqual(index);
    expect(estrategia(get(SCOPE + '#/stock/alertas', 'navigate'), SCOPE, PRECACHE)).toEqual(index);
    expect(estrategia(get(SCOPE + '?utm=x', 'navigate'), SCOPE, PRECACHE)).toEqual(index);
    expect(estrategia(get(SCOPE + 'index.html', 'navigate'), SCOPE, PRECACHE)).toEqual(index);
  });

  it('leaves everything else to the network', () => {
    const red = { tipo: 'red' };
    expect(estrategia(get(SCOPE + 'otra.js'), SCOPE, PRECACHE)).toEqual(red);
    expect(estrategia(get(SCOPE + 'assets/index-abc.js?v=2'), SCOPE, PRECACHE)).toEqual(red);
    expect(estrategia({ ...get(SCOPE + 'index.html'), method: 'POST' }, SCOPE, PRECACHE)).toEqual(red);
    expect(estrategia(get('https://cdn.example/x.js'), SCOPE, PRECACHE)).toEqual(red);
    expect(estrategia(get('https://otro.example/', 'navigate'), SCOPE, PRECACHE)).toEqual(red);
  });

  it('does not treat pages outside a sub-path scope as ours', () => {
    const scope = 'https://u.github.io/repo/';
    const pre = new Set(urlsPrecache(['index.html'], scope));
    expect(estrategia(get('https://u.github.io/otro/', 'navigate'), scope, pre)).toEqual({ tipo: 'red' });
    expect(estrategia(get('https://u.github.io/repo/', 'navigate'), scope, pre).tipo).toBe('cache');
  });
});

describe('esMensajeActivar', () => {
  it('recognizes only the activate message', () => {
    expect(esMensajeActivar({ tipo: 'activar' })).toBe(true);
    expect(esMensajeActivar({ tipo: 'otro' })).toBe(false);
    expect(esMensajeActivar('activar')).toBe(false);
    expect(esMensajeActivar(null)).toBe(false);
  });
});
