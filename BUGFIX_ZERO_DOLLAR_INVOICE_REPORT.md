# Bugfix: factura de saldo pendiente generada en $0 (pagada automáticamente)

## Causa raíz

`createAndSendStripeInvoice` (`src/lib/balance-invoice.ts`) hacía esto:

1. `stripe.invoiceItems.create({ customer, amount, ... })`, **sin** `invoice`. Esto
   crea un InvoiceItem **pendiente** en el customer.
2. `stripe.invoices.create({ customer, ... })`, **sin** `pending_invoice_items_behavior`.
3. `finalizeInvoice` y luego `sendInvoice`.

El SDK está fijado a `apiVersion: "2026-03-25.dahlia"` (`src/lib/stripe.ts`).
**Desde la versión de API 2022-08-01, `pending_invoice_items_behavior` vale
`"exclude"` por defecto** en `invoices.create`. Por eso la Invoice nueva nunca
tomaba el InvoiceItem pendiente:

- La Invoice se finalizaba con 0 líneas, Subtotal $0 y Total $0.
- Stripe marca automáticamente como `paid` una invoice finalizada en $0.
- Se disparaba `invoice.payment_succeeded` con `amount_paid = 0`. El webhook
  ponía la propiedad en `balance_invoice_status = "paid"` e insertaba una fila
  fantasma `payments` (`plan_balance`, $0, `completed`).
- El InvoiceItem real (por ejemplo, 30500 cents) quedaba **huérfano y pendiente**
  en el customer. Por eso el log `[balance-invoice-diag]` sí mostraba el
  InvoiceItem correcto.

Revisé los otros puntos que pediste:

- **Customer:** era el mismo en ambas llamadas. Las dos usan
  `params.stripeCustomerId`, así que no era la causa.
- **Orden/timing:** el orden era correcto. El problema no era una condición de
  carrera, sino el comportamiento por defecto `exclude`.
- **Instalments de Premier Tier:** **tenían exactamente el mismo bug.**
  `src/app/api/cron/process-installments/route.ts` usa el mismo
  `createAndSendStripeInvoice`, así que cualquier instalment facturado también
  salió en $0 y quedó "paid". El fix lo cubre automáticamente porque el helper
  es compartido.

## Qué cambié

### 1. `src/lib/balance-invoice.ts`: el fix de raíz

- **Nuevo orden:** se crea primero la Invoice en draft, con
  `pending_invoice_items_behavior: "exclude"` explícito. Después se crea el
  InvoiceItem **adjunto directamente** con `invoice: invoice.id`. Ya no depende
  de items pendientes.
- **Red de seguridad antes de finalizar:** se recupera el draft. Si
  `total <= 0`, se **borra el draft** y se lanza un error. Nunca se vuelve a
  finalizar una invoice de $0 (que Stripe marcaría como pagada). Queda el log
  `[balance-invoice-diag] CRITICAL`.
- **Limpieza de huérfanos:** antes de crear la invoice, se borran los
  InvoiceItems *pendientes* del customer que coinciden exactamente en
  `kind` + `property_id` (+ `installment_id` en Premier). Así se elimina el item
  huérfano que dejó el bug. Si no se borraba, una factura futura que sí incluya
  pendientes, como la renovación de una suscripción Elite, se lo cobraría al
  cliente. No toca ningún otro item pendiente.
- **`generateBalanceInvoice(propertyId, { regenerate })`:**
  - Si la propiedad ya tiene `balance_invoice_id`, se consulta esa invoice en
    Stripe. Si fue **pagada con dinero real** (`amount_paid > 0`), se rechaza
    volver a facturar, tanto en modo normal como en regenerate. Antes, una
    propiedad con status `paid` sí podía facturarse otra vez desde el endpoint
    manual.
  - `regenerate: true` se salta el guard de idempotencia. Anula (void) la
    invoice anterior si está `open`/`uncollectible` o la borra si es `draft`.
    Una invoice `paid` de $0, como la fantasma, se ignora: no se puede ni hace
    falta anularla.
  - Al guardar la nueva invoice también se limpia `balance_invoice_paid_at`.
