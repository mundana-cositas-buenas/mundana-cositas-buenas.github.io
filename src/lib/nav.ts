export const SECCIONES = [
  { id: 'costos', titulo: 'Costos' },
  { id: 'stock', titulo: 'Stock' },
  { id: 'backup', titulo: 'Backup' },
] as const;

export type Seccion = (typeof SECCIONES)[number]['id'];

/** Maps a location hash (`#/stock`) to a section, defaulting to the first one. */
export function seccionDesdeHash(hash: string): Seccion {
  const id = hash.replace(/^#\/?/, '').split('/')[0];
  return SECCIONES.find((s) => s.id === id)?.id ?? SECCIONES[0].id;
}
