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

const dos = (n: number) => String(n).padStart(2, '0');

/** Local date and time: "05/03/2026 14:07". */
export function formatFechaHora(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return `${dos(d.getDate())}/${dos(d.getMonth() + 1)}/${d.getFullYear()} ${dos(d.getHours())}:${dos(d.getMinutes())}`;
}
