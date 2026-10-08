# Bugfix — Sales Report: tile "Pending & refunded" contradice la tabla por propiedad

## Síntoma

En `/admin/reports` el tile superior mostraba **CA$0 pending**, mientras la tabla
"Payment summary by property" decía **$1,830 pending across 3**. Dos números
contradictorios para lo mismo en la misma pantalla.

## 1. Qué contaba el tile antes

`src/app/(dashboard)/admin/reports/page.tsx`, `stats`:

```ts
const pending = filteredPayments.filter((p) => p.status === "pending");
const pendingAmt = pending.reduce((s, p) => s + Number(p.amount), 0);
```

O sea: la suma de `amount` de las filas de la tabla `payments` con
`status = 'pending'`, filtradas por el periodo seleccionado (por defecto 1 año).

Ese número es casi siempre 0 porque **ningún flujo actual crea pagos con
status `pending`**:

- Todas las inserciones en `payments` (checkout no-op, webhook de Stripe:
  plan, add-on, balance, cuotas) escriben `completed`, `failed` o `canceled`.
- El saldo pendiente de un plan no vive en `payments`. Se deriva de
  `monthly_rent × %plan − $200` (`resolvePropertyPlanBalance`), de
  `properties.balance_invoice_status` (factura de saldo) y de `plan_installments`
  (cuotas Premier).
- La única referencia a `pending` es el webhook `customer.subscription.deleted`,
  que pasa a `canceled` filas PYMES que estuvieran en `pending`, y el `DEFAULT
  'pending'` histórico de la columna. Ninguno de los dos genera filas nuevas
  hoy.

El tile medía algo que en la práctica no existe. La tabla, en cambio, mide lo
que el cliente realmente debe.

## 2. Cambio

El tile toma el pendiente de las mismas filas `propertySummary` que la tabla
(salen de `buildPropertyPaymentSummary` → `resolvePropertyPlanBalance`, que
la API `/api/admin/reports` ya devolvía):

```ts
const pendingAmt = propertySummary.reduce((s, row) => s + row.pendingBalance, 0);
const pendingProperties = propertySummary.filter((row) => row.pendingBalance > 0).length;
```

- Reembolsos: **sin cambios**. Siguen siendo pagos `refunded` dentro del
  periodo seleccionado.
- Etiqueta: `Pending & refunded` → **`Pending balance & refunds`**.
  Subtítulo: `pending across N properties (all time) · CA$X refunded`. Se
  indica "(all time)" porque el saldo pendiente es un estado actual: el
  selector de periodo no le aplica, igual que en la tabla.
- Efecto colateral: el CSV "Export" del overview usa `stats.pendingAmt`, así
  que su columna `pending` ahora también coincide con la tabla.

## 3. Riesgo de doble conteo

**Existía en principio y se resuelve sin sumar las dos fuentes.** Si el tile
hubiera hecho `pagos pending + saldo por propiedad`, un saldo ya facturado
podría contarse dos veces si algún día se registrara la factura abierta como
pago `pending` en `payments` (p. ej. al crear la factura de saldo, o una cuota
Premier en curso), porque esa misma cantidad ya está en `pendingBalance` de la
propiedad (la factura abierta aparece como `Invoice open` en la tabla).

Solución: el tile usa **una sola fuente**, el saldo por propiedad. Los pagos
`pending` de `payments` ya no se suman. Hoy no se pierde nada porque no hay
filas de ese tipo. Si en el futuro se agregaran pagos `pending` que no sean
de saldo de plan (p. ej. PYMES), habría que sumarlos aparte excluyendo
`payment_type` `plan_balance` / `plan_installment`.

Dentro de `pendingBalance` tampoco hay solape. Para cada propiedad Premier
con cuotas se usan solo las cuotas no pagadas. Si no, se usa el saldo
calculado, y queda en 0 cuando `balance_invoice_status = 'paid'`. Las dos
ramas son excluyentes.

## 4. Archivos tocados

- `src/app/(dashboard)/admin/reports/page.tsx`: cálculo de `stats.pendingAmt`,
  nuevo `stats.pendingProperties`, dependencia `propertySummary` del
  `useMemo`, y texto del tile.
- `BUGFIX_SALES_REPORT_PENDING_TILE.md`: este informe.

No se tocaron cálculos de cobro, facturas (`balance-invoice.ts`),
`property-plan-balance.ts`, `property-payment-summary.ts`, la API ni la tabla
por propiedad.

## 5. Antes / después (esta cuenta)

| | Antes | Después |
|---|---|---|
| Título | Pending & refunded | Pending balance & refunds |
| Valor | **CA$0** | **CA$1,830** |
| Subtítulo | `pending · CA$X refunded` | `pending across 3 properties (all time) · CA$X refunded` |
| Tabla por propiedad | $1,830 pending across 3 | sin cambios |

(CA$X = reembolsos del periodo, igual que antes.)

Nota: el texto de la tabla suma solo las filas visibles con la búsqueda y el
filtro de estado aplicados. El tile suma siempre todas las propiedades. Con
los filtros por defecto (sin búsqueda, estado "All") los dos coinciden.

## Verificación

No se hizo verificación local, como se pidió. Los valores del "Después" se
deducen del código: el tile suma los mismos `pendingBalance` que la tabla, que
hoy muestra $1,830 en 3 propiedades.
