# Bugfix: el pendiente de Premier no descontaba las cuotas pagadas

Diagnóstico previo: `INVESTIGATION_PAYMENT_HISTORY_PENDING.md`.

**Síntoma:** en 111 Washington St (Premier, propiedad #2, renta $3,000, saldo $640 en
cuotas de $320 / $192 / $128), después de pagar la cuota #1 el Sales Report mostraba
$320 pendientes, pero `/dashboard/payments` seguía mostrando $640.

**Regla aplicada** (la misma que ya usa el Sales Report en
`src/lib/property-payment-summary.ts:274-276`): si la propiedad es Premier y tiene
cuotas activas (todas las que no están en estado `voided`), el pendiente es la suma de
`amountCents` de las cuotas que no están en estado `paid`. En cualquier otro caso se
mantiene el cálculo de antes: renta × % − $200.

---

## Archivos y líneas cambiados

### 1. `src/app/(dashboard)/dashboard/payments/page.tsx` (líneas 183-196)
Dentro del `forEach` que construye `planBalanceRows`:
- **Antes:** `const { pendingBalanceCents, isPremier: isPremierProperty } = balance;`
- **Ahora:** `pendingBalanceCents` se calcula con la regla anterior, a partir de
  `installmentsByProperty[propId]` (ya se cargaba en la línea 131). Si la propiedad no es
  Premier, o es Premier sin cuotas activas, se usa `balance.pendingBalanceCents` sin
  cambios.
- El objeto que se añade a `planBalanceRows` (198-207) no cambia.
- **No se ha tocado** el tile "Pending" (236-244): sigue sumando `row.pendingBalanceCents`,
  así que se corrige solo.
- **No se ha tocado** `PropertyBalanceSummary`.

### 2. `src/components/dashboard/owner-plan-portfolio-breakdown.tsx` (líneas 68-89)
- Se ha quitado el `const pendingBalanceCents = computeBalanceCents(...)` de la antigua
  línea 69.
- Se calcula después de obtener `balance = balanceByProperty[prop.id]`. Si `isPremier` es
  true y `balance.installments` tiene cuotas activas, se usa la suma de las que no están
  pagadas. En otro caso se usa `computeBalanceCents(...)` igual que antes.
- `totalFeeCents`, el texto "Total service fee", el checkout y el estado "paid" no cambian.

### `src/app/(dashboard)/dashboard/services/page.tsx`: sin cambios
Ya carga `plan_installments` con `amount_cents` y `status` (líneas 227-256) y los pasa al
componente mediante `balanceByProperty` (líneas 818-825 y 991-998). No hacía falta tocarlo.

---

## Qué queda igual

- **Low Price, Founders y Support:** su `isPremier` es false en ambos sitios, así que la
  rama nueva nunca se ejecuta y el valor es exactamente el de antes. Support, en
  `services/page.tsx:822`, pasa `isPremier={false}`.
- **Premier sin cuotas** (todavía no programadas): sigue mostrando renta × % − $200.
- **No se ha tocado:** el webhook, `generateBalanceInvoice` / `balance-invoice.ts`,
  `premier-installments.ts`, `resolvePropertyPlanBalance`, el Sales Report
  (`property-payment-summary.ts`) y `PropertyBalanceSummary`.
- No se han ejecutado `npm install`, build ni lint. Solo pasé el comprobador de tipos
  (`npx tsc --noEmit`) y no da errores en los dos archivos modificados.

---

## Qué deberías ver tras el deploy (111 Washington St, cuota #1 pagada)

| Lugar | Antes | Después |
|---|---|---|
| `/dashboard/payments`, tile "Pending" | $640.00 | **$320.00** (más los pendientes de otras propiedades, si las hay) |
| `/dashboard/payments`, Plan Balances → "Pending balance" | $640.00 | **$320.00** |
| `/dashboard/services`, tarjeta Premier de la propiedad → "Pending balance" | $640.00 | **$320.00** |
| Lista de cuotas | 1 Paid, 2 y 3 pendientes | sin cambios |
| Sales Report | $320 | $320 (sin cambios) |

Al pagar la cuota #2 bajará a $128. Al pagar la #3 mostrará **"Pending balance: $0.00"**
y la lista de cuotas seguirá visible. El texto "Balance paid in full" se usa solo para
facturas de pago único y no se ha cambiado para Premier. El tile "Pending" sumará $0 por
esa propiedad.

---

## Solo reporte (no modificado): "Elite maintenance — <dirección>" en "All Payments"

**Origen:** `src/app/(dashboard)/dashboard/payments/page.tsx:459-465`

```ts
const serviceName =
  payment.services?.name ||
  payment.pymes_plans?.name ||
  (paymentProperty
    ? `Elite maintenance — ${paymentProperty.address}, ${paymentProperty.city}`
    : "—");
```

Cuando una fila no tiene `service_id` ni `pymes_plan_id` pero sí `property_id`, la página
**supone** que es un cargo de mantenimiento Elite, sin mirar `payment_type`. Los pagos de
saldo y de cuotas que guarda el webhook encajan en ese caso:
- Cuota Premier: `payment_type: "plan_installment"`, sin `service_id`
  (`src/app/api/stripe/webhook/route.ts:546-556`).
- Saldo de pago único (Langley): `payment_type: "plan_balance"`, sin `service_id`
  (`src/app/api/stripe/webhook/route.ts:501-514`).

En ambos casos aparece "Elite maintenance — …".

Hay otra suposición igual en `page.tsx:270-275` (nombre del plan en "Active installment
plans"). Solo afecta a filas con `stripe_subscription_id`, así que no a cuotas ni a saldos.

**Qué debería mostrarse:**
- Cuota Premier: **"Premier Tier installment N — <dirección>, <ciudad>"**, el mismo texto
  que la factura de Stripe (`src/lib/premier-installments.ts:476`). La fila de `payments`
  no guarda el número de cuota. Se puede obtener cruzando `payments.stripe_session_id`
  (el id de la factura) con `plan_installments.stripe_invoice_id`. Si eso se considera
  demasiado, basta con "Premier Tier installment — <dirección>, <ciudad>".
- Saldo de pago único (Langley): "Plan balance — <dirección>, <ciudad>".
- El texto "Elite maintenance — …" debería quedarse solo para
  `payment_type === "elite_maintenance"`.

La columna "Installment" muestra "—" en estas filas porque el webhook no rellena
`installment_number` / `total_installments` para `plan_installment`.
