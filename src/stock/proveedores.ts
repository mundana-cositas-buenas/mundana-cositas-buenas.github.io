// Supplier accounts: pure functions. The balance is never stored, it is the sum of the account entries:
// manual entries (compra, pago, ajuste) plus the stock entries that added to the account.

import type { Centavos } from '../lib/money';
import type { MedioPago, Movimiento, OperacionProveedor, Proveedor, TipoOperacion } from './types';

export const PLAZO_DEFAULT = 15; // days
export const DIAS_AVISO = 3; // warn about purchases due within this many days

export const TIPOS_OPERACION: readonly { id: TipoOperacion; titulo: string }[] = [
  { id: 'compra', titulo: 'Compra' },
  { id: 'pago', titulo: 'Pago' },
  { id: 'ajuste', titulo: 'Ajuste' },
];

export const MEDIOS_PAGO: readonly { id: MedioPago; titulo: string }[] = [
  { id: 'efectivo', titulo: 'Efectivo' },
  { id: 'transferencia', titulo: 'Transferencia' },
  { id: 'debito', titulo: 'Débito' },
  { id: 'credito', titulo: 'Crédito' },
  { id: 'cheque', titulo: 'Cheque' },
  { id: 'otro', titulo: 'Otro' },
];

export const tituloMedio = (m: MedioPago | undefined) => MEDIOS_PAGO.find((x) => x.id === m)?.titulo ?? '';

/** One line of a supplier's account: a manual entry or a stock entry that added to it. */
export type Asiento =
  | { tipo: TipoOperacion; id: string; fecha: string; anulado: boolean; op: OperacionProveedor }
  | { tipo: 'entrada'; id: string; fecha: string; anulado: boolean; mov: Movimiento };

/** Signed effect on the balance (what is owed): compra and entrada add, pago subtracts, ajuste is signed; 0 if voided. */
export function efectoAsiento(a: Asiento): Centavos {
  if (a.anulado) return 0;
  if (a.tipo === 'entrada') return a.mov.importe ?? 0;
  return a.tipo === 'pago' ? -a.op.importe : a.op.importe;
}

const porFecha = (a: Asiento, b: Asiento) => a.fecha.localeCompare(b.fecha) || a.id.localeCompare(b.id);

/** The account lines of one supplier, oldest first. Movements without an importe are not part of it. */
export function asientos(ops: readonly OperacionProveedor[], movs: readonly Movimiento[]): Asiento[] {
  const res: Asiento[] = ops.map((op) => ({ tipo: op.tipo, id: op.id, fecha: op.fecha, anulado: !!op.anuladoEn, op }));
  for (const mov of movs) {
    if (mov.tipo === 'entrada' && mov.importe !== undefined) {
      res.push({ tipo: 'entrada', id: mov.id, fecha: mov.fecha, anulado: !!mov.anuladoEn, mov });
    }
  }
  return res.sort(porFecha);
}

/** What is owed to the supplier; negative when the supplier owes us (paid in advance). */
export function saldo(as: readonly Asiento[]): Centavos {
  return as.reduce((s, a) => s + efectoAsiento(a), 0);
}

/** The account newest first, each line with the balance right after it. */
export function cuentaCorriente(as: readonly Asiento[]): { asiento: Asiento; saldo: Centavos }[] {
  let s = 0;
  return [...as]
    .sort(porFecha)
    .map((asiento) => ({ asiento, saldo: (s += efectoAsiento(asiento)) }))
    .reverse();
}

const DIA = 24 * 60 * 60 * 1000;

const medianoche = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/** The local day a purchase is due: its date plus the payment term. */
export function vencimiento(fecha: string, plazoDias: number): Date {
  const d = medianoche(new Date(fecha));
  d.setDate(d.getDate() + plazoDias);
  return d;
}

/** Calendar days from `ahora` to `dia` (negative if it already passed). */
export function diasHasta(dia: Date, ahora: Date): number {
  return Math.round((medianoche(dia).getTime() - medianoche(ahora).getTime()) / DIA);
}

export interface Pendiente {
  asiento: Asiento; // a compra or an entrada
  pendiente: Centavos; // what is still unpaid of it
  vence: Date;
  dias: number; // until it is due; negative: overdue
}

