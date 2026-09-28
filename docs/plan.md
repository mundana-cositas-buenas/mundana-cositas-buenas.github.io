# Mundana: plan de implementación

App web para una tienda de productos alimenticios, con dos módulos independientes:

1. **Costos de recetas**: saber cuánto cuesta producir un producto para decidir a cuánto venderlo.
2. **Stock**: cargar stock, descontar por venta y avisar cuando queda poco.

## Decisiones ya tomadas

- Un solo usuario, un solo dispositivo, uso principalmente en **PC**.
- Web estática publicada en **GitHub Pages**, sin backend ni costo de hosting.
- Datos locales en **IndexedDB**. Los datos viven en el navegador, así que el **backup es obligatorio**.
- Los dos módulos **no se relacionan**. Las recetas no descuentan stock y no existe el concepto de "producción". Los insumos de las recetas y los productos del stock son catálogos distintos.
- **PWA obligatoria**: la app debe funcionar **100 % sin internet** y poder instalarse como app local (ventana propia, ícono). Es un requisito del núcleo, no un extra.
- Prioridad: **utilidad y confiabilidad sobre estética**. Interfaz sobria, rápida, orientada a teclado y tablas.
- **Dependencias mínimas.**

## Stack

- **TypeScript + Svelte + Vite** (Svelte compila a JS sin runtime pesado). Alternativa: TS vanilla + Vite, si se prefiere cero framework.
- **IndexedDB directo**, con un wrapper propio de ~100 líneas (sin Dexie).
- Sin librería de UI, sin librería de estado (stores de Svelte), sin librería de fechas ni de gráficos.
- Estilos con CSS simple escrito a mano, con un único archivo global.
- Publicación con **GitHub Actions**, que hace el build y despliega en Pages.
- Tests con **Vitest** (dependencia de desarrollo) para la lógica de costos y conversión de unidades. **Sin navegador**: ver la sección "Estrategia de testing".
- **PWA con manifest y service worker escritos a mano** (sin `vite-plugin-pwa`), que precachea todos los archivos del build. Estrategia: cache-first para los assets con versión en el nombre del cache, y `index.html` precacheado.

## Estructura de carpetas sugerida

```
mundana/
  src/
    lib/
      db.ts            # wrapper de IndexedDB (abrir, get, put, delete, list, transacciones)
      units.ts         # unidades y conversiones
      money.ts         # manejo de dinero
      backup.ts        # exportar / importar JSON
    costos/
      types.ts
      calc.ts          # cálculo de costos (funciones puras, testeadas)
      InsumosView.svelte
      RecetasView.svelte
      RecetaDetalle.svelte
    stock/
      types.ts
      logic.ts         # cálculo de stock, alertas (funciones puras)
      ProductosView.svelte
      MovimientosView.svelte
      AlertasView.svelte
    App.svelte         # navegación entre módulos
    main.ts            # registra el service worker
    app.css
  public/
    manifest.webmanifest
    icons/             # 192x192, 512x512 y maskable
  src/sw.ts            # service worker (o public/sw.js generado con la lista de archivos en el build)
  .github/workflows/deploy.yml
  package.json
  vite.config.ts       # `base: '/'`: el repo es el sitio de organización mundana-cositas-buenas.github.io
```

## Modelo de datos

Object stores de IndexedDB. Todos los registros llevan `id` (UUID) y `actualizadoEn`.

### Módulo costos
- **insumos**: `nombre`, `unidadBase` (`g` | `ml` | `u`), `precioCompra`, `cantidadCompra` (en la unidad indicada), `unidadCompra`. Se deriva `costoPorUnidadBase`.
- **recetas**: `nombre`, `rendimiento` (cantidad de unidades que salen), `unidadRendimiento` (texto libre, "panes"), `margen` (%), `notas`.
- **recetaLineas**: `recetaId`, `tipo` (`insumo` | `costoFijo`), `insumoId?`, `cantidad?`, `unidad?`, `mermaPct?`, `descripcion?`, `monto?`.
  - Las líneas `costoFijo` cubren gas, packaging, mano de obra.
- **historialPrecios**: `insumoId`, `fecha`, `unidadBase`, `costoPorUnidadBase` (centavos con decimales). Hecho en la Fase 5.

