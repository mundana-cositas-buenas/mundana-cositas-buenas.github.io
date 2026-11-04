import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { newId, openDB, type DB } from '../lib/db';
import {
  anularMovimiento,
  anularVenta,
  borrarMovimiento,
  borrarProducto,
  borrarPromo,
  borrarVenta,
  cambiosStock,
  cargarAlertas,
  contarMovimientos,
  guardarProducto,
  guardarPromo,
  listarMovimientos,
  listarProductos,
  listarPromos,
  listarVentas,
  movimientosDe,
  ProductoEnPromos,
  ProductoEnVentas,
  PromoEnVentas,
  promosConProducto,
  registrarMovimiento,
  registrarVenta,
  stockActualDe,
  ventasConProducto,
  ventasConPromo,
} from './repo';
import type { Producto, Promo } from './types';

let n = 0;
const open: DB[] = [];

async function fresh(): Promise<DB> {
  const db = await openDB(`stock-${n++}`);
  open.push(db);
  return db;
}

afterEach(() => {
  open.splice(0).forEach((db) => db.close());
});

const producto = (nombre: string, stockMinimo = 0): Producto => ({
  id: newId(),
  actualizadoEn: '',
  nombre,
  unidad: 'u',
  stockMinimo,
  activo: true,
});

const t = (s: number) => new Date(Date.UTC(2026, 0, 1, 0, 0, s));

describe('productos', () => {
  it('lists sorted by name', async () => {
    const db = await fresh();
    for (const nombre of ['vino', 'Aceite', 'miel']) await guardarProducto(db, producto(nombre));
    expect((await listarProductos(db)).map((p) => p.nombre)).toEqual(['Aceite', 'miel', 'vino']);
  });

  it('deletes a product with its movements only', async () => {
    const db = await fresh();
    const vino = await guardarProducto(db, producto('vino'));
    const miel = await guardarProducto(db, producto('miel'));
    await registrarMovimiento(db, vino.id, { tipo: 'entrada', cantidad: 5 });
    await registrarMovimiento(db, vino.id, { tipo: 'venta', cantidad: 1 });
    const queda = await registrarMovimiento(db, miel.id, { tipo: 'entrada', cantidad: 2 });
    expect(await contarMovimientos(db, vino.id)).toBe(2);
    await borrarProducto(db, vino.id);
    expect((await listarProductos(db)).map((p) => p.nombre)).toEqual(['miel']);
    expect((await listarMovimientos(db)).map((m) => m.id)).toEqual([queda.id]);
  });
});

