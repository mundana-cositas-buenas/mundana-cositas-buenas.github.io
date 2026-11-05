# Mundana: design

A web app for a food shop, with two independent modules:

1. **Recipe costing** (costos): what it costs to make a product, to decide what to sell it for.
2. **Stock**: record stock, register sales (one or more products, with a % discount) that take it down, and warn when it runs low. Sales by day are the app's home page. Each product has a supplier, with an account of what is owed to it and warnings when a payment is due.

The UI is in Spanish (Argentina); code identifiers follow the domain terms (`insumo`, `receta`, `producto`, `movimiento`…).

## Decisions

- **One user, one device**, mostly on a **PC** (Windows + Chrome as the main browser, Firefox possible).
- **Static site on GitHub Pages**: no backend, no hosting cost. The repo is the organization site `mundana-cositas-buenas.github.io`, so the app lives at the domain root.
- **Data lives in the browser (IndexedDB)**. There is no server copy, so **backup is mandatory**, not a nice-to-have.
- **The two modules are not related.** Recipes don't consume stock and there is no "production" concept. Recipe ingredients (insumos) and stock products (productos) are separate catalogs.
- **Offline-first PWA is a core requirement**: the app must work **100 % without internet** and be installable as a local app (own window, icon).
- **Usefulness and reliability over looks**: plain, fast, keyboard- and table-oriented UI.
- **Minimal dependencies.**

## Stack

- **TypeScript + Svelte + Vite.** Svelte compiles to plain JS with no heavy runtime.
- **IndexedDB directly**, through a small hand-written wrapper (`src/lib/db.ts`, no Dexie).
- No UI, state, date or chart libraries. One hand-written global CSS file, system fonts.
- **Hand-written manifest and service worker** (no `vite-plugin-pwa`); a small Vite plugin generates the precache list at build time.
- **Vitest** (with `fake-indexeddb`) for tests, all running in Node.
- **GitHub Actions** runs type checks, tests and the build, then deploys to Pages on every push to `main`.

## Data model

IndexedDB object stores. Every record has `id` (UUID) and `actualizadoEn` (ISO date, stamped on write). The schema is versioned with explicit, append-only migrations.

### Costing
- **insumos** (ingredients): `nombre`, `unidadBase` (`g` | `ml` | `u`), `precioCompra`, `cantidadCompra` (in `unidadCompra`), `unidadCompra`. `costoPorUnidadBase` is derived, never stored.
- **recetas** (recipes): `nombre`, `rendimiento` (how many units it yields), `unidadRendimiento` (free text, e.g. "panes"), `margen` (%), `notas`.
- **recetaLineas** (recipe lines): `recetaId`, `orden`, `tipo` (`insumo` | `costoFijo`).
  - `insumo` lines: `insumoId`, `cantidad`, `unidad`, `mermaPct` (waste %).
  - `costoFijo` lines: `descripcion`, `monto`. They cover gas, packaging, labour.
- **historialPrecios** (price history): `insumoId`, `fecha`, `unidadBase`, `costoPorUnidadBase` (fractional cents). A new entry is added, in the same transaction as the ingredient, only when its cost per base unit changes.

