# Bugfix: etiquetas de cuotas y saldos en "All Payments"

Antecedentes: `INVESTIGATION_PAYMENT_HISTORY_PENDING.md` y
`BUGFIX_PAYMENT_HISTORY_PREMIER_PENDING.md`.

**Problema.** En `/dashboard/payments`, tabla "All Payments", hay filas sin `service_id` ni
`pymes_plan_id` pero con `property_id`. Todas se mostraban como
"Elite maintenance — <dirección>", sin mirar `payment_type`. Los pagos de cuota Premier
(`plan_installment`) y de saldo (`plan_balance`) se guardan sin `service_id`, así que
aparecían con esa etiqueta.

Es un cambio solo de presentación. No cambian montos, estados ni el pendiente.

---

## Archivos y líneas cambiados

Solo un archivo: `src/app/(dashboard)/dashboard/payments/page.tsx`.

| Líneas | Cambio |
|---|---|
| 37-46 | Nueva función `shortPlanName()`. Convierte el nombre del servicio en un nombre corto: "Plan: Owner Preferred — Support Tier" → "Support Tier"; también "Premier Tier", "Low Price" y "Founder Package". Si no reconoce el plan, quita el prefijo "Plan: ". |
| 132-135 | Nuevo mapa `installmentByInvoiceId` (id de factura Stripe → `{ sequence, total }`). |
| 148 | La consulta de `plan_installments` añade la columna `stripe_invoice_id`. La tabla ya tiene permiso SELECT para usuarios autenticados (migración v66). |
| 163-169 | Rellena `installmentByInvoiceId`. `total` (M) es el número de cuotas no `voided` de esa propiedad. |
| 248-251 | Nuevo mapa `planNameByProperty`, construido con `shortPlanName(row.planName)` de las filas de "Plan Balances". |
| 485-506 | Nueva etiqueta "Service / Plan" (detalle abajo). |
| 522-526 | La columna "Installment" muestra "N of M" para las cuotas Premier encontradas. |

### Cómo se elige la etiqueta "Service / Plan"
Las reglas se aplican en este orden:
1. Si la fila tiene servicio, se usa `services.name`. Así se ven los pagos iniciales: "Plan: …", **sin cambios**.
2. Si tiene plan PYME, se usa `pymes_plans.name`, **sin cambios**.
3. Si `payment_type === "plan_installment"`:
   - Se cruza `payments.stripe_session_id` con `plan_installments.stripe_invoice_id`.
     Si hay coincidencia: **"Premier Tier installment N of M — <dirección>, <ciudad>"**.
   - Si no la hay: **"Premier Tier installment — <dirección>, <ciudad>"**.
4. Si `payment_type === "plan_balance"`:
   - Si se conoce el plan: **"<Plan> balance — <dirección>, <ciudad>"**.
   - Si no: **"Plan balance — <dirección>, <ciudad>"**.
5. Cualquier otra fila mantiene el comportamiento anterior: "Elite maintenance — <dirección>"
   si tiene propiedad, o "—" si no.

En los casos 3 y 4, si la propiedad no aparece en la consulta de direcciones, se omite el
sufijo " — dirección" y la etiqueta no termina en un guion suelto.

**Sobre el nombre del plan del saldo.** Sale de la misma fila de "Plan Balances" de esa
propiedad (`row.planName`), en su forma corta. La tarjeta muestra el nombre largo
("Plan: Owner Preferred — Support Tier — balance"); aquí se usa "Support Tier balance",
como pediste. Una fila `plan_balance` solo existe cuando el saldo ya se pagó
(`balance_invoice_status = "paid"`). En ese caso `resolvePropertyPlanBalance` no aplica la
regla de cambio de plan, así que el nombre es el del plan propio de la propiedad. Si la
propiedad no tiene fila en "Plan Balances" (sin pago de plan, o plan Elite), se muestra
"Plan balance — …".

---

## Texto esperado por fila de ejemplo

No tengo acceso a los datos, así que el plan de Langley y Coquitlam lo indico como regla.

| Fila | "Service / Plan" | "Type" | "Installment" |
|---|---|---|---|
| Washington, cuota 1 ($320) | **Premier Tier installment 1 of 3 — 111 Washington St, <ciudad>** | Plan installment | **1 of 3** |
| Langley, saldo | **<Plan de esa propiedad> balance — <dirección>, Langley**, p. ej. "Low Price balance — …" o "Support Tier balance — …" | Plan balance | — |
| Coquitlam, saldo | **<Plan de esa propiedad> balance — <dirección>, Coquitlam** | Plan balance | — |

