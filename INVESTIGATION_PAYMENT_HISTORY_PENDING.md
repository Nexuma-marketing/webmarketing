# Investigación: Payment History sigue mostrando "Pending $640" tras pagar la cuota #1 de Premier

**Caso:** 111 Washington St, Premier Tier, renta $3,000, upfront $200 pagado.
Es la propiedad #2 del propietario (28 %): 3,000 × 0.28 − 200 = **$640** de saldo,
dividido 50 % / 30 % / 20 % → cuotas de $320 / $192 / $128
(`src/lib/premier-installments.ts:94-123`). Tras pagar la cuota #1 deberían quedar
pendientes **$320** (192 + 128).

- Sales Report → $320 ✅
- `/dashboard/payments` → tile "Pending" $640 ❌, tarjeta "Pending balance: $640.00" ❌, cuota 1 "Paid" ✅

Solo diagnóstico: no se ha modificado código.

---

## Causa raíz (resumen)

`/dashboard/payments` toma el pendiente directamente de
`resolvePropertyPlanBalance().pendingBalanceCents`, que es el **saldo total teórico**
(renta × % − $200) y no tiene en cuenta los pagos. Para Premier, la página **no
descuenta las cuotas pagadas**, aunque ya las carga para pintar la lista. El Sales
Report, en cambio, cuando la propiedad es Premier y tiene cuotas, **sustituye** ese
valor por la suma de las cuotas no pagadas. No hay ningún problema de caché.

---

## 1. De dónde sale cada valor en /dashboard/payments

Archivo: `src/app/(dashboard)/dashboard/payments/page.tsx` (Server Component).

### "Pending balance: $640.00" (tarjeta de la propiedad en "Plan Balances")
1. `page.tsx:124-128`: carga las propiedades del propietario ordenadas por `created_at`.
2. `page.tsx:131-148`: carga `plan_installments` de esas propiedades y los agrupa en
   `installmentsByProperty` (solo para la vista: secuencia, importe, estado, URL).
3. `page.tsx:164-194`: para cada propiedad con un pago de plan completado:
   - `page.tsx:175-181`: llama a `resolvePropertyPlanBalance({ planName, propertyIndex: index, monthlyRentCad: rent, ownerLatestPlanName, balancePaid })`.
   - `page.tsx:183`: `const { pendingBalanceCents, isPremier } = balance;`
   - `page.tsx:189`: guarda `pendingBalanceCents` **sin modificar** en `planBalanceRows`.
   - `page.tsx:192`: adjunta `installments` (solo para mostrarlos).
4. `page.tsx:348-355`: lo pasa a `<PropertyBalanceSummary pendingBalanceCents={row.pendingBalanceCents} installments={row.installments} />`.
5. `src/components/dashboard/property-balance-summary.tsx:85-91`: imprime
   `Pending balance: formatCents(pendingBalanceCents)`. El componente es puramente
   visual: muestra el badge "Paid" de cada cuota (`:126-129`), pero **no recalcula**
   el pendiente a partir de ellas. Para Premier `balanceInvoiceStatus` es `null`
   (`page.tsx:191`), así que nunca entra en la rama "Balance paid in full".

Resultado: 3,000 × 0.28 − 200 = 640 → `$640.00`.

### Tile superior "Pending"
- `page.tsx:225-231`: para el rol propietario,
  `pendingTotal = planBalanceRows.filter(row => row.balanceInvoiceStatus !== "paid").reduce(sum + row.pendingBalanceCents) / 100`.
- Se pinta en `page.tsx:317-325`.

Es la **suma de los mismos `row.pendingBalanceCents`** de las tarjetas, así que hereda el
mismo $640. (El comentario de `:218-224` dice explícitamente que el tile debe coincidir
con las tarjetas: está bien que coincidan, pero ambos parten de un valor erróneo para Premier.)

## 2. ¿Usan resolvePropertyPlanBalance? ¿Qué hace distinto el Sales Report?

