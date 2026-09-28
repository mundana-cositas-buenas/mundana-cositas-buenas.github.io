/** Lowercase, without accents: for search. */
export function normalizar(s: string): string {
  return s.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('es').trim();
}

/** True if every word of `consulta` appears in `texto`, ignoring case and accents. */
export function coincide(texto: string, consulta: string): boolean {
  const t = normalizar(texto);
  return normalizar(consulta)
    .split(/\s+/)
    .every((p) => t.includes(p));
}

/**
 * The record a typed name refers to, for keyboard-first pickers: an exact name
 * (ignoring case and accents), else the only one that matches the words typed.
 */
export function buscarPorNombre<T extends { nombre: string }>(xs: readonly T[], texto: string): T | undefined {
  if (!texto.trim()) return undefined;
  const n = normalizar(texto);
  const exacto = xs.find((x) => normalizar(x.nombre) === n);
  if (exacto) return exacto;
  const parecidos = xs.filter((x) => coincide(x.nombre, texto));
  return parecidos.length === 1 ? parecidos[0] : undefined;
}

const dos = (n: number) => String(n).padStart(2, '0');

/** Local date and time: "05/03/2026 14:07". */
export function formatFechaHora(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return `${dos(d.getDate())}/${dos(d.getMonth() + 1)}/${d.getFullYear()} ${dos(d.getHours())}:${dos(d.getMinutes())}`;
}