describe('movimientos', () => {
  it('computes stock from movements, newest first', async () => {
    const db = await fresh();
    const vino = await guardarProducto(db, producto('vino'));
    const a = await registrarMovimiento(db, vino.id, { tipo: 'entrada', cantidad: 10 }, t(1));
    const b = await registrarMovimiento(db, vino.id, { tipo: 'venta', cantidad: 3, nota: 'fiado' }, t(2));
    expect(b).toMatchObject({ productoId: vino.id, tipo: 'venta', cantidad: 3, nota: 'fiado', fecha: t(2).toISOString() });
    expect((await listarMovimientos(db)).map((m) => m.id)).toEqual([b.id, a.id]);
    expect(await movimientosDe(db, vino.id)).toHaveLength(2);
    expect((await stockActualDe(db)).get(vino.id)).toBe(7);
  });

  it('refuses movements for unknown products', async () => {
    const db = await fresh();
    await expect(registrarMovimiento(db, 'nada', { tipo: 'entrada', cantidad: 1 })).rejects.toThrow('no existe');
    expect(await listarMovimientos(db)).toEqual([]);
  });

  it('voids a movement once, keeping it in the history', async () => {
    const db = await fresh();
    const vino = await guardarProducto(db, producto('vino'));
    await registrarMovimiento(db, vino.id, { tipo: 'entrada', cantidad: 10 });
    const venta = await registrarMovimiento(db, vino.id, { tipo: 'venta', cantidad: 4 });
    const anulado = await anularMovimiento(db, venta.id);
    expect(anulado.anuladoEn).toBeTruthy();
    expect(await movimientosDe(db, vino.id)).toHaveLength(2);
    expect((await stockActualDe(db)).get(vino.id)).toBe(10);
    await expect(anularMovimiento(db, venta.id)).rejects.toThrow('ya estaba anulado');
    await expect(anularMovimiento(db, 'nada')).rejects.toThrow('no existe');
  });

  it('deletes only a voided movement, leaving the stock as it was', async () => {
    const db = await fresh();
    const vino = await guardarProducto(db, producto('vino'));
    const entrada = await registrarMovimiento(db, vino.id, { tipo: 'entrada', cantidad: 10 });
    const ajuste = await registrarMovimiento(db, vino.id, { tipo: 'ajuste', cantidad: -3 });
    await expect(borrarMovimiento(db, ajuste.id)).rejects.toThrow('Solo se puede borrar un movimiento anulado');
    await anularMovimiento(db, ajuste.id);
    await borrarMovimiento(db, ajuste.id);
    expect((await movimientosDe(db, vino.id)).map((m) => m.id)).toEqual([entrada.id]);
    expect((await stockActualDe(db)).get(vino.id)).toBe(10);
    await expect(borrarMovimiento(db, ajuste.id)).rejects.toThrow('no existe');
  });

  it('reports alerts and notifies changes', async () => {
    const db = await fresh();
    const escucha = vi.fn();
    cambiosStock.addEventListener('cambio', escucha);
    const vino = await guardarProducto(db, producto('vino', 5));
    await guardarProducto(db, producto('miel', 1));
    await registrarMovimiento(db, vino.id, { tipo: 'entrada', cantidad: 6 });
    expect((await cargarAlertas(db)).map((a) => a.producto.nombre)).toEqual(['miel']);
    await registrarMovimiento(db, vino.id, { tipo: 'venta', cantidad: 1 });
    expect((await cargarAlertas(db)).map((a) => [a.producto.nombre, a.nivel])).toEqual([
      ['miel', 'agotado'],
      ['vino', 'bajo'],
    ]);
    cambiosStock.removeEventListener('cambio', escucha);
    expect(escucha).toHaveBeenCalledTimes(4);
  });
});

