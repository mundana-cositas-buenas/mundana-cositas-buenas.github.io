// Global single-key shortcuts, active only while not typing in a field.
// Pages mark their targets with `data-atajo="buscar"` / `data-atajo="nuevo"`.

export type Atajo = { tipo: 'ir'; hash: string } | { tipo: 'foco'; objetivo: 'buscar' | 'nuevo' } | { tipo: 'ayuda' };

export const ATAJOS: readonly { tecla: string; descripcion: string; atajo: Atajo }[] = [
  { tecla: 'r', descripcion: 'Ir a Recetas', atajo: { tipo: 'ir', hash: '#/costos' } },
  { tecla: 'i', descripcion: 'Ir a Insumos', atajo: { tipo: 'ir', hash: '#/costos/insumos' } },
  { tecla: 'p', descripcion: 'Ir a Productos', atajo: { tipo: 'ir', hash: '#/stock' } },
  { tecla: 'm', descripcion: 'Ir a Movimientos (registrar venta, entrada o ajuste)', atajo: { tipo: 'ir', hash: '#/stock/movimientos' } },
  { tecla: 'a', descripcion: 'Ir a Alertas de stock', atajo: { tipo: 'ir', hash: '#/stock/alertas' } },
  { tecla: 'b', descripcion: 'Ir a Backup', atajo: { tipo: 'ir', hash: '#/backup' } },
  { tecla: 'n', descripcion: 'Nuevo: insumo, producto, receta, línea de receta o movimiento', atajo: { tipo: 'foco', objetivo: 'nuevo' } },
  { tecla: '/', descripcion: 'Buscar en la lista', atajo: { tipo: 'foco', objetivo: 'buscar' } },
  { tecla: '?', descripcion: 'Mostrar u ocultar esta ayuda', atajo: { tipo: 'ayuda' } },
];

export interface Tecla {
  key: string;
  ctrlKey: boolean;
  altKey: boolean;
  metaKey: boolean;
}

export interface Destino {
  tagName: string;
  type?: string;
  isContentEditable?: boolean;
}

const NO_TEXTO = new Set(['checkbox', 'radio', 'button', 'submit', 'reset', 'file', 'color', 'range']);

/** True if keys typed at `d` are text for it (text inputs, selects, textareas): shortcuts must not fire. */
export function enCampo(d: Destino | null): boolean {
  if (!d) return false;
  if (d.isContentEditable) return true;
  const tag = d.tagName.toUpperCase();
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  return tag === 'INPUT' && !NO_TEXTO.has((d.type ?? 'text').toLowerCase());
}

/** The shortcut for a key press, if any. Modified keys (Ctrl, Alt, Cmd) belong to the browser. */
export function atajoDe(t: Tecla, destino: Destino | null): Atajo | undefined {
  if (t.ctrlKey || t.altKey || t.metaKey || enCampo(destino)) return undefined;
  const key = t.key.length === 1 ? t.key.toLowerCase() : t.key;
  return ATAJOS.find((a) => a.tecla === key)?.atajo;
}