### Módulo stock
- **productos**: `nombre`, `unidad` (texto libre: botella, kg, paquete), `stockMinimo`, `precioVenta?`, `activo`.
- **movimientos**: `productoId`, `tipo` (`entrada` | `venta` | `ajuste`), `cantidad` (positiva; el signo se deduce del tipo, o con signo en el caso de `ajuste`), `fecha`, `nota?`, `anuladoEn?` (movimiento anulado: queda en el historial pero no cuenta).
  - **El stock actual se calcula sumando los movimientos.** No se guarda como número editable, así hay historial y se puede deshacer una venta.
  - Si el rendimiento se vuelve un problema, guardar un `stockCache` en el producto y recalcularlo dentro de la misma transacción.

### Reglas
- **El costo de una receta nunca se guarda.** Se calcula al mostrarlo, así que al cambiar el precio de un insumo todas las recetas se actualizan.
- **Dinero en enteros** (centavos). Formateo solo al mostrar.
- **Unidades**: conversiones solo dentro de la misma familia (masa: kg↔g, volumen: l↔ml, cantidad: u). No se permite mezclar familias, y si pasa se muestra un error claro en la línea.
- Borrar un insumo usado por una receta debe **advertir o bloquearse**.

## Fórmulas (módulo costos)

```
costoPorUnidadBase = precioCompra / (cantidadCompra convertida a unidad base)
costoLinea         = cantidad (en unidad base) * costoPorUnidadBase / (1 - mermaPct/100)
costoTotal         = suma(costoLinea) + suma(costosFijos)
costoPorUnidad     = costoTotal / rendimiento
precioSugerido     = costoPorUnidad * (1 + margen/100)
```

Ejemplo de referencia (usar como test): harina a $1000/kg y una receta con 100 g da $100 de harina.

## Estrategia de testing (sin navegador)

Claude trabaja dentro de un contenedor Docker **sin navegador instalado ni posibilidad de instalarlo**. Todo test automatizado debe correr en Node, sin Chrome, Firefox, Playwright, Puppeteer ni Selenium.

**Principio de diseño**: toda la lógica va en módulos TypeScript puros, fuera de los componentes Svelte. Los componentes solo muestran y llaman a esa lógica.

- **Lógica pura** (`units`, `money`, `calc`, `stock/logic`, validaciones): tests unitarios con Vitest en entorno `node`. Es la mayor parte de la cobertura.
- **IndexedDB**: tests con **`fake-indexeddb`** (dependencia de desarrollo) en Node. Cubre el wrapper `db.ts`, las migraciones de esquema, las transacciones y los CRUD.
- **Backup**: test de ida y vuelta (exportar, vaciar, importar, comparar) sobre `fake-indexeddb`, más tests de validación con JSON malformado, versión desconocida y campos faltantes.
- **Componentes Svelte** (opcional, con criterio): si hace falta, `@testing-library/svelte` con `jsdom` o `happy-dom` como dependencias de desarrollo. Solo para flujos críticos. Preferir sacar la lógica a funciones puras.
- **Service worker**: separar la lógica en funciones puras (elegir la estrategia de cache según la URL, filtrar caches viejos, construir la lista de precache) y testearlas en Node. El SW en sí queda como un envoltorio fino.
- **Manifest**: test que lee `manifest.webmanifest` y comprueba campos obligatorios, que los íconos existen, y que `start_url` y `scope` son coherentes con `base`.
- **Build y tipos**: `vite build`, `tsc --noEmit` y `svelte-check` deben pasar. Test que revisa el `dist/` generado: existe `index.html`, la lista de precache contiene todos los archivos, y no hay URLs absolutas a hosts externos (garantía de "sin dependencia de red").
- **CI**: GitHub Actions ejecuta tests, chequeo de tipos y build antes de desplegar.

### Lo que Claude NO puede verificar y debe hacer el usuario

Todo lo que dependa de un navegador real se lista como **verificación manual del usuario** y no se marca como hecho hasta que lo confirme:
- Instalación de la PWA en Chrome sobre Windows.
- Arranque sin red con el service worker real.
- Uso sin conexión en Firefox.
- Aspecto visual, usabilidad y foco por teclado.
- Descarga real del backup y selección de archivo al importar.
- Flujo de actualización del service worker (aviso de versión nueva).