describe('ventas', () => {
  const conPrecio = (nombre: string, precioVenta: number): Producto => ({ ...producto(nombre), precioVenta });

  it('records the sale and one movement per line, at the current price, in one go', async () => {
    const db = await fresh();
    const jugo = await guardarProducto(db, conPrecio('jugo', 150000));
    const ensalada = await guardarProducto(db, conPrecio('ensalada', 400000));
    await registrarMovimiento(db, jugo.id, { tipo: 'entrada', cantidad: 10 });
    const r = await registrarVenta(
      db,
      [
        { productoId: jugo.id, cantidad: 2 },
        { productoId: ensalada.id, cantidad: 1 },
      ],
      { descuentoPct: 10, nota: 'mostrador' },
      t(5),
    );
    expect(r.venta).toMatchObject({ fecha: t(5).toISOString(), descuentoPct: 10, nota: 'mostrador' });
    expect(r.lineas.map((m) => [m.productoId, m.tipo, m.cantidad, m.precioUnitario, m.ventaId, m.fecha])).toEqual([
      [jugo.id, 'venta', 2, 150000, r.venta.id, r.venta.fecha],
      [ensalada.id, 'venta', 1, 400000, r.venta.id, r.venta.fecha],
    ]);
    // Lines come back in no particular order (the views sort them by name).
    const porId = (a: { id: string }, b: { id: string }) => a.id.localeCompare(b.id);
    const [leida] = await listarVentas(db);
    expect({ ...leida, lineas: leida.lineas.sort(porId) }).toEqual({ ...r, lineas: [...r.lineas].sort(porId) });
    const stock = await stockActualDe(db);
    expect(stock.get(jugo.id)).toBe(8);
    expect(stock.get(ensalada.id)).toBe(-1);

    // Later price changes don't touch the stored price.
    await guardarProducto(db, { ...jugo, precioVenta: 999 });
    const lineaJugo = (await listarVentas(db))[0].lineas.find((m) => m.productoId === jugo.id);
    expect(lineaJugo?.precioUnitario).toBe(150000);
  });

  it('records nothing if a product is missing, has no price, or the sale is empty', async () => {
    const db = await fresh();
    const jugo = await guardarProducto(db, conPrecio('jugo', 100));
    const viejo = await guardarProducto(db, producto('viejo'));
    await expect(registrarVenta(db, [], { descuentoPct: 0 })).rejects.toThrow('no tiene productos');
    await expect(
      registrarVenta(db, [{ productoId: jugo.id, cantidad: 1 }, { productoId: 'nada', cantidad: 1 }], { descuentoPct: 0 }),
    ).rejects.toThrow('ya no existe');
    await expect(
      registrarVenta(db, [{ productoId: jugo.id, cantidad: 1 }, { productoId: viejo.id, cantidad: 1 }], { descuentoPct: 0 }),
    ).rejects.toThrow('Sin precio');
    await expect(registrarVenta(db, [{ productoId: jugo.id, cantidad: 0 }], { descuentoPct: 0 })).rejects.toThrow('mayor que 0');
    expect(await listarVentas(db)).toEqual([]);
    expect(await listarMovimientos(db)).toEqual([]);
  });

  it('voids the whole sale together, and not its movements one by one', async () => {
    const db = await fresh();
    const jugo = await guardarProducto(db, conPrecio('jugo', 100));
    const miel = await guardarProducto(db, conPrecio('miel', 200));
    const r = await registrarVenta(db, [{ productoId: jugo.id, cantidad: 1 }, { productoId: miel.id, cantidad: 2 }], { descuentoPct: 0 });
    await expect(anularMovimiento(db, r.lineas[0].id)).rejects.toThrow('anulá la venta completa');

    const anulada = await anularVenta(db, r.venta.id);
    expect(anulada.venta.anuladoEn).toBeTruthy();
    expect(anulada.lineas.every((m) => m.anuladoEn === anulada.venta.anuladoEn)).toBe(true);
    expect((await listarVentas(db))[0].venta).toEqual(anulada.venta);
    const stock = await stockActualDe(db);
    expect([stock.get(jugo.id), stock.get(miel.id)]).toEqual([0, 0]);
    await expect(anularVenta(db, r.venta.id)).rejects.toThrow('ya estaba anulada');
    await expect(anularVenta(db, 'nada')).rejects.toThrow('no existe');
  });

  it('blocks deleting a product that is in a sale, even a voided one', async () => {
    const db = await fresh();
    const jugo = await guardarProducto(db, conPrecio('jugo', 100));
    const r = await registrarVenta(db, [{ productoId: jugo.id, cantidad: 1 }], { descuentoPct: 0 });
    await registrarVenta(db, [{ productoId: jugo.id, cantidad: 1 }], { descuentoPct: 0 });
    await anularVenta(db, r.venta.id);
    expect(await ventasConProducto(db, jugo.id)).toBe(2);
    const e = await borrarProducto(db, jugo.id).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(ProductoEnVentas);
    expect((e as Error).message).toBe('No se puede borrar: está en 2 ventas. Desmarcalo como activo en lugar de borrarlo.');
    expect(await listarProductos(db)).toHaveLength(1);
    expect(await listarMovimientos(db)).toHaveLength(2);
  });

  it('deletes only a voided sale, with all its lines, leaving stock and totals as they were', async () => {
    const db = await fresh();
    const jugo = await guardarProducto(db, conPrecio('jugo', 100));
    const miel = await guardarProducto(db, conPrecio('miel', 200));
    await registrarMovimiento(db, jugo.id, { tipo: 'entrada', cantidad: 5 });
    const r = await registrarVenta(db, [{ productoId: jugo.id, cantidad: 1 }, { productoId: miel.id, cantidad: 2 }], { descuentoPct: 0 }, t(1));
    const otra = await registrarVenta(db, [{ productoId: jugo.id, cantidad: 2 }], { descuentoPct: 0 }, t(2));
    await expect(borrarVenta(db, r.venta.id)).rejects.toThrow('Solo se puede borrar una venta anulada');
    await expect(borrarMovimiento(db, r.lineas[0].id)).rejects.toThrow('borrá la venta completa');

    await anularVenta(db, r.venta.id);
    const antes = await stockActualDe(db);
    expect([antes.get(jugo.id), antes.get(miel.id)]).toEqual([3, 0]);
    await borrarVenta(db, r.venta.id);
    expect((await listarVentas(db)).map((v) => v.venta.id)).toEqual([otra.venta.id]);
    expect((await listarMovimientos(db)).filter((m) => m.ventaId === r.venta.id)).toEqual([]);
    const despues = await stockActualDe(db);
    expect([despues.get(jugo.id), despues.get(miel.id) ?? 0]).toEqual([3, 0]); // no movements left: no entry, read as 0
    await expect(borrarVenta(db, r.venta.id)).rejects.toThrow('no existe');

    // The product was only in the deleted sale, so it can be deleted now.
    expect(await ventasConProducto(db, miel.id)).toBe(0);
    await borrarProducto(db, miel.id);
    expect((await listarProductos(db)).map((p) => p.nombre)).toEqual(['jugo']);
  });

  it('notifies the nav badge on register, void and delete', async () => {
    const db = await fresh();
    const jugo = await guardarProducto(db, conPrecio('jugo', 100));
    const f = vi.fn();
    cambiosStock.addEventListener('cambio', f);
    try {
      const r = await registrarVenta(db, [{ productoId: jugo.id, cantidad: 1 }], { descuentoPct: 0 });
      await anularVenta(db, r.venta.id);
      await borrarVenta(db, r.venta.id);
    } finally {
      cambiosStock.removeEventListener('cambio', f);
    }
    expect(f).toHaveBeenCalledTimes(3);
  });
});