### Stock
- **productos**: `nombre`, `unidad` (free text: bottle, kg, pack), `stockMinimo`, `costo?` (per unit, typed by hand; there is no cost history and no cost per entry), `precioVenta` (required on every save, zero allowed; products saved before it became required may lack it, the list and product page show them as "Sin precio" until edited, and backups without it still import), `activo`, `proveedorId` (one fixed supplier per product, required on every save the same way: older products show as "Sin proveedor" until edited), `categoriaId` (one category per product, required on every save the same way: older products show as "Sin categoría" until edited).
- **categorias** (product categories): `nombre` (unique among categories). Only products have one; promos don't.
- **promos**: `nombre` (unique among promos), `precio` (cents, zero allowed), `activo`, `componentes` (`[{ productoId, cantidad }]`, at least one, one entry per product, quantities > 0 and decimals allowed). A promo sells several products together at its own price; it has no stock of its own, unit or minimum.
- **ventas** (sales): `fecha`, `descuentoPct` (0 to 100, decimals allowed, over the products sold on their own: not the promos), `nota?`, `anuladoEn?`, `promos?` (`[{ promoId, nombre, precio, cantidad }]`: the promos sold, one entry per promo, with name and price copied when sold). A sale has no product lines of its own: they are its movements.
- **movimientos** (stock movements): `productoId`, `tipo` (`entrada` | `venta` | `ajuste`), `cantidad`, `fecha`, `nota?`, `anuladoEn?`, and on sale lines `ventaId` + `precioUnitario` (+ `promoId` on promo components).
  - `cantidad` is positive for entries and sales (the type gives the sign), and signed for adjustments.
  - A movement is never edited: cancelling ("anular") sets `anuladoEn`, so it stops counting but stays in the history. Only a voided movement can be deleted ("borrar"), which just takes it out of the history; a sale line only goes with its sale.
  - A sale line is a `venta` movement with the sale's `ventaId` and `fecha`, and `precioUnitario`: the product's sale price when it was sold (cents). Sales recorded before multi-product sales existed are `venta` movements without either; they still count for the stock.
  - An `entrada` that adds to the supplier's account also has `proveedorId` (the product's supplier when it was registered, so changing the product's supplier later doesn't move old debt) and `importe` (cents, zero allowed: what that purchase cost). Both or neither; no other type has them.
  - A promo sold adds one sale line per component, with `promoId`, `precioUnitario` 0 (its price is in the sale's `promos`) and `cantidad` = the component's quantity × the promos sold. The same product sold on its own in that sale is a separate line with its price.

- **proveedores** (suppliers): `nombre` (unique), `plazoDias` (payment term in whole days, 15 by default), `activo`, and optional text `telefono`, `rut`, `cuenta` (bank account number), `nota`.
- **operacionesProveedor** (manual entries in a supplier's account): `proveedorId`, `tipo` (`compra` | `pago` | `ajuste`), `importe` (cents: positive for compra and pago, signed and non-zero for ajuste), `fecha`, `medioPago` (only, and always, on a pago: `efectivo` | `transferencia` | `debito` | `credito` | `cheque` | `otro`, a fixed list), `nota?`, `anuladoEn?`. Never edited: voided, then deletable, like movements.

### Other
- **meta**: app bookkeeping, e.g. the date of the last backup. Not included in backups.

## Rules

- **Money is integer cents**; format only on display. Intermediate costs (e.g. cost per gram) may be fractional cents and are rounded only when shown.
- **A recipe's cost is never stored.** It is computed when shown, so changing an ingredient's price updates every recipe.
- **Current stock is never stored as an editable number.** It is the sum of the non-cancelled movements, so there is a full history and a sale can be undone. (If this ever gets slow, cache the total on the product and update it in the same transaction.)
- **Units convert only within a family**: mass g↔kg, volume ml↔l, count u. Mixing families is an error shown on the recipe line, and the line is left out of the total.
- **Deleting an ingredient used by a recipe is blocked.** Deleting an ingredient also deletes its price history.
- **Deleting a product deletes its movements** (the UI suggests deactivating it instead). **A product that is in a sale**, even a voided one (until that sale is deleted), **can't be deleted**, so past sales keep their totals; it can be deactivated. **A product that is in a promo can't be deleted** either: take it out of the promo, or deactivate it.
- **A promo that was sold**, even in a voided sale (until that sale is deleted), **can't be deleted**; it can be deactivated. A promo never sold can be deleted.
- **A promo is sold only while it and all its components are active** (and they exist). The components' sale prices don't matter: the promo has its own. A sale keeps the promo's name and price as they were, so editing the promo later doesn't rewrite past sales.
- **A sale keeps the price it was sold at** (`precioUnitario` on each line), unlike recipe costs: changing a product's price doesn't rewrite past sales. The price comes from the product (it can't be typed in the sale); a product without a sale price can't be sold.
- **A sale is voided as a whole**: voiding sets `anuladoEn` on the sale and on all its movements in one transaction. Its movements can't be voided one by one. To fix a sale, void it and enter it again.
- **Only voided sales and movements can be deleted.** Deleting a voided sale deletes it and all its movements in one transaction. What is deleted no longer counted, so neither the stock nor the sales totals change; it only leaves the history.
- **A supplier's balance is never stored**: it is the sum of its account (manual entries plus the entries that added to it). Voiding a stock entry that added to an account takes it out of both the stock and the account (it is one record).
- **A supplier can't be deleted** while a product or an account line (even a voided one) refers to it; it can be deactivated. An inactive supplier isn't offered for products, but its account and payment warnings remain.
- **An entry adds to the account only for a product with a supplier**, and only when the user leaves "Suma a la cuenta" checked (returns, gifts and purchases already entered by hand are unchecked).
- **A category can't be deleted while it has products** (active or not): move them to another category first. Categories have no active flag. Grouping by category always uses each product's current category, past sales included (sales keep no category).
- **Stock alert**: an active product with stock ≤ its minimum is "low" (bajo); with stock ≤ 0 it is "out of stock" (sin stock).

## Formulas (costing)

```
costoPorUnidadBase = precioCompra / (cantidadCompra converted to the base unit)
costoLinea         = cantidad (in base unit) * costoPorUnidadBase / (1 - mermaPct/100)
costoTotal         = sum(costoLinea) + sum(fixed costs)
costoPorUnidad     = costoTotal / rendimiento
precioSugerido     = costoPorUnidad * (1 + margen/100)
```

Reference example (it is a test): flour at $1000/kg and a recipe with 100 g gives $100 of flour.

## Formulas (stock)

```
ganancia      = precioVenta - costo              (per unit; needs both, negative = selling at a loss)
margen %      = ganancia / costo * 100           (over the cost, like the recipes; none when costo is 0)
valorStock    = max(stock, 0) * costo            (rounded to whole cents; none without a cost)
valor total   = sum(valorStock) over every product, active or not
```

Products with stock but no cost are left out of the total and counted, so the UI can say so.

Sales by category (per day, over the sales that count): each product line goes to its product's current category (deleted products and products without one go to "Sin categoría"), and each sale's discount is split among its categories in proportion to their amounts, rounding down and giving the cents left to the largest remainders, so the parts add up exactly to the discount. Promos are their own row ("Promos") at their price. The rows add up to the day's total.

## Formulas (suppliers)

```
saldo        = sum(compras) + sum(entradas' importe) + sum(ajustes) - sum(pagos)    (not voided; negative = paid in advance)
importe propuesto (entry form) = round(costo * cantidad)                           (editable; none without a cost)
vencimiento  = local day of the purchase + plazoDias                                (computed: changing the term moves every due date)
pendientes   = payments and negative adjustments pay the oldest debt first (date order); positive adjustments are debt in that
               order too but never fall due; each compra/entrada not fully paid is pending for what is left
vencido      = pending with vencimiento before today
vence pronto = pending due today or within the next 3 days
aviso        = a supplier (active or not) with something vencido or due soon; the nav badge counts these suppliers
```

## Formulas (sales)

```
importe     = round(cantidad * precioUnitario)      (per line, whole cents; quantities can be decimal)
subtotal    = sum(importe) over the products sold on their own (promo components have price 0)
descuento   = round(subtotal * descuentoPct / 100)  (promos already have their own price)
promos      = sum(round(cantidad * precio)) over the sale's promos
total       = subtotal - descuento + promos
día         = sales grouped by local calendar day; voided sales are listed but left out of the count and total
```

Promos (shown when editing and in the promo list):

```
por separado = sum(round(cantidad * precioVenta)) over the components (incomplete if one has no sale price)
ahorro       = por separado - precio            (negative = the promo costs more than buying separately)
```

## Features

### Costing
- Ingredients in an editable table with search; per-ingredient price history with the % change between entries.
- Recipes with ingredient and fixed-cost lines, live cost breakdown per line, total, cost per unit, margin and suggested price while editing.
- Duplicate a recipe (for variants).
- Recipe list with cost per unit and suggested price, printable as a price list (with or without costs).

### Stock
- Products table with current stock, highlighting low and out-of-stock ones, and the total stock value above it (shown once some product has a cost). The table is grouped by category (by name, then "Sin categoría"), each group with a header showing its number of products and the stock value of all its products; search and "show inactive" apply inside the groups and empty groups are hidden. A category selector sits under the product name when adding or editing; a notice shows when there are no categories yet, or products without one.
- Categories (`#/stock/categorias`): list with name and number of products, a row to add one, renaming in place (Editar or double click, Enter saves, Escape cancels) and Borrar (blocked, with a message, while it has products). The product page shows the product's category.
- Required sale price per product (see the data model for older products without one). Optional cost per product. Editing a product warns, without blocking the save, when the cost is over the sale price. The product page shows cost, profit and margin (in red when it's a loss) and the stock value.
- Keyboard-first movement entry for entries and adjustments: product (type to pick), quantity, Enter. Warns before stock would go negative. Sales are not entered here.
- Product deletion is blocked, with a message, when the product is in a sale or a promo.
- Promos (`#/stock/promos`): list with name, components, price, price bought separately, savings and active, with search and "show inactive"; a promo with a deactivated or deleted component is flagged, since it can't be sold. Each promo opens in its editor (`#/stock/promo/<id>`, `nueva` for a new one): name, price, active, and its products added with type-to-pick + quantity (empty = 1) + Enter, quantities editable in place; it shows the price bought separately and the savings while editing, and saves with Guardar (or Enter in the name or price). Unsaved changes count as unsaved input for the update notice.

### Sales (home page)
- A top-level section, first in the navigation and the page for an empty or unknown hash; the "Ona" name in the header links to it.
- The sale being entered: product or promo (type to pick; promos are listed as "Promo: <name>") + quantity (empty = 1) + Enter adds a line; adding a product or promo already in the sale adds to its quantity; ✕ removes a line. It shows each line's price and amount (a promo line also lists its components), subtotal, discount (noting it doesn't apply to promos), promos and total. A promo with an inactive component can't be added. For the mouse, a row of buttons under the picker: one per category with active products (by name), then "Sin categoría" (active products without one) and "Promos" (active promos), each only when it has something. A button opens a dialog with a button per product (or promo) of that group, by name, showing only its name and, once it is in the sale, its quantity ("×3"); each click adds one unit and the dialog stays open, showing the sale's total, until "Listo", Escape or a click outside. Products without a price and promos that can't be sold show disabled with the reason. Mistakes are fixed in the sale's table (✕), as with the picker. Discount % and an optional note, then "Registrar venta" (Enter in the discount or note also registers). One warning lists every product whose stock would go negative, counting promo components.
- The draft survives going to other pages (not a reload), and counts as unsaved input for the update notice.
- Sales by day: one row per day with sales, newest first, with the number of sales and the total; each day expands to its sales (time, products and promos, discount, total, note, "Anular"). Today starts expanded, and an expanded day first shows its sales by category (see the formulas). Voided sales show struck through, with "Borrar" (asks first).
- In the movement history, a sale's lines link to Ventas instead of offering "Anular" ("en promo" for promo components). Other voided movements offer "Borrar" (asks first).
- Alerts panel and a low-stock counter badge in the navigation.

### Suppliers
- A top-level section (`#/proveedores`), with its own badge: the number of suppliers with payments overdue or due within 3 days (refreshed after every stock or supplier write, and on navigation since due dates move with the calendar).
- List with balance, overdue amount, amount due soon, next due date, term, number of products and active; overdue rows in red, due-soon ones highlighted; total owed above it; search and "show inactive" (inactive suppliers with payments due always show). Deleting is blocked, with a message, while something refers to the supplier.
- Each supplier opens in its page (`#/proveedores/<id>`, `nuevo` for a new one): its data (name, term, phone, RUT, account number, notes, active) saved with "Guardar datos"; balance, overdue, due soon and next due date; a quick form for compra / pago (with its payment method) / ajuste (signed); the account newest first with running balance, each purchase's due date and what is left of it, and "Anular" / "Borrar" (stock entries here void the movement itself); and the supplier's products.
- Products: a supplier column and selector (active suppliers, plus the product's own if inactive); a notice when there are no suppliers yet, or products without one.
- Entry form: for a product with a supplier, a "Suma a la cuenta de <supplier>" checkbox (checked by default) and the amount, proposed as cost × quantity until typed over (required while checked). The movement history shows the amount next to such entries, linking to the supplier.
- Per-product movement history, with cancelling.

### Backup
- **Export** everything to one JSON file, `ona-YYYY-MM-DD.json`:
  `{ formato: 'mundana-backup', version, exportadoEn, datos: { <every data store> } }`.
  `version` is the backup format version (not the IndexedDB schema version). Bump it when the shape of the records changes, and teach the reader to upgrade older files. Version 2 added `historialPrecios`; version 1 files still import, with an empty history. Version 3 added `ventas` (and `ventaId`/`precioUnitario` on sale movements); older files import with no sales. Version 4 added `promos` (and `promos` on sales, `promoId` on their movements); older files import with no promos. Version 5 added `proveedores` and `operacionesProveedor` (and `proveedorId` on products, `proveedorId` + `importe` on entries); older files import with no suppliers. Version 6 added `categorias` (and `categoriaId` on products); older files import with no categories.
- **Import** validates format, version, every record's fields, unique ids and references (lines → recipe/ingredient, history → ingredient, movements → product and sale, promo components → product, a sale's promos → promo, products / entries / account entries → supplier, products → category); a movement with a `ventaId` must be a `venta` with a `precioUnitario`, and one with a `promoId` must also have price 0 and belong to a sale that includes that promo. It shows a preview (record counts), asks for confirmation, downloads an automatic backup of the current data first, and then replaces everything in a single transaction.
- The backup page ends with the running release (`package.json` `version`, set by `release.py`), to tell which version is deployed.
- The date of the last backup is kept, and the app warns when there is data and no backup in more than **7 days**.
- **CSV** exports of products (with supplier, cost, profit, margin and stock value), suppliers (with balance, overdue and due soon), every supplier's account (with running balance), ingredients and recipes, for Excel in Spanish: `;` separator, comma decimals, BOM.
- The app asks for persistent storage (`navigator.storage.persist()`) at startup and again when installed, and says so if the browser doesn't grant it.

### Offline and updates (PWA)
- Manifest with relative `start_url` and `scope`, `display: standalone`, 192/512/maskable icons (generated by `scripts/iconos.mjs`).
- The service worker precaches the whole build plus `public/`. Its cache name carries a content hash (`mundana-<hash>`), and old caches are removed on `activate`.
- Cache-first for everything precached; any navigation within the scope gets `index.html`. The precache is fetched with `cache: 'reload'` so a stale `index.html` from the HTTP cache can't sneak in.
- **Updates never reload by themselves.** A new service worker waits until the user clicks "Recargar" on the notice, and if there is unsaved typed input the app asks first. The app checks for updates every hour and when the tab becomes visible again.
- No runtime network dependencies: no CDN, remote fonts or analytics. A discreet "offline" indicator is informational only.
- No service worker in development (`npm run dev`).

### Keyboard and usability
- Single-key shortcuts, active only outside text fields and without Ctrl/Alt/Cmd: `v` Sales (home), `r` Recipes, `i` Ingredients, `p` Products, `m` Movements, `a` Alerts, `o` Promos, `e` Suppliers, `b` Backup, `n` the page's "new" field, `/` search, `?` help (Esc closes it).
- Enter saves a row or movement (in a sale: adds the product, or registers the sale from the discount or note), Esc cancels a row edit. After saving or cancelling, focus returns to the row; when a save fails, it goes to the first invalid field.
- Error messages name the field ("Precio de compra: No puede ser negativo") and update while typing after the first save attempt.
- Numbers are typed as text and parsed Argentine style (`1.234,56`; a lone `.` followed by 3 digits is a thousands separator).

## Testing strategy (no browser)

Development happens in a Docker container with **no browser, and none can be installed**. Every automated test runs in Node; no Chrome, Firefox, Playwright, Puppeteer or Selenium.

**Design principle**: all logic lives in plain TypeScript modules outside the Svelte components. Components only display data and call into that logic.

- **Pure logic** (units, money, costing, stock, sales, supplier accounts and due dates, validation, shortcuts, service worker strategies): unit tests with Vitest. This is most of the coverage.
- **IndexedDB**: `fake-indexeddb` covers the wrapper, schema migrations, transactions and the repositories.
- **Backup**: a round-trip test (export, wipe, import, compare), plus validation tests with malformed JSON, unknown versions, missing fields and dangling references.
- **Svelte components**: not tested directly; keep moving logic out of them instead.
- **Manifest**: required fields, icons exist, `start_url`/`scope` consistent with `base`.
- **Build**: `svelte-check`, `tsc` and a real `vite build` must pass. A test checks the built `dist/`: `index.html` exists, the precache list is complete, and there are no absolute URLs to external hosts.

### Manual checks

Anything that needs a real browser is reported as **untested in browser**, with a short list of manual steps, and is checked by the user:
- Installing the app in Chrome on Windows (own window, starts offline).
- Starting offline with the real service worker, in Chrome and in Firefox (as a normal tab).
- Look, usability and keyboard focus.
- Downloading a backup and picking a file to import.
- The update notice for a new version.

## Risks

- **Browser data being cleared**: mitigated by backups, the staleness warning and `storage.persist()`.
- **IndexedDB schema changes**: explicit, append-only migrations; never edit a released one.
- **PWA installation varies by browser**: Chrome on desktop can install it; **Firefox desktop can't install PWAs**, but offline use works the same from a tab. Offline mode must never depend on installation.
- **Data is per browser**: Chrome and Firefox keep separate databases. Use one browser as the main one, and move data to the other only through a backup.
- **A badly versioned service worker** can leave the user stuck on an old version: hence the content-hashed cache, cleanup on `activate` and the update notice.
- **Data is per origin**: if the domain or repo name changes, the stored data is no longer visible there. A backup is how to move it.
- **Pages paths**: the app is at the domain root (`base: '/'`). If it ever moves to a project repo (`user.github.io/repo/`), the manifest paths are already relative, but `base` and the service worker registration must use the new prefix.
- **Rounding errors**: money in integer cents, rounded only on display.
- **Units** are the most likely source of calculation mistakes, so conversions live in one tested module (`src/lib/units.ts`).

## History

Built in phases, each one a commit on `main`: 0 skeleton (Vite + Svelte + TS, IndexedDB wrapper, navigation, CI), 1 recipe costing, 2 stock, 3 backup, 4 PWA and offline use, 5 polish (keyboard shortcuts and focus, clearer validation messages, printable price list, ingredient price history). All phases are deployed to Pages and were checked by the user in the browser. See `git log` for details.