/**
 * The purchases (compras and entradas) not fully paid yet, oldest first. Payments and negative
 * adjustments pay the oldest debt first; positive adjustments are debt too (in date order) but
 * never fall due, so they are not listed.
 */
export function pendientes(as: readonly Asiento[], plazoDias: number, ahora = new Date()): Pendiente[] {
  const vivos = [...as].sort(porFecha).filter((a) => !a.anulado);
  let credito = vivos.reduce((s, a) => s + Math.max(0, -efectoAsiento(a)), 0);
  const res: Pendiente[] = [];
  for (const a of vivos) {
    const deuda = efectoAsiento(a);
    if (deuda <= 0) continue;
    const pagado = Math.min(deuda, credito);
    credito -= pagado;
    if (pagado === deuda || a.tipo === 'ajuste') continue;
    const vence = vencimiento(a.fecha, plazoDias);
    res.push({ asiento: a, pendiente: deuda - pagado, vence, dias: diasHasta(vence, ahora) });
  }
  return res;
}

/** "vencido hace 2 días", "vence hoy", "vence en 3 días". */
export function describirVencimiento(dias: number): string {
  if (dias < 0) return `vencido hace ${-dias} ${dias === -1 ? 'día' : 'días'}`;
  if (dias === 0) return 'vence hoy';
  return `vence en ${dias} ${dias === 1 ? 'día' : 'días'}`;
}

export interface EstadoCuenta {
  saldo: Centavos;
  vencido: Centavos; // overdue purchases
  porVencer: Centavos; // due within DIAS_AVISO days (today included)
  proximo?: Pendiente; // the next purchase to pay (the oldest pending one)
}

export function estadoCuenta(as: readonly Asiento[], plazoDias: number, ahora = new Date()): EstadoCuenta {
  const ps = pendientes(as, plazoDias, ahora);
  let vencido = 0;
  let porVencer = 0;
  for (const p of ps) {
    if (p.dias < 0) vencido += p.pendiente;
    else if (p.dias <= DIAS_AVISO) porVencer += p.pendiente;
  }
  return { saldo: saldo(as), vencido, porVencer, proximo: ps[0] };
}

/** True if the supplier has purchases overdue or due within DIAS_AVISO days. */
export const conAviso = (e: EstadoCuenta) => e.vencido > 0 || e.porVencer > 0;

export interface AvisoPago {
  proveedor: Proveedor;
  estado: EstadoCuenta;
}

/** Suppliers (active or not) with payments overdue or due soon: most overdue first, then by name. */
export function avisosPago(
  proveedores: readonly Proveedor[],
  asientosDe: ReadonlyMap<string, readonly Asiento[]>,
  ahora = new Date(),
): AvisoPago[] {
  return proveedores
    .map((proveedor) => ({ proveedor, estado: estadoCuenta(asientosDe.get(proveedor.id) ?? [], proveedor.plazoDias, ahora) }))
    .filter((a) => conAviso(a.estado))
    .sort(
      (a, b) =>
        (a.estado.proximo?.dias ?? 0) - (b.estado.proximo?.dias ?? 0) ||
        a.proveedor.nombre.localeCompare(b.proveedor.nombre, 'es', { sensitivity: 'base' }),
    );
}

/** The account lines of every supplier, by supplier id. */
export function asientosPorProveedor(ops: readonly OperacionProveedor[], movs: readonly Movimiento[]): Map<string, Asiento[]> {
  const opsDe = new Map<string, OperacionProveedor[]>();
  const movsDe = new Map<string, Movimiento[]>();
  for (const o of ops) opsDe.set(o.proveedorId, [...(opsDe.get(o.proveedorId) ?? []), o]);
  for (const m of movs) if (m.proveedorId) movsDe.set(m.proveedorId, [...(movsDe.get(m.proveedorId) ?? []), m]);
  const ids = new Set([...opsDe.keys(), ...movsDe.keys()]);
  return new Map([...ids].map((id) => [id, asientos(opsDe.get(id) ?? [], movsDe.get(id) ?? [])]));
}

/** What an entry is proposed to cost: the product's cost times the quantity, in whole cents. */
export function importePropuesto(costo: Centavos | undefined, cantidad: number): Centavos | undefined {
  if (costo === undefined || !(cantidad > 0)) return undefined;
  return Math.round(costo * cantidad);
}