describe('promos', () => {
  const conPrecio = (nombre: string, precioVenta: number): Producto => ({ ...producto(nombre), precioVenta });
  const nuevaPromo = (nombre: string, precio: number, componentes: Promo['componentes']): Promo => ({
    id: newId(),
    actualizadoEn: '',
    nombre,
    precio,
    activo: true,
    componentes,
  });

  async function preparar() {
    const db = await fresh();
    const jugo = await guardarProducto(db, conPrecio('jugo', 150000));
    const ensalada = await guardarProducto(db, conPrecio('ensalada', 400000));
    const combo = await guardarPromo(
      db,
      nuevaPromo('Combo', 500000, [
        { productoId: jugo.id, cantidad: 1 },
        { productoId: ensalada.id, cantidad: 0.5 },
      ]),
    );
    return { db, jugo, ensalada, combo };
  }

  it('saves and lists promos sorted by name, refusing unknown products', async () => {
    const { db, combo } = await preparar();
    await guardarPromo(db, nuevaPromo('Almuerzo', 1, [{ productoId: combo.componentes[0].productoId, cantidad: 1 }]));
    expect((await listarPromos(db)).map((p) => p.nombre)).toEqual(['Almuerzo', 'Combo']);
    expect(combo.actualizadoEn).not.toBe('');
    await expect(guardarPromo(db, nuevaPromo('Mala', 1, [{ productoId: 'nada', cantidad: 1 }]))).rejects.toThrow('ya no existe');
    expect(await listarPromos(db)).toHaveLength(2);
  });

  it('sells a promo: kept on the sale at its price, components taken out of the stock', async () => {
    const { db, jugo, ensalada, combo } = await preparar();
    const r = await registrarVenta(db, [{ productoId: jugo.id, cantidad: 1 }], { descuentoPct: 10 }, t(5), [{ promoId: combo.id, cantidad: 2 }]);
    expect(r.venta.promos).toEqual([{ promoId: combo.id, nombre: 'Combo', precio: 500000, cantidad: 2 }]);
    const componentes = r.lineas.filter((m) => m.promoId);
    expect(componentes.map((m) => [m.productoId, m.cantidad, m.precioUnitario])).toEqual([
      [jugo.id, 2, 0],
      [ensalada.id, 1, 0],
    ]);
    expect(componentes.every((m) => m.ventaId === r.venta.id && m.tipo === 'venta' && m.fecha === t(5).toISOString())).toBe(true);
    const stock = await stockActualDe(db);
    expect(stock.get(jugo.id)).toBe(-3);
    expect(stock.get(ensalada.id)).toBe(-1);
    const [guardada] = await listarVentas(db);
    expect(guardada.venta).toEqual(r.venta);
    expect(guardada.lineas.map((m) => m.id).sort()).toEqual(r.lineas.map((m) => m.id).sort());

    // Changing the promo afterwards doesn't change the sale.
    await guardarPromo(db, { ...combo, nombre: 'Combo nuevo', precio: 1 });
    expect((await listarVentas(db))[0].venta.promos?.[0]).toMatchObject({ nombre: 'Combo', precio: 500000 });

    // Voiding the sale voids the components too.
    const anulada = await anularVenta(db, r.venta.id);
    expect(anulada.lineas.every((m) => m.anuladoEn)).toBe(true);
    expect((await stockActualDe(db)).get(jugo.id)).toBe(0);
  });

  it('sells promos alone, and keeps sales without promos as before', async () => {
    const { db, jugo, combo } = await preparar();
    const solo = await registrarVenta(db, [], { descuentoPct: 0 }, t(1), [{ promoId: combo.id, cantidad: 1 }]);
    expect(solo.lineas).toHaveLength(2);
    const sin = await registrarVenta(db, [{ productoId: jugo.id, cantidad: 1 }], { descuentoPct: 0 });
    expect('promos' in sin.venta).toBe(false);
  });

  it('records nothing if a promo is missing, repeated, inactive or has an inactive or deleted component', async () => {
    const { db, jugo, ensalada, combo } = await preparar();
    const vender = (promoId: string) => registrarVenta(db, [{ productoId: jugo.id, cantidad: 1 }], { descuentoPct: 0 }, new Date(), [{ promoId, cantidad: 1 }]);
    await expect(vender('nada')).rejects.toThrow('ya no existe');
    await expect(
      registrarVenta(db, [], { descuentoPct: 0 }, new Date(), [
        { promoId: combo.id, cantidad: 1 },
        { promoId: combo.id, cantidad: 1 },
      ]),
    ).rejects.toThrow('repetida');
    await guardarPromo(db, { ...combo, activo: false });
    await expect(vender(combo.id)).rejects.toThrow('no está activa');
    await guardarPromo(db, { ...combo, activo: true });
    await guardarProducto(db, { ...ensalada, activo: false });
    await expect(vender(combo.id)).rejects.toThrow('incluye un producto desactivado: ensalada');
    expect(await listarVentas(db)).toEqual([]);
    expect(await listarMovimientos(db)).toEqual([]);
  });

  it('blocks deleting a product that is in a promo, and a promo that was sold', async () => {
    const { db, jugo, ensalada, combo } = await preparar();
    expect(await promosConProducto(db, jugo.id)).toEqual(['Combo']);
    const e = await borrarProducto(db, ensalada.id).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(ProductoEnPromos);
    expect((e as Error).message).toBe('No se puede borrar: está en la promo "Combo". Sacalo de la promo, o desmarcalo como activo en lugar de borrarlo.');
    expect(await listarProductos(db)).toHaveLength(2);

    const r = await registrarVenta(db, [], { descuentoPct: 0 }, new Date(), [{ promoId: combo.id, cantidad: 1 }]);
    await anularVenta(db, r.venta.id);
    expect(await ventasConPromo(db, combo.id)).toBe(1);
    const e2 = await borrarPromo(db, combo.id).catch((x: unknown) => x);
    expect(e2).toBeInstanceOf(PromoEnVentas);
    expect((e2 as Error).message).toBe('No se puede borrar: se vendió en una venta. Desmarcala como activa en lugar de borrarla.');
    expect(await listarPromos(db)).toHaveLength(1);

    // A promo never sold can be deleted, and then its products can too (if they aren't in sales).
    const otra = await guardarPromo(db, nuevaPromo('Otra', 1, [{ productoId: jugo.id, cantidad: 1 }]));
    const nuevo = await guardarProducto(db, conPrecio('nuevo', 1));
    await guardarPromo(db, { ...otra, componentes: [{ productoId: nuevo.id, cantidad: 1 }] });
    await borrarPromo(db, otra.id);
    await borrarProducto(db, nuevo.id);
    expect((await listarPromos(db)).map((p) => p.nombre)).toEqual(['Combo']);
  });

  it('deleting the voided sale where a promo was sold lets the promo be deleted', async () => {
    const { db, combo } = await preparar();
    const r = await registrarVenta(db, [], { descuentoPct: 0 }, new Date(), [{ promoId: combo.id, cantidad: 1 }]);
    await anularVenta(db, r.venta.id);
    await borrarVenta(db, r.venta.id);
    expect(await listarMovimientos(db)).toEqual([]);
    await borrarPromo(db, combo.id);
    expect(await listarPromos(db)).toEqual([]);
  });
});