Claude debe decir explícitamente cuando algo quedó **sin probar en navegador**, y dejar una lista corta de pasos manuales para el usuario.

## Fases

### Fase 0: esqueleto
- [x] Crear proyecto Vite + Svelte + TS, con Vitest y `fake-indexeddb` configurados desde el inicio.
- [x] Layout con navegación entre "Costos" y "Stock" (y "Backup").
- [x] Wrapper de IndexedDB (`db.ts`) con versionado de esquema.
- [x] Workflow de GitHub Actions y primer despliegue de prueba en Pages (`.github/workflows/deploy.yml`, Pages → Source: GitHub Actions).
- [x] `navigator.storage.persist()` al iniciar.

### Fase 1: módulo costos
- [x] `units.ts`, `money.ts` y `calc.ts` con tests en Vitest (empezar por aquí).
- [x] CRUD de insumos, en tabla editable con búsqueda por nombre.
- [x] CRUD de recetas con líneas (agregar, editar y quitar ingredientes, elegir unidad).
- [x] Vista de receta: desglose de costo por línea, total, costo por unidad, margen y precio sugerido, todo en vivo mientras se edita.
- [x] Líneas de costo fijo.
- [x] Duplicar receta (útil para variantes).
- [x] Listado de recetas con costo por unidad y precio sugerido de cada una.
- Nota: la lógica (unidades, dinero, cálculo, validación, persistencia) está testeada en Node; las vistas quedan **sin probar en navegador** hasta que el usuario las revise.

### Fase 2: módulo stock
- [x] `logic.ts` (cálculo de stock y alertas) con tests.
- [x] CRUD de productos.
- [x] Registro rápido de movimientos (entrada, venta, ajuste), pensado para teclado: elegir producto, cantidad, Enter.
- [x] Listado de productos con stock actual, resaltando en color los que están bajo el mínimo.
- [x] Panel de **Alertas** de stock bajo, más un badge con el contador visible en la navegación.
- [x] Historial de movimientos por producto, con posibilidad de anular un movimiento.
- Notas: anular no borra: marca `anuladoEn` y el movimiento deja de contar (queda tachado en el historial). Alerta = producto activo con stock ≤ mínimo ("bajo") o ≤ 0 ("sin stock"). Borrar un producto borra sus movimientos (se sugiere desactivarlo). La lógica y la persistencia están testeadas en Node; las vistas quedan **sin probar en navegador**.

### Fase 3: backup (imprescindible)
- [x] **Exportar** todo a un único JSON con `version`, `exportadoEn` y todos los stores. Descarga con nombre `mundana-AAAA-MM-DD.json`.
- [x] **Importar** con validación de esquema y versión, con vista previa (cantidad de registros) y confirmación antes de reemplazar. Hacer un export automático previo a la importación.
- [x] Guardar la fecha del último backup y mostrar un **aviso si pasaron más de 7 días**.
- [x] Exportar a **CSV** de productos, insumos y recetas (opcional).
- [x] Test de ida y vuelta: exportar, borrar todo, importar y comprobar que queda idéntico.
- Notas: formato `{ formato: 'mundana-backup', version, exportadoEn, datos: { insumos, recetas, recetaLineas, productos, movimientos } }`; `meta` (fecha del último backup) no se exporta. `version` es la versión del formato del backup (no la del esquema de IndexedDB): subirla si cambia la forma de los registros y enseñarle a `leerBackup` a convertir los archivos viejos. La validación revisa campos de cada registro, ids repetidos y referencias (líneas → receta/insumo, movimientos → producto); la importación reemplaza todo en una sola transacción. El aviso de 7 días solo aparece si hay datos. CSV con `;`, coma decimal y BOM (Excel en español). Lógica testeada en Node; la descarga real y la selección de archivo quedan **sin probar en navegador**.

