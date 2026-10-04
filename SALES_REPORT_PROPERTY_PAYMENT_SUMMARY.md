# Sales Report — resumen de pagos por propiedad

## Qué se agregó

En `/admin/reports` (Sales Report) hay una sección nueva, **"Payment summary by property"**, con una fila por propiedad (Property Owner e Investor):

| Columna | De dónde sale |
|---|---|
| Property | `properties.address`, `properties.city` |
| Owner | `profiles.full_name` (y email) del `owner_id` |
| Plan | Último pago completado de categoría `plan` de esa propiedad: "Founder Package", "Low Price", "Support Tier", "Premier Tier" o "Elite — Essentials / Signature / Lujo / Below Portfolio Minimum" |
| Upfront paid | Suma de pagos completados de un servicio de categoría `plan` para la propiedad |
| Pending balance | Ver "Cálculo del saldo pendiente" |
| Total paid to date | Upfront + saldo ya pagado + add-ons y demás pagos de la propiedad |
| Balance status | "Fully paid", "Pending balance", "Awaiting tenant lease signed" o "No plan purchased", con una línea de detalle |

La tabla se puede ordenar por cualquier columna (por defecto, mayor saldo pendiente primero), filtrar por estado ("With pending balance" muestra solo a quien debe algo), buscar por dirección, dueño o plan, y exportar a CSV lo que esté filtrado. El CSV incluye además el saldo ya pagado y los add-ons por separado.

La sección no depende del selector de período del reporte: siempre es acumulado histórico.

PYME no se tocó: no está ligado a una propiedad, así que sigue en el resumen existente por cliente.

## Quién la ve

- La API `/api/admin/reports` ya permitía los roles internos (admin, marketing, sales, support) y entrega los mismos datos a todos con el cliente service-role.
- El enlace "Sales Report" del sidebar solo aparecía para admin y sales. Se agregó **marketing**.

## Archivos tocados

| Archivo | Cambio |
|---|---|
| `src/lib/property-plan-balance.ts` (nuevo) | `resolvePropertyPlanBalance()`: la regla porcentaje → saldo pendiente, movida tal cual desde el dashboard del cliente |
| `src/app/(dashboard)/dashboard/payments/page.tsx` | Payment History del cliente ahora llama a `resolvePropertyPlanBalance()` en vez de tener la regla escrita en la página. Sin cambio de comportamiento |
| `src/lib/property-payment-summary.ts` (nuevo) | `buildPropertyPaymentSummary()`: arma las filas en el servidor |
| `src/app/api/admin/reports/route.ts` | Devuelve `propertySummary` junto al resto del reporte. Si falla, el resto del reporte sigue cargando |
| `src/components/admin/property-payment-summary-table.tsx` (nuevo) | La tabla: orden, filtro, búsqueda, CSV |
| `src/app/(dashboard)/admin/reports/page.tsx` | Renderiza la tabla entre el funnel y los promo codes |
| `src/components/layout/sidebar.tsx` | "Sales Report" visible también para marketing |

No hay migraciones ni cambios de esquema.

## Cálculo del saldo pendiente

### Misma fuente que el dashboard del cliente

El cliente ve su saldo en Payment History → Plan Balances (`PropertyBalanceSummary`). Esa cifra se calculaba dentro de `dashboard/payments/page.tsx`. En lugar de copiar la fórmula al reporte, se movió a `resolvePropertyPlanBalance()` y **las dos pantallas llaman a esa misma función**. Si la regla cambia, cambia en ambas.

La función recibe lo mismo en los dos lados:

1. **Plan**: el pago completado de categoría `plan` más reciente de la propiedad.
2. **Posición de la propiedad** entre las del dueño, ordenadas por `created_at`.
3. **`monthly_rent`** de la propiedad.

Y devuelve:

- Porcentaje: Low Price 35 %, Founder Package 30 %, Support/Premier 30 % en la primera propiedad y 28 % en las siguientes.
- Saldo: `max(0, renta × porcentaje − $200)` (`computeBalanceCents`, sin cambios).
- Elite: sin saldo porcentual (tarifa fija), igual que en el dashboard del cliente.

El reporte también replica el fallback de pagos antiguos sin `property_id`: se atribuyen a la propiedad solo si el dueño tiene exactamente una.

### Estado del saldo

| Situación | Saldo pendiente | Estado |
|---|---|---|
| Sin pago de plan | — | No plan purchased |
| Elite | — | Fully paid ("Flat fee — no percentage balance") |
| `balance_invoice_status = paid` | — | Fully paid |
| El upfront ya cubre toda la tarifa, o falta la renta | — | Fully paid (con detalle) |
| Factura `open` / `overdue` / `uncollectible` | Saldo calculado | Pending balance ("Invoice open"…) |
| Sin factura y sin `tenant_lease_signed_at` | Saldo calculado | Awaiting tenant lease signed |
| Lease firmado pero sin factura | Saldo calculado | Pending balance ("Invoice not issued yet") |
| Premier con cuotas | Suma de cuotas no pagadas | Pending balance / Fully paid ("1 of 3 installments paid") |

### Diferencias conocidas con lo que ve el cliente

1. **Premier Tier con cuotas ya pagadas.** El reporte muestra lo que falta (cuotas no pagadas). La tarjeta del cliente sigue mostrando en la línea "Pending balance" el saldo completo aunque las cuotas aparezcan como "Paid" debajo. Se dejó así a propósito: en una lista de "quién debe", un Premier al día no debe aparecer como deudor. Mientras no haya cuotas pagadas, las dos cifras coinciden.
2. **Upfront.** El cliente ve un "Paid: $200" fijo. El reporte suma los pagos reales, que incluyen impuestos y pagos netos por cambio de plan, así que puede mostrar por ejemplo $210.

### Diferencia entre lo mostrado y lo facturado (ya existía)

La factura real de saldo (`generateBalanceInvoice`) no usa la misma fórmula que la pantalla del cliente:

- Resta **lo realmente pagado** en la propiedad, no $200 fijos.
- Usa un porcentaje fijo por plan (Premier siempre 28 %, Support siempre 30 %), sin distinguir primera propiedad de las siguientes.
- Cuenta como "ya pagado" cualquier pago `one_time` de la propiedad, lo que incluye el add-on de priority listing.

Por eso el monto facturado puede no coincidir con el saldo que ven el cliente y este reporte. El reporte sigue al dashboard del cliente, como se pidió; esa diferencia no se tocó aquí.

## Verificación

No se corrió build, typecheck ni la app. El cambio se revisó leyendo el código.
