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