### Fase 4: PWA y uso sin conexión (requisito del núcleo)
- [x] `manifest.webmanifest`: `name`, `short_name`, `start_url` y `scope` relativos al `base` de Pages, `display: standalone`, colores e íconos (192, 512, maskable).
- [x] Service worker que **precachea todo el build** (HTML, JS, CSS, íconos). Generar la lista de archivos en el build (plugin mínimo de Vite propio, ~30 líneas).
- [x] Versionado del cache: nombre con hash o versión del build, y limpieza de caches viejos en `activate`.
- [x] **Actualizaciones**: detectar un service worker nuevo y mostrar un aviso "Hay una versión nueva, recargar". Nunca recargar solo si hay un formulario a medio llenar.
- [x] Ninguna dependencia de red en tiempo de ejecución: sin CDN, sin fuentes remotas, sin analítica. Fuentes del sistema.
- [x] Indicador discreto de estado de conexión (opcional, informativo).
- [x] Tests automáticos en Node: lógica del SW (estrategias, limpieza de caches, lista de precache), validez del manifest y revisión del `dist/` (sin URLs externas, precache completo).
- [x] **[Manual, usuario]** Cargar la app una vez, cortar la red (DevTools → Offline o desconectar), cerrar y reabrir, y comprobar que todo funciona, incluidos backup e importación.
- [x] **[Manual, usuario]** Probar la instalación en **Chrome sobre Windows** (Instalar app, ventana propia, arranque sin red).
- [x] **[Manual, usuario]** Probar el uso sin conexión en **Firefox** como pestaña normal (sin instalación).
- [x] Pedir `navigator.storage.persist()` también al instalar.
- Notas: lógica pura en `src/pwa/logic.ts`; `src/pwa/sw.ts` es el envoltorio y el plugin `mundana-precache` de `vite.config.ts` lo compila a `/sw.js` (autocontenido: el build falla si comparte un chunk con la app), le inyecta la lista de archivos (build + `public/`) y un hash FNV del contenido como versión del cache (`mundana-<hash>`). Cache-first para todo lo precacheado; cualquier navegación dentro del scope recibe `index.html`; el precache se baja con `cache: 'reload'` para no mezclar un `index.html` viejo del cache HTTP. El SW nuevo espera (sin `skipWaiting`) hasta que el usuario toca "Recargar" en el aviso; si hay campos escritos sin guardar (`src/pwa/ediciones.ts`) se pide confirmación. La app busca actualizaciones cada hora y al volver a la pestaña. Manifest, `start_url` y `scope` relativos (`./`), así que sirven también bajo un sub-path. Íconos generados con `node scripts/iconos.mjs` (sin herramientas de imagen). Sin SW en `npm run dev`. Tests de manifest y de `dist/` en `test/` (este último hace un build real a un directorio temporal). El SW real, la instalación y el aviso de actualización quedan **sin probar en navegador**.