Ambos usan `resolvePropertyPlanBalance` (`src/lib/property-plan-balance.ts:46-88`), con
las mismas entradas. Esa función solo calcula `computeBalanceCents` (renta × % − $200,
`src/lib/plan-percentage.ts:25-32`); **no recibe pagos ni cuotas**, así que siempre
devuelve el saldo bruto. La diferencia está en lo que cada pantalla hace **después**:

| | Sales Report (`src/lib/property-payment-summary.ts`) | Payment History (`page.tsx`) |
|---|---|---|
| Llamada | `:258-264` | `:175-181` |
| Premier con cuotas | `:274-276`: si `balance.isPremier && propInstallments.length > 0` → `pendingCents = Σ amount_cents de cuotas con status ≠ "paid"` (excluyendo `voided`, `:266-268`) | No existe esa rama: usa `balance.pendingBalanceCents` tal cual (`:183`, `:189`) |
| Premier sin cuotas | `:287` → `balance.pendingBalanceCents` | igual |
| Lump-sum (Low Price / Founders / Support) pagado | `:284-285` → 0 por `balance_invoice_status === "paid"` | filtrado en el tile (`:227`) y "Balance paid in full" en la tarjeta |

El comentario de cabecera de `property-plan-balance.ts:3-8` afirma que ambas superficies
"can never drift apart", pero la lógica de cuotas Premier se añadió solo en el Sales
Report, **fuera** de la función compartida; por eso divergen.

## 3. ¿Se restan los pagos `plan_installment`?

**No, ni por pagos ni por cuotas.** La página nunca mira `payments` para calcular el
pendiente. Usa `payments` solo para:
- `page.tsx:160-163` `ownerLatestPlanName`: filtra `services.category === "plan"`.
- `page.tsx:166-171` `planPayment` (el upfront de la propiedad): mismo filtro `category === "plan"`.

La fila del pago de la cuota tiene `service_id = null` (ver punto 5), así que
`services` vale `null` y queda excluida por esos filtros. Eso es **correcto** (si no, se
tomaría como "pago de plan"), pero significa que el importe pagado no se resta en ningún
sitio. Tampoco se usa el `status: "paid"` de `plan_installments`, que la página ya tiene
cargado en `installmentsByProperty`.

El pago **sí** suma en el tile "Total Paid" (`page.tsx:214-216`, todos los pagos
completados) y cuenta en "Transactions".

## 4. ¿Hay caché?

**No.** Descartado:
- `createClient()` (`src/lib/supabase/server.ts:4-5`) llama a `cookies()` y la página
  llama a `supabase.auth.getUser()` → renderizado dinámico en cada petición (Next 16.2.3).
- `next.config.ts` no activa `cacheComponents`, `staleTimes` ni `"use cache"`; la página
  no exporta `revalidate` y no usa `unstable_cache`.
- La página y `PropertyBalanceSummary` son Server Components (sin `"use client"`), así que
  no hay estado de cliente que pueda quedarse viejo.
- Prueba empírica: la cuota se ve como "Paid" en el mismo render, así que los datos
  son frescos. El $640 es un valor **calculado**, no uno cacheado. Por eso refrescar no
  cambia nada.

## 5. Cómo guarda el webhook el pago de una cuota

`src/app/api/stripe/webhook/route.ts:525-559` (`invoice.payment_succeeded` con
`metadata.kind === "plan_installment"`, metadata puesta en `src/lib/premier-installments.ts:480-486`):

1. `:530-535`: `plan_installments` → `status: "paid"` para `metadata.installment_id`.
2. `:546-556`: inserta en `payments`:

| Columna | Valor |
|---|---|
| `user_id` | `properties.owner_id` |
| `property_id` | `installmentRow.property_id` (o `metadata.property_id`) → **sí se guarda** |
| `service_id` | **no se envía → `NULL`** |
| `pymes_plan_id` | `NULL` |
| `payment_type` | `"plan_installment"` |
| `amount` | `invoice.amount_paid / 100` (320) |
| `stripe_session_id` | `invoice.id` |
| `status` | `"completed"` |