- Se extrajeron los helpers `getPropertyPlanName` / `isPremierTierPlan`, que
  ahora comparten "Tenant signed lease" y "Regenerate".

### 2. Webhook: `src/app/api/stripe/webhook/route.ts`

En `invoice.payment_succeeded`, si `metadata.kind` es `plan_balance` o
`plan_installment` y `amount_paid` o `total` es 0:
**no** se inserta la fila en `payments`, **no** se marca la propiedad ni el
instalment como pagado, y se registra
`[balance-invoice-diag] CRITICAL: $0 plan invoice reported as paid` con el
invoice ID, el kind, el property ID y el installment ID.

Además, la fila `plan_balance` ahora guarda `property_id`. Antes quedaba en
null, y por eso cuesta identificar la fila fantasma (ver punto 4).

### 3. Regenerar la factura desde /admin

- `POST /api/admin/properties/[id]/balance-invoice` acepta el body
  `{ "regenerate": true }`. Exige `tenant_lease_signed_at` y rechaza Premier
  Tier, que se cobra en instalments. Después llama
  `generateBalanceInvoice(..., { regenerate: true })` y envía al dueño el mismo
  correo "balance invoice available" que envía "Tenant signed lease". Sin el
  flag, el endpoint se comporta igual que antes.
- `src/components/admin/property-detail-modal.tsx` tiene un botón nuevo:
  **"Resend / Regenerate balance invoice"**. Solo aparece si
  `tenant_lease_signed_at` tiene fecha, pide confirmación y muestra el
  resultado o el error.
- `src/app/api/admin/properties/[id]/tenant-signed-lease/route.ts` ahora usa los
  helpers compartidos. El comportamiento no cambia.

### 4. Refunds: link directo a Stripe

- Nuevo archivo `src/lib/stripe-dashboard.ts`. Tiene la **única** constante
  `STRIPE_DASHBOARD_BASE_URL = "https://dashboard.stripe.com/test"`.
  **Al pasar a producción, cambia solo esa línea** a
  `"https://dashboard.stripe.com"`. Su helper `stripeDashboardPaymentUrl(row)`
  arma el link así:
  - con `stripe_payment_intent_id`: `/payments/{pi_…}`
  - si no, con `stripe_session_id` que empieza por `in_` (filas
    `plan_balance`/`plan_installment`, que no guardan PaymentIntent):
    `/invoices/{in_…}`
  - en cualquier otro caso: búsqueda del Dashboard por el ID.
- **Correo de solicitud de refund** (`src/app/api/dashboard/refund-request/route.ts`):
  tiene una fila "Stripe payment" con el link, un botón "View payment in
  Stripe →" y el link también en el texto de instrucciones.
- **Panel interno:** no existe en /admin un panel de "solicitudes de refund",
  porque las solicitudes solo llegan por correo. En el lugar donde el
  comercial procesa el refund, `/admin/payments`, cada fila ahora tiene un
  botón **"Stripe ↗"** que usa el mismo helper (`/api/admin/payments` ahora
  devuelve también `stripe_session_id`).
- Extra: ya no se puede solicitar refund de un pago de $0. Se ocultó el botón
  en Payment History y el endpoint responde 400.

## Pasos para volver a probar (14 Edward St, Richmond)

> Requiere el deploy con estos cambios. Haz los pasos en orden.

**1. Localiza la fila fantasma y la invoice rota en Supabase (SQL editor):**

```sql
select pay.id, pay.user_id, pay.amount, pay.payment_type, pay.status,
       pay.stripe_session_id, pay.created_at,
       pr.id as property_id, pr.balance_invoice_id, pr.balance_invoice_status
from payments pay
join properties pr on pr.owner_id = pay.user_id
where pr.address ilike '14 Edward%'
  and pr.city ilike 'Richmond%'
  and pay.payment_type = 'plan_balance'
  and pay.amount = 0
  and pay.status = 'completed';
```

Debe salir exactamente una fila, con `stripe_session_id = pr.balance_invoice_id`
(el `in_…` de la factura rota). Esa es la fila fantasma. Anota también el
`balance_invoice_id`.