### Fase 5: pulido
- [x] Atajos de teclado y foco correcto en formularios.
- [x] Validaciones y mensajes de error claros (unidades incompatibles, campos vacíos, números negativos).
- [x] Impresión de la lista de precios sugeridos (CSS `@media print`).
- [x] Historial de precios de insumos (opcional).
- [x] **[Manual, usuario]** Probar atajos y foco, los mensajes de error, la impresión y el historial en Chrome (ver notas).
- Notas:
  - **Atajos** (`src/lib/atajos.ts`, lógica pura testeada): teclas sueltas que solo funcionan fuera de los campos de texto y sin Ctrl/Alt: `r` Recetas, `i` Insumos, `p` Productos, `m` Movimientos, `a` Alertas, `b` Backup, `n` "nuevo" (primer campo para cargar), `/` buscar, `?` ayuda (también con el botón "Atajos" del pie; Esc la cierra). Las páginas marcan sus destinos con `data-atajo="nuevo"` / `data-atajo="buscar"`.
  - **Foco**: al guardar o cancelar la edición de una fila (insumos, productos), el foco vuelve a su botón "Editar"; si falta algo, va al primer campo inválido. Al crear o duplicar una receta se abre con el nombre seleccionado (ruta `#/costos/receta/<id>/nueva`, que se limpia sola). En Movimientos el foco arranca en el producto. En una receta, agregar insumo es ahora un campo con autocompletado (como el de productos en Movimientos) en vez de un `<select>` que agregaba la línea con solo mover la flecha; Enter en una línea la da por terminada y vuelve a ese campo.
  - **Mensajes**: los errores dicen el campo ("Precio de compra: No puede ser negativo") y, tras el primer intento de guardar, se actualizan mientras se escribe. Número mal escrito: "No es un número (ej.: 1,5 o 1.250)". En las líneas de receta el error de tipeo se muestra en la columna Costo con "(sin guardar)". Las unidades incompatibles ya tenían mensaje propio.
  - **Impresión**: botón "Imprimir precios" en Recetas (imprime las recetas visibles, respeta la búsqueda), con la opción "Imprimir con costos"; sin ella salen solo rinde y precio sugerido. El CSS `@media print` oculta navegación, avisos, barras y botones.
  - **Historial de precios**: store `historialPrecios` (migración 3 de IndexedDB, que carga el costo actual de cada insumo como punto de partida). `guardarInsumo` agrega una entrada en la misma transacción solo si cambió el costo por unidad base (renombrar o cambiar precio y cantidad a la vez sin cambiar el costo no cuenta); borrar un insumo borra su historial. Botón "Historial" en cada insumo, con la variación % respecto del registro anterior (solo dentro de la misma familia de unidades). El backup pasa a la versión 2 del formato e incluye el historial; los archivos de la versión 1 se siguen importando (con historial vacío).
  - Todo lo visual y de teclado queda **sin probar en navegador**. Pasos manuales: (1) en Insumos y Productos, `n`, escribir, Enter; dejar un campo mal y ver el mensaje y el foco; editar con doble clic, Esc, y ver que el foco vuelve a "Editar". (2) `?` muestra la ayuda; probar cada tecla fuera de un campo y ver que dentro de un campo no hacen nada. (3) Nueva receta: el nombre aparece seleccionado; `n`, escribir parte de un insumo, Enter, cantidad, Enter, siguiente insumo. (4) "Imprimir precios" con y sin costos (vista previa de impresión de Chrome). (5) Cambiar el precio de un insumo y ver su historial. (6) Exportar un backup y reimportarlo.

## Riesgos a tener presentes

- **Pérdida de datos por borrado del navegador**: mitigado con backup, aviso de antigüedad y `storage.persist()`.
- **Cambios de esquema en IndexedDB**: usar `version` desde el principio y escribir migraciones explícitas.
- **Instalación de la PWA según el navegador**: se usará en **Windows con Chrome** (principal), posiblemente también con Firefox. Chrome permite instalarla en escritorio. **Firefox de escritorio no soporta instalar PWAs**, aunque el uso sin conexión funciona igual desde una pestaña. Por eso el modo offline no debe depender de la instalación. Probar en ambos.
- **Datos separados por navegador**: los datos de Chrome y los de Firefox son independientes. Si se usan los dos, cada uno tendrá su propia base. Usar **un navegador como principal** y el otro solo con el backup para pasar datos.
- **Service worker mal versionado**: puede dejar al usuario con una versión vieja atascada en cache. Mitigar con cache versionado, limpieza en `activate` y aviso de actualización.
- **Rutas en GitHub Pages**: el repo es `mundana-cositas-buenas.github.io` (sitio de organización), así que la app vive en la raíz del dominio y `base` es `/`. Si algún día se mueve a un repo de proyecto (`usuario.github.io/repo/`), `base`, `start_url`, `scope` y las rutas del service worker deben ser relativos o usar ese prefijo.
- **Los datos son por origen**: si cambia el dominio o el nombre del repo, se pierden los datos visibles. Por eso el backup es lo que permite migrar.
- **Errores de redondeo**: dinero en enteros y redondear solo al mostrar.
- **Unidades**: es la fuente más probable de errores de cálculo, por eso `units.ts` se hace primero y con tests.

## Cómo empezar en la próxima sesión

1. Leer este archivo.
2. Confirmar Svelte o TS vanilla (por defecto: Svelte).
   - Recordar: **no hay navegador disponible**. Todo se testea en Node (ver "Estrategia de testing") y lo demás queda como verificación manual del usuario.
3. Navegador objetivo: **Windows + Chrome** (principal), Firefox posible. Ya confirmado.
4. Fases 0 a 5 hechas, desplegadas en Pages y verificadas por el usuario en el navegador. El plan está completo: lo que siga son mejoras o arreglos nuevos.