`payments` no tiene columna `category`: la categoría es la de `services` a través de
`service_id`. Con `service_id = NULL`, la fila **no tiene categoría** (no es `'plan'`).
El Sales Report la clasifica por `payment_type` (`property-payment-summary.ts:110, 239-240`
→ `balancePaid`), y Payment History la ignora para el saldo.

## 6. Propuesta de cambio mínimo (NO aplicada)

**Dónde:** solo en `src/app/(dashboard)/dashboard/payments/page.tsx`, dentro del `forEach`
(`:183-193`). Hay que replicar la rama Premier del Sales Report
(`property-payment-summary.ts:274-276`) usando las cuotas que ya están cargadas:

```ts
const { isPremier: isPremierProperty } = balance;
const propInstallments = isPremierProperty ? installmentsByProperty[propId] : undefined;
const activeInstallments = (propInstallments ?? []).filter((i) => i.status !== "voided");
const pendingBalanceCents =
  isPremierProperty && activeInstallments.length > 0
    ? activeInstallments
        .filter((i) => i.status !== "paid")
        .reduce((sum, i) => sum + (Number(i.amountCents) || 0), 0)
    : balance.pendingBalanceCents;
```

Con esto, la tarjeta y el tile (que suma `row.pendingBalanceCents`, `:225-228`) pasan a
$320 a la vez; no hay que tocar el tile ni el componente.

- No toca el webhook, la factura de saldo, `premier-installments.ts` ni
  `resolvePropertyPlanBalance` (no hay que cambiar la firma).
- Cuando estén todas pagadas: `pendingBalanceCents = 0`. `PropertyBalanceSummary` se
  sigue mostrando, porque la condición de salida `:61` exige `pendingBalanceCents <= 0`
  **y** que no haya cuotas, así que la lista de cuotas sigue visible y dirá "Pending
  balance: $0.00". Es aceptable; si se quiere "Balance paid in full" para Premier,
  sería un cambio aparte en el componente.
- Diferencia menor que hay que aceptar o igualar: la página **no** filtra
  `voided` al pintar la lista (`:138-148`); el filtro de arriba sí los excluye del
  cálculo, igual que el Sales Report.

*Alternativa (más limpia pero no mínima):* mover la regla "Premier con cuotas → suma
de las no pagadas" a una función compartida en `property-plan-balance.ts` y que la usen
las dos pantallas. Toca dos archivos y el Sales Report, que ahora mismo está bien, así que
no la recomiendo como primer paso.

### Pantallas que dependen de este cálculo / riesgo de rotura

| Pantalla / módulo | ¿Afectado por el cambio mínimo? |
|---|---|
| `/dashboard/payments`, tile "Pending" (`page.tsx:225-231`) | Sí, de forma intencionada: pasa a $320. |
| `/dashboard/payments`, tarjetas "Plan Balances" (`page.tsx:333-359`) | Sí, de forma intencionada. |
| Sales Report (`src/lib/property-payment-summary.ts` vía `src/app/api/admin/reports/route.ts:54`) | No: archivo distinto y ya correcto. Tras el cambio ambos coincidirán. |
| `resolvePropertyPlanBalance` (`src/lib/property-plan-balance.ts`) | No se modifica. |
| Factura de saldo / `generateBalanceInvoice` (`src/lib/balance-invoice.ts`), webhook, cron de cuotas | No se tocan. |

**Mismo bug latente en otra pantalla (fuera del alcance mínimo, solo aviso):**
`/dashboard/services` → `OwnerPlanPortfolioBreakdown`
(`src/components/dashboard/owner-plan-portfolio-breakdown.tsx:69, 131-138`) con
`isPremier` (`src/app/(dashboard)/dashboard/services/page.tsx:991-998`) calcula su propio
`computeBalanceCents` y pasa las cuotas solo para mostrarlas. Esa tarjeta también
seguirá diciendo "Pending balance: $640.00" para esta propiedad. No usa
`resolvePropertyPlanBalance` ni comparte código con `payments/page.tsx`, así que el
cambio mínimo **no la rompe ni la arregla**. Si se quiere coherencia total, habría que
aplicar ahí la misma regla, en el mismo componente, solo cuando `isPremier`.