**2. Borra la fila fantasma:**

```sql
delete from payments pay
using properties pr
where pr.owner_id = pay.user_id
  and pr.address ilike '14 Edward%'
  and pr.city ilike 'Richmond%'
  and pay.payment_type = 'plan_balance'
  and pay.amount = 0
  and pay.status = 'completed'
  and pay.stripe_session_id = pr.balance_invoice_id;
```

(Opcional, solo cosmético: no hace falta para regenerar.)

```sql
update properties
set balance_invoice_status = 'voided', balance_invoice_paid_at = null
where address ilike '14 Edward%' and city ilike 'Richmond%';
```

**3. Stripe Dashboard (modo test): no hace falta anular nada manualmente.**

- La invoice rota está `paid` en $0. Stripe **no permite** anular ni borrar
  una invoice pagada, y tampoco hace falta: `regenerate` la ignora porque
  `amount_paid = 0`. Queda en Stripe como historial inofensivo.
- El InvoiceItem huérfano (el monto real, pendiente en el customer) **se borra
  solo** al regenerar (busca el log `Deleted orphaned pending InvoiceItem`).
  Si prefieres borrarlo a mano antes: Dashboard (test) → Customers → el
  customer del dueño → sección **Pending invoice items** → el item con la
  descripción "Balance for …" → **Delete**.

**4. Regenera:** /admin → Properties → abre 14 Edward St → botón
**"Resend / Regenerate balance invoice"** → confirma.

**5. Verifica:**

- En los logs de Vercel, busca `[balance-invoice-diag]`:
  `Invoice created (draft)`, luego `InvoiceItem created and attached`, luego
  `Draft invoice totals before finalize` con `total` > 0, luego
  `Invoice finalized`.
- En Stripe, la invoice nueva queda en estado **Open**, con 1 línea y el
  monto correcto. No debe quedar en Paid.
- En el modal, el link "Balance invoice" queda en estado `open`. El dueño
  recibe el correo de Stripe y el correo "balance invoice available".
- Paga la invoice con tarjeta de prueba `4242 4242 4242 4242`. Debe aparecer
  una fila `plan_balance` con el monto real y `property_id` en `payments`, y
  la propiedad debe pasar a `paid`.

**6. Prueba el refund:** desde Payment History del cliente, "Request a refund"
sobre esa fila. El correo al comercial trae "View payment in Stripe →", que
abre la invoice en el Dashboard de test. En /admin/payments, el botón
"Stripe ↗" abre el mismo destino.

### Premier Tier: revisa si hay instalments afectados

```sql
select pi.id, pi.property_id, pi.sequence, pi.status, pi.stripe_invoice_id, pay.id as ghost_payment_id
from plan_installments pi
join payments pay on pay.stripe_session_id = pi.stripe_invoice_id
where pay.payment_type = 'plan_installment' and pay.amount = 0;
```

Para cada fila: borra el pago fantasma (`delete from payments where id = '<ghost_payment_id>';`)
y regresa el instalment a la cola del cron:

```sql
update plan_installments
set status = 'scheduled', stripe_invoice_id = null, hosted_invoice_url = null, updated_at = now()
where id = '<id>';
```

El cron lo vuelve a facturar en su próxima corrida, y los items huérfanos del
instalment también se borran solos.

## Archivos cambiados

- `src/lib/balance-invoice.ts`
- `src/lib/stripe-dashboard.ts` (nuevo)
- `src/app/api/stripe/webhook/route.ts`
- `src/app/api/admin/properties/[id]/balance-invoice/route.ts`
- `src/app/api/admin/properties/[id]/tenant-signed-lease/route.ts`
- `src/components/admin/property-detail-modal.tsx`
- `src/app/api/dashboard/refund-request/route.ts`
- `src/app/api/admin/payments/route.ts`
- `src/app/(dashboard)/admin/payments/page.tsx`
- `src/app/(dashboard)/dashboard/payments/page.tsx`

No se ejecutó `npm install` / `npm run build`, según lo solicitado.