Washington tiene 3 cuotas porque es la propiedad #2 de Premier (50/30/20). Si la cuota
llegara a pagarse sin que `stripe_invoice_id` coincida, se verá
"Premier Tier installment — 111 Washington St, <ciudad>" y "—" en "Installment".

---

## Qué queda igual

- Pagos iniciales ("Plan: …"), pagos PYME, add-ons y cualquier fila con `service_id`.
- Las filas `elite_maintenance` siguen mostrando "Elite maintenance — <dirección>".
- Montos, estados, columna "Type", tiles, "Plan Balances", el cálculo del pendiente, el
  webhook, las facturas, `premier-installments.ts`, `resolvePropertyPlanBalance` y el
  Sales Report.
- El botón "Request refund" no se ha tocado. Recibe `serviceName` como texto del modal y
  del email (`page.tsx:538`), así que en esas filas ahora llevará la etiqueta correcta en
  vez de "Elite maintenance".
- **Caso límite que conviene que decidas.** Una cancelación de una suscripción Elite se
  guarda con `payment_type: "subscription_canceled"` y con `property_id`
  (`webhook/route.ts:723-738`). Según la regla 5 ("mantener el comportamiento anterior"),
  sigue mostrando "Elite maintenance — <dirección>". En este caso es correcto, porque es
  la cancelación del mantenimiento Elite, pero no es `payment_type === "elite_maintenance"`.
  Si quieres que esa etiqueta sea exclusiva de `elite_maintenance`, hay que decidir qué
  texto mostrar para la cancelación.
- No se ha ejecutado npm install, build, lint ni tsc.

### El mismo texto en otros sitios (solo reporte)
- `page.tsx:290-297` ("Active installment plans") tiene la misma suposición "Elite
  maintenance — …". Solo se aplica a filas con `stripe_subscription_id`; las cuotas y los
  saldos nunca lo tienen. No se ha cambiado.
- El Sales Report y el admin **no** usan el texto "Elite maintenance". El Sales Report
  clasifica `plan_balance` y `plan_installment` como `balancePaid`
  (`src/lib/property-payment-summary.ts:110, 239-240`), y el mantenimiento Elite cae en
  `otherPaid` (comentario en `:36`).

---

## Solo reporte: ¿se siguen creando pagos `elite_maintenance`?

**Sí.** El "mantenimiento Elite" no es un servicio del catálogo ni un add-on. No existe
ninguna fila en `services` con ese nombre, y por eso no aparece en "Other Available
Services". Es una **suscripción mensual automática que se crea al comprar un plan Elite**
para una propiedad. El flujo sigue activo:

1. **Checkout:** `src/app/api/stripe/checkout/route.ts:192-220`. Si la propiedad tiene
   `elite_tier` asignado y el servicio comprado es el de ese tier
   (`ELITE_SUB_TIERS[...].dbServiceName`), se guarda `elite_tier` en la metadata (`:412`).
   El texto legal del checkout menciona el cargo mensual (`:241`).
2. **Webhook `checkout.session.completed`:** `src/app/api/stripe/webhook/route.ts:346-397`.
   Crea la suscripción de Stripe "Elite <tier> — Monthly Maintenance Fee" con
   `metadata.kind: "elite_maintenance"` (`:391`).
3. **Webhook `invoice.payment_succeeded`:** `webhook/route.ts:581-600`. Cada mes inserta un
   pago con `payment_type: "elite_maintenance"`, `property_id` y sin `service_id`
   (`:591`).
4. **Webhook `invoice.payment_failed`:** `webhook/route.ts:807-820`. Inserta un pago
   fallido con `payment_type: "elite_maintenance"` (`:818`).
5. **Webhook de cancelación:** `webhook/route.ts:723-738`. Inserta un pago
   `subscription_canceled` con el `property_id` de la suscripción Elite.

**Importes y textos:** `src/lib/constants.ts:319-402` (`ELITE_SUB_TIERS`: `monthlyFee`
200/200/300, y Below Portfolio Minimum 200, con sus `feeDescription`).

**Interfaz:**
- `src/components/dashboard/elite-portfolio-breakdown.tsx:100, 158` ("Monthly maintenance").
- `src/app/(dashboard)/dashboard/page.tsx:543`.

**Otras referencias:** `src/lib/payment-lookup.ts:87` (comentario: excluye
`elite_maintenance` de "ya comprado").

**Conclusión.** Mientras se puedan comprar los planes Elite (Essentials, Signature, Lujo,
Below Portfolio Minimum) para una propiedad con `elite_tier` asignado, se seguirán creando
pagos `elite_maintenance`. Por eso hay que conservar la etiqueta "Elite maintenance — …"
para ese tipo.
