# Bugfix: la factura de saldo no se genera con "Tenant signed lease"

## Causa raíz

En Vercel, Stripe rechazaba `stripe.invoices.create()` con este error:

> You may only specify one of these parameters: days_until_due, due_date.

En `src/lib/balance-invoice.ts`, dentro de `createAndSendStripeInvoice()`, se enviaban los dos parámetros a la vez:

```ts
collection_method: "send_invoice",
days_until_due: 3,
due_date: dueDate,          // plusBusinessDays(3)
```

Stripe no acepta los dos juntos, así que la creación de la Invoice lanzaba un error. `generateBalanceInvoice()` lo capturaba, lo registraba como `CRITICAL: Stripe invoice creation failed` y devolvía `success: false`. Por eso nunca se creaba la factura.

## 1. Corrección en `src/lib/balance-invoice.ts`

- **collection_method configurado: `send_invoice`.** No cambió. Ya era el que usaba el código y es el correcto: el owner paga por su cuenta desde el link de la factura, no hay cobro automático.
- Ahora solo se envía **`days_until_due`**, con el valor de la nueva constante `INVOICE_DAYS_UNTIL_DUE = 7`. **`due_date` ya no se envía.**
- Se quitó el helper `plusBusinessDays()` porque ya no se usaba.
- El `dueDateUnix` que devuelve la función ahora viene de `finalized.due_date`, es decir, la fecha de vencimiento que Stripe calcula al finalizar la factura a partir de `days_until_due`. Si por algún motivo falta ese campo, se calcula como `now + 7 días`. Así, el `due_date` que devuelve `generateBalanceInvoice()` y que usa `tenant-signed-lease/route.ts` para el email coincide con la fecha real de la factura en Stripe.

> Cambio de plazo: antes se intentaba vencer a los 3 días hábiles. Ahora son 7 días naturales. Para cambiarlo basta con editar `INVOICE_DAYS_UNTIL_DUE`.

## 2. Flujo de installments de Premier Tier (revisado)

- `src/app/api/cron/process-installments/route.ts` llama a la **misma** función `createAndSendStripeInvoice()` de `balance-invoice.ts`. Tenía exactamente el mismo bug: todas las cuotas de Premier habrían fallado con el mismo error de Stripe. **Queda corregido con el mismo cambio**, sin tocar nada en el cron.
- `src/lib/premier-installments.ts` no llama a Stripe. Su `due_date` es una columna de la tabla `plan_installments` en Supabase, que sirve para programar cuándo el cron factura cada cuota. No es un parámetro de Stripe, así que no tiene este problema y no se modificó.
- No hay ninguna otra llamada a `stripe.invoices.create()` en `src/`.

## 3. Tile "Pending" en Payment History (`src/app/(dashboard)/dashboard/payments/page.tsx`)

**Problema:** el tile no mostraba un saldo. Mostraba `pendingCount`, que era el **número** de filas de `payments` con `status === "pending"`, casi siempre 0. La tarjeta "Plan Balances" sí mostraba el saldo real (`row.pendingBalanceCents`, calculado con `computeBalanceCents`).

**Corrección:** el tile ahora muestra `pendingTotal`, que se calcula así:

- **Owners:** la suma de `pendingBalanceCents` de los mismos `planBalanceRows` que se pasan a `PropertyBalanceSummary`. Se excluyen las filas con `balanceInvoiceStatus === "paid"`, igual que hace la tarjeta, que en ese caso muestra "Balance paid in full". Tile y tarjeta usan ahora la misma fuente y el mismo cálculo. Por ejemplo, $505.00 en la tarjeta se verá como $505 en el tile.
- **Otros roles** (no tienen plan balances): la suma en dólares de sus pagos con `status === "pending"`.
- El valor se muestra con `formatCurrency()`, igual que el tile "Total Paid".

## 4. Nuevo log de diagnóstico

Al final de `createAndSendStripeInvoice()`, después de finalizar y enviar la factura:

```
[balance-invoice-diag] Invoice created successfully { invoiceId, hostedInvoiceUrl, dueDate, kind }
```

`kind` vale `plan_balance` en el flujo de "Tenant signed lease" y `plan_installment` en el cron de Premier, así que el log sirve para los dos flujos. Además, el log `Invoice created` ahora incluye `collectionMethod: "send_invoice"` y `daysUntilDue: 7`.

## Qué buscar en el próximo test

En los logs de Vercel, después de pulsar "Tenant signed lease":

1. `[balance-invoice-diag] About to create Invoice`
2. `[balance-invoice-diag] Invoice created { invoiceId, collectionMethod: "send_invoice", daysUntilDue: 7 }`
3. `[balance-invoice-diag] Invoice created successfully { invoiceId: "in_...", hostedInvoiceUrl: "https://invoice.stripe.com/...", ... }`
4. `[balance-invoice-diag] Property row persisted`

## Archivos modificados

- `src/lib/balance-invoice.ts`
- `src/app/(dashboard)/dashboard/payments/page.tsx`

Tal como pediste, no se ejecutó ninguna verificación local (build, tests).
