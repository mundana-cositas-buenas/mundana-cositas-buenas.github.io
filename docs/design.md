# Mundana: design

A web app for a food shop, with two independent modules:

1. **Recipe costing** (costos): what it costs to make a product, to decide what to sell it for.
2. **Stock**: record stock, take it down on each sale, and warn when it runs low.

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
- **productos**: `nombre`, `unidad` (free text: bottle, kg, pack), `stockMinimo`, `precioVenta?`, `activo`.
- **movimientos** (stock movements): `productoId`, `tipo` (`entrada` | `venta` | `ajuste`), `cantidad`, `fecha`, `nota?`, `anuladoEn?`.
  - `cantidad` is positive for entries and sales (the type gives the sign), and signed for adjustments.
  - A movement is never edited or deleted on its own: cancelling ("anular") sets `anuladoEn`, so it stops counting but stays in the history.

### Other
- **meta**: app bookkeeping, e.g. the date of the last backup. Not included in backups.

## Rules

- **Money is integer cents**; format only on display. Intermediate costs (e.g. cost per gram) may be fractional cents and are rounded only when shown.
- **A recipe's cost is never stored.** It is computed when shown, so changing an ingredient's price updates every recipe.
- **Current stock is never stored as an editable number.** It is the sum of the non-cancelled movements, so there is a full history and a sale can be undone. (If this ever gets slow, cache the total on the product and update it in the same transaction.)
- **Units convert only within a family**: mass g↔kg, volume ml↔l, count u. Mixing families is an error shown on the recipe line, and the line is left out of the total.
- **Deleting an ingredient used by a recipe is blocked.** Deleting an ingredient also deletes its price history.
- **Deleting a product deletes its movements** (the UI suggests deactivating it instead).
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

## Features

### Costing
- Ingredients in an editable table with search; per-ingredient price history with the % change between entries.
- Recipes with ingredient and fixed-cost lines, live cost breakdown per line, total, cost per unit, margin and suggested price while editing.
- Duplicate a recipe (for variants).
- Recipe list with cost per unit and suggested price, printable as a price list (with or without costs).

### Stock
- Products table with current stock, highlighting low and out-of-stock ones.
- Keyboard-first movement entry: product (type to pick), quantity, Enter. Warns before stock would go negative.
- Alerts panel and a low-stock counter badge in the navigation.
- Per-product movement history, with cancelling.

### Backup
- **Export** everything to one JSON file, `mundana-YYYY-MM-DD.json`:
  `{ formato: 'mundana-backup', version, exportadoEn, datos: { <every data store> } }`.
  `version` is the backup format version (not the IndexedDB schema version). Bump it when the shape of the records changes, and teach the reader to upgrade older files. Version 2 added `historialPrecios`; version 1 files still import, with an empty history.
- **Import** validates format, version, every record's fields, unique ids and references (lines → recipe/ingredient, history → ingredient, movements → product). It shows a preview (record counts), asks for confirmation, downloads an automatic backup of the current data first, and then replaces everything in a single transaction.
- The date of the last backup is kept, and the app warns when there is data and no backup in more than **7 days**.
- **CSV** exports of products, ingredients and recipes, for Excel in Spanish: `;` separator, comma decimals, BOM.
- The app asks for persistent storage (`navigator.storage.persist()`) at startup and again when installed, and says so if the browser doesn't grant it.

### Offline and updates (PWA)
- Manifest with relative `start_url` and `scope`, `display: standalone`, 192/512/maskable icons (generated by `scripts/iconos.mjs`).
- The service worker precaches the whole build plus `public/`. Its cache name carries a content hash (`mundana-<hash>`), and old caches are removed on `activate`.
- Cache-first for everything precached; any navigation within the scope gets `index.html`. The precache is fetched with `cache: 'reload'` so a stale `index.html` from the HTTP cache can't sneak in.
- **Updates never reload by themselves.** A new service worker waits until the user clicks "Recargar" on the notice, and if there is unsaved typed input the app asks first. The app checks for updates every hour and when the tab becomes visible again.
- No runtime network dependencies: no CDN, remote fonts or analytics. A discreet "offline" indicator is informational only.
- No service worker in development (`npm run dev`).

### Keyboard and usability
- Single-key shortcuts, active only outside text fields and without Ctrl/Alt/Cmd: `r` Recipes, `i` Ingredients, `p` Products, `m` Movements, `a` Alerts, `b` Backup, `n` the page's "new" field, `/` search, `?` help (Esc closes it).
- Enter saves a row or movement, Esc cancels a row edit. After saving or cancelling, focus returns to the row; when a save fails, it goes to the first invalid field.
- Error messages name the field ("Precio de compra: No puede ser negativo") and update while typing after the first save attempt.
- Numbers are typed as text and parsed Argentine style (`1.234,56`; a lone `.` followed by 3 digits is a thousands separator).

## Testing strategy (no browser)

Development happens in a Docker container with **no browser, and none can be installed**. Every automated test runs in Node; no Chrome, Firefox, Playwright, Puppeteer or Selenium.

**Design principle**: all logic lives in plain TypeScript modules outside the Svelte components. Components only display data and call into that logic.

- **Pure logic** (units, money, costing, stock, validation, shortcuts, service worker strategies): unit tests with Vitest. This is most of the coverage.
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
