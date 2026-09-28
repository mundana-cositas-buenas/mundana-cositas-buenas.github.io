// Generates public/icons/* (PNG + SVG) from a single geometric design, with no
// image tooling: a tiny rasterizer (4×4 supersampling) and PNG encoder on node:zlib.
// Run with `node scripts/iconos.mjs` and commit the output.
import { mkdirSync, writeFileSync } from 'node:fs';
import { crc32, deflateSync } from 'node:zlib';

const FONDO = [0x8a, 0x4b, 0x16]; // --accent
const LETRA = [0xfa, 0xfa, 0xf7]; // --bg

// Block "M" in a 100×100 box.
const M = [
  [24, 72], [24, 28], [34, 28], [50, 51], [66, 28], [76, 28], [76, 72],
  [66, 72], [66, 45], [54, 63], [46, 63], [34, 45], [34, 72],
];

const escalar = (pts, f) => pts.map(([x, y]) => [50 + (x - 50) * f, 50 + (y - 50) * f]);

function dentro(pts, x, y) {
  let d = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i];
    const [xj, yj] = pts[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) d = !d;
  }
  return d;
}

function enRedondeado(x, y, r) {
  if (r === 0) return x >= 0 && x <= 100 && y >= 0 && y <= 100;
  const cx = Math.min(Math.max(x, r), 100 - r);
  const cy = Math.min(Math.max(y, r), 100 - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}

function rasterizar(tam, radio, letra) {
  const px = Buffer.alloc(tam * tam * 4);
  const S = 4;
  for (let py = 0; py < tam; py++) {
    for (let pxl = 0; pxl < tam; pxl++) {
      let fondo = 0;
      let tinta = 0;
      for (let sy = 0; sy < S; sy++) {
        for (let sx = 0; sx < S; sx++) {
          const x = ((pxl + (sx + 0.5) / S) / tam) * 100;
          const y = ((py + (sy + 0.5) / S) / tam) * 100;
          if (!enRedondeado(x, y, radio)) continue;
          fondo++;
          if (dentro(letra, x, y)) tinta++;
        }
      }
      const i = (py * tam + pxl) * 4;
      const t = fondo ? tinta / fondo : 0;
      for (let c = 0; c < 3; c++) px[i + c] = Math.round(FONDO[c] * (1 - t) + LETRA[c] * t);
      px[i + 3] = Math.round((fondo / (S * S)) * 255);
    }
  }
  return png(tam, px);
}

function png(tam, rgba) {
  const bloque = (tipo, datos) => {
    const largo = Buffer.alloc(4);
    largo.writeUInt32BE(datos.length);
    const cuerpo = Buffer.concat([Buffer.from(tipo, 'ascii'), datos]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(cuerpo));
    return Buffer.concat([largo, cuerpo, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(tam, 0);
  ihdr.writeUInt32BE(tam, 4);
  ihdr.set([8, 6, 0, 0, 0], 8); // 8-bit RGBA
  const filas = Buffer.alloc(tam * (tam * 4 + 1));
  for (let y = 0; y < tam; y++) rgba.copy(filas, y * (tam * 4 + 1) + 1, y * tam * 4, (y + 1) * tam * 4);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    bloque('IHDR', ihdr),
    bloque('IDAT', deflateSync(filas, { level: 9 })),
    bloque('IEND', Buffer.alloc(0)),
  ]);
}

const hex = (c) => '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
<rect width="100" height="100" rx="18" fill="${hex(FONDO)}"/>
<polygon points="${M.map((p) => p.join(',')).join(' ')}" fill="${hex(LETRA)}"/>
</svg>
`;

const dir = new URL('../public/icons/', import.meta.url);
mkdirSync(dir, { recursive: true });
writeFileSync(new URL('icon-192.png', dir), rasterizar(192, 18, M));
writeFileSync(new URL('icon-512.png', dir), rasterizar(512, 18, M));
// Maskable: full bleed, letter shrunk into the 80 % safe zone.
writeFileSync(new URL('maskable-512.png', dir), rasterizar(512, 0, escalar(M, 0.75)));
writeFileSync(new URL('icon.svg', dir), svg);
