# Bugfix: grants de plan_installments, reprogramar cuotas y estado de planes

Rama: `fix/auth-dashboard`. Nada está commiteado ni aplicado: los cambios están en el working tree y la migración está solo como archivo.

**No verificado localmente.** No se corrió build, lint ni type-check (regla del proyecto, y este entorno no tiene Node instalado). Todo fue revisado leyendo el código; el primer deploy de Vercel es la primera compilación real.

## Tres cosas que debes saber antes de revisar

1. **La migración se llama `migration_v66_...`, no `v64`.** Ya existen `migration_v64_premier_tier_description_fix.sql` y `migration_v65_priority_listing_addon_service.sql`, así que usé el siguiente número libre: `supabase/migration_v66_plan_installments_grants.sql`.
2. **La migración otorga más que INSERT.** `migration_v63` no tiene ningún `GRANT`, así que agregué también `SELECT`, `UPDATE` y `DELETE` para `service_role`, y `SELECT` para `authenticated`. El bloque es idempotente: solo otorga lo que falte. Detalle en el punto 1.
3. **Encontré un bug de facturación que NO corregí** (no estaba en el alcance): el add-on de $100 de Priority Listing se descuenta del saldo pendiente como si fuera parte del upfront. Detalle al final, en "Hallazgo fuera de alcance".

## Orden de aplicación

1. **Corre la migración v66 en Supabase SQL Editor.** Puede ir antes del deploy: son solo grants, no depende del código nuevo, y arregla de inmediato el webhook que ya está en producción (los próximos pagos de upfront Premier guardarán sus cuotas).
2. Confirma que el último SELECT de la migración devuelve 5 filas con `is_present = true`.
3. Haz commit, push y espera el deploy en Vercel.
4. En Admin → Properties, abre Washington St y usa **"Reschedule installments"**. Este paso necesita los pasos 1 y 3: el endpoint es código nuevo y usa el grant de `DELETE`.

Si haces el deploy antes de la migración no se rompe nada nuevo, pero el botón fallará con el mismo `42501` hasta que la corras.

---

## 1. GRANT faltante en plan_installments

**Archivo:** `supabase/migration_v66_plan_installments_grants.sql` (nuevo).

**Causa confirmada en el código:** `migration_v63_plan_installments.sql` crea la tabla, activa RLS y agrega dos políticas de SELECT, pero no contiene ningún `GRANT`. No pude consultar la base desde aquí, así que el estado real de cada privilegio lo dirá el primer SELECT de la migración.

Privilegios incluidos y qué código los necesita:

| Rol | Privilegio | Quién lo usa |
|---|---|---|
| `service_role` | INSERT | `premier-installments.ts` (webhook y endpoint de reprogramar) |
| `service_role` | SELECT | chequeo de idempotencia, cron `process-installments`, Sales Report, modal admin |
| `service_role` | UPDATE | cron (marca `invoiced`), webhook (marca `paid` / `failed`) |
| `service_role` | DELETE | endpoint nuevo de reprogramar (borra solo cuotas sin facturar) |
| `authenticated` | SELECT | `dashboard/services` y `dashboard/payments` leen las cuotas del dueño con el cliente de cookies |

Sobre `authenticated SELECT`: sin él, aunque las filas existan, el cliente no vería su calendario de cuotas (mismo caso que `payments` en v61). No amplía qué filas se ven; las políticas RLS de v63 siguen limitando al dueño de la propiedad y al staff interno. Si prefieres no otorgarlo, borra esa línea de los tres bloques `VALUES`.

**Contenido completo de la migración:**

```sql
-- ============================================================
-- WebMarketing v66 — plan_installments grants
-- (service_role CRUD + authenticated SELECT)
--
-- BUG — Premier Tier installment schedule is never saved.
--
-- Root cause (confirmed in Vercel logs while paying the $200 upfront
-- of a Premier Tier property):
--
--   code: '42501'
--   message: 'permission denied for table plan_installments'
--   hint: 'GRANT INSERT ON public.plan_installments TO service_role;'
--
-- migration_v63_plan_installments.sql created the table, enabled RLS
-- and added two SELECT policies, but never issued a single GRANT. In
-- this project a table GRANT is required before RLS is even evaluated
-- (same class of bug as migration_v44 / v46 / v61), and service_role —
-- although it bypasses RLS — still needs the base table privilege.
--
-- Every code path that touches plan_installments, and the privilege
-- each one needs:
--
--   service_role INSERT
--     - src/lib/premier-installments.ts (schedule insert, called from
--       the Stripe webhook's checkout.session.completed handler and
--       from the admin "Reschedule installments" endpoint)
--   service_role SELECT
--     - src/lib/premier-installments.ts (idempotency check)
--     - src/app/api/cron/process-installments/route.ts (due rows)
--     - src/lib/property-payment-summary.ts (Sales Report)
--     - src/app/api/admin/properties/[id]/route.ts (admin modal)
--   service_role UPDATE
--     - src/app/api/cron/process-installments/route.ts
--       (status -> 'invoiced', stripe_invoice_id, hosted_invoice_url)
--     - src/app/api/stripe/webhook/route.ts
--       (invoice.payment_succeeded -> 'paid', payment_failed -> 'failed')
--   service_role DELETE
--     - src/app/api/admin/properties/[id]/reschedule-installments/route.ts
--       (removes not-yet-invoiced 'scheduled' rows before re-inserting;
--       rows with an invoice or payment are never deleted)
--   authenticated SELECT
--     - src/app/(dashboard)/dashboard/services/page.tsx
--     - src/app/(dashboard)/dashboard/payments/page.tsx
--       Both read the owner's own installments with the cookie-context
--       client, scoped by v63's "Owners can view own plan_installments"
--       RLS policy. Without this grant the query fails with the same
--       42501 and the owner never sees their installment schedule even
--       once the rows exist. RLS still limits rows to the owner's own
--       properties (and to internal staff) — this grant does not widen
--       row visibility.
--
-- Only INSERT is confirmed missing by the production error; the other
-- privileges are checked individually below and granted only if absent.
--
-- Idempotent pre/post verification pattern per
-- migration_v61_payments_promotions_grants.sql. Safe to re-run.
-- ============================================================

-- Pre-grant verification: one row per privilege required by the
-- checked-in code. is_present = false identifies a missing grant.
WITH required_grants(grantee, table_name, privilege_type) AS (
  VALUES
    ('service_role', 'plan_installments', 'SELECT'),
    ('service_role', 'plan_installments', 'INSERT'),
    ('service_role', 'plan_installments', 'UPDATE'),
    ('service_role', 'plan_installments', 'DELETE'),
    ('authenticated', 'plan_installments', 'SELECT')
)
SELECT
  required_grants.grantee,
  required_grants.table_name,
  required_grants.privilege_type,
  (role_table_grants.privilege_type IS NOT NULL) AS is_present
FROM required_grants
LEFT JOIN information_schema.role_table_grants AS role_table_grants
  ON role_table_grants.table_schema = 'public'
 AND role_table_grants.table_name = required_grants.table_name
 AND role_table_grants.grantee = required_grants.grantee
 AND role_table_grants.privilege_type = required_grants.privilege_type
ORDER BY required_grants.table_name, required_grants.grantee, required_grants.privilege_type;

-- Add only privileges that the pre-grant information_schema check shows are
-- absent. Re-running the migration does not broaden or duplicate grants.
DO $migration$
DECLARE
  required_grant record;
BEGIN
  FOR required_grant IN
    SELECT *
    FROM (VALUES
      ('service_role', 'plan_installments', 'SELECT'),
      ('service_role', 'plan_installments', 'INSERT'),
      ('service_role', 'plan_installments', 'UPDATE'),
      ('service_role', 'plan_installments', 'DELETE'),
      ('authenticated', 'plan_installments', 'SELECT')
    ) AS grants_needed(grantee, table_name, privilege_type)
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM information_schema.role_table_grants
      WHERE table_schema = 'public'
        AND table_name = required_grant.table_name
        AND grantee = required_grant.grantee
        AND privilege_type = required_grant.privilege_type
    ) THEN
      EXECUTE format(
        'GRANT %s ON TABLE public.%I TO %I',
        required_grant.privilege_type,
        required_grant.table_name,
        required_grant.grantee
      );
    END IF;
  END LOOP;
END
$migration$;

-- Post-grant verification: all five rows should report is_present = true.
WITH required_grants(grantee, table_name, privilege_type) AS (
  VALUES
    ('service_role', 'plan_installments', 'SELECT'),
    ('service_role', 'plan_installments', 'INSERT'),
    ('service_role', 'plan_installments', 'UPDATE'),
    ('service_role', 'plan_installments', 'DELETE'),
    ('authenticated', 'plan_installments', 'SELECT')
)
SELECT
  required_grants.grantee,
  required_grants.table_name,
  required_grants.privilege_type,
  (role_table_grants.privilege_type IS NOT NULL) AS is_present
FROM required_grants
LEFT JOIN information_schema.role_table_grants AS role_table_grants
  ON role_table_grants.table_schema = 'public'
 AND role_table_grants.table_name = required_grants.table_name
 AND role_table_grants.grantee = required_grants.grantee
 AND role_table_grants.privilege_type = required_grants.privilege_type
ORDER BY required_grants.table_name, required_grants.grantee, required_grants.privilege_type;
```

---

## 2. Botón "Reschedule installments" (admin)

**Archivos:**

- `src/lib/premier-installments.ts` (reescrito)
- `src/app/api/admin/properties/[id]/reschedule-installments/route.ts` (nuevo)
- `src/app/api/admin/properties/[id]/route.ts`
- `src/components/admin/property-detail-modal.tsx`

**Qué distingue a un plan con cuotas.** No existe una columna ni flag en `properties`; `service_tier` es solo el grupo por cantidad de propiedades. El plan real de una propiedad es el servicio del pago de plan completado más reciente con ese `property_id`, y es Premier si el nombre contiene "preferred" y "premier". Es la misma regla que ya usan `getPropertyPlanName()` e `isPremierTierPlan()` en `balance-invoice.ts`, y la reutilicé.

**Cambios en `premier-installments.ts`:**

- El cálculo del calendario (rank, porcentaje, montos, fechas) quedó en una sola función interna, `computePremierSchedule`, que usan tanto el webhook como el botón. No hay dos copias de la lógica.
- `schedulePremierInstallments` (la del webhook) conserva su firma y comportamiento, y ahora devuelve un resultado en vez de `void`. Además deja de ignorar el error del SELECT de idempotencia: antes un fallo de lectura se trataba como "no hay cuotas".
- Nueva `reschedulePremierInstallments(propertyId)`:
  - Rechaza con 400 y mensaje claro si el plan activo no es Premier Tier, si no hay pago de upfront Premier, o si la propiedad está fuera de las 3 primeras del dueño.
  - Fecha base: `created_at` del pago de upfront Premier más antiguo de esa propiedad, no la fecha de hoy.
  - Rank: mismo orden que el webhook (propiedades del dueño por `created_at`).
  - Borra solo filas con `status = 'scheduled'` y sin `stripe_invoice_id`. El DELETE repite esa condición, así que una fila que el cron facture en ese instante no se borra.
  - Filas `invoiced`, `paid`, `failed`, o con factura asociada, nunca se tocan, y su número de secuencia no se vuelve a insertar.
  - Devuelve `created` (secuencia, fecha, porcentaje, monto), `kept`, `deletedCount`, `rank` y `upfrontPaidAt`.
- Logs con prefijo `[premier-installments]` en cada paso: solicitud, plan resuelto, filas existentes, resultado y cualquier rechazo.

**Endpoint:** `POST /api/admin/properties/[id]/reschedule-installments`. Mismos roles que "Regenerate balance invoice" (`admin`, `marketing`, `sales`).

**Modal:** `GET /api/admin/properties/[id]` ahora devuelve `purchased_plan_name`, `uses_installments` e `installments`. El modal muestra la lista de cuotas (o "None scheduled") y el botón solo cuando `uses_installments` es true, es decir solo Premier Tier. No aparece en Low Price, Founders, Support Tier ni Elite. Tras ejecutar, muestra cuántas cuotas se crearon y sus montos.

**A tener en cuenta:** si el upfront se pagó hace más de un mes, alguna cuota quedará con fecha de vencimiento pasada y el cron diario la facturará en su siguiente corrida. Es el comportamiento correcto según el calendario original, pero conviene saberlo antes de pulsar el botón.

---

## 3. "Ya pagado" en Support Tier y Premier Tier

**Archivos:**

- `src/lib/payment-lookup.ts`
- `src/components/dashboard/owner-plan-portfolio-breakdown.tsx`
- `src/app/(dashboard)/dashboard/services/page.tsx`

**Causa.** No hay un componente separado para Premier: `owner-plan-portfolio-breakdown.tsx` renderiza las tarjetas por propiedad de ambos planes (prop `isPremier`). Calculaba "ya pagado" solo contra el servicio de la propia tarjeta. Al agregar una segunda propiedad el dueño pasa al tier `preferred_owners`, y Coquitlam, pagada bajo Low Price, no coincidía con el servicio de Support ni de Premier, así que volvía a ofrecer los $200.

**Cambio.** En `payment-lookup.ts` agregué `buildOwnerPlanServiceRefs()` y `getPaidPlanForProperty()`: la misma idea de `getBasicTierPlanStatus`, generalizada a los cuatro planes de dueño (Low Price, Founders, Support, Premier) y usando el mismo set `paidServiceKeys`, sin consultas extra. `getBasicTierPlanStatus` no se modificó.

En cada tarjeta por propiedad ahora hay tres estados:

- Pagada bajo el plan de la tarjeta: igual que antes ("Deposit paid ✓" y resumen de saldo).
- Pagada bajo otro plan: etiqueta "Paid — Low Price", texto de que ya está cubierta, y botón "Paid under Low Price ✓ — View balance" hacia Payment History. No hay botón de pago. Se oculta el porcentaje y la tarifa total de la tarjeta porque no aplican a esa propiedad.
- Sin pagar: botón de checkout como antes.

Esto también cubre el cruce Support ↔ Premier: una propiedad pagada en Support ya no ofrece pagar otra vez en la tarjeta de Premier.

**Límite conocido (ya existía):** pagos antiguos con `property_id = null` de dueños con 2 o más propiedades no se pueden atribuir a una propiedad, y seguirán apareciendo como no pagados. Está documentado en `payment-lookup.ts`. El bloqueo es solo de interfaz; la ruta de checkout no valida esto en el servidor.

---

## 4. Aviso de fotos requeridas en Low Price

**Archivo:** `src/app/forms/propietario/page.tsx`.

**Causa.** El aviso no está filtrado por plan. En `add-property/page.tsx` se muestra siempre, y en el formulario de registro existía solo en la rama de inversionista. La rama de dueño (paso 5, `!isInvestor`) renderizaba el `ImageUpload` sin aviso, aunque `nextStep()` sí exigía las cinco fotos. Un dueño Low Price tiene una sola propiedad y la carga por esa rama, por eso nunca lo veía.

**Cambio.** Agregué el mismo bloque ámbar, con el texto exacto, encima del `ImageUpload` de esa rama. La validación no cambió.

---

## 5. Priority Listing Placement en el dashboard principal

**Archivos:**

- `src/components/dashboard/priority-listing-card.tsx` (nuevo)
- `src/app/(dashboard)/dashboard/page.tsx`
- `src/app/(dashboard)/dashboard/payments/page.tsx`
- `src/app/(dashboard)/dashboard/services/page.tsx`

**Causa.** En el home, el add-on solo existía como checkbox dentro de la tarjeta de Low Price, y ese checkbox se deja de renderizar en cuanto se paga el upfront. Después de pagar solo quedaba la tarjeta de Payment History.

**Cambio.** Extraje la tarjeta de Payment History a un componente compartido, `PriorityListingCard`, y la uso en ambos sitios, así que inician exactamente el mismo checkout. En el home aparece con las mismas condiciones que en Payment History: roles de Property Owner (no inversionista), servicio activo, y add-on aún no comprado para la primera propiedad del dueño. Está ubicada después de la tarjeta "Your Service Tier".

Ajuste relacionado: si el add-on ya se compró suelto, el checkbox de la tarjeta de Low Price (home y Services) ya no se ofrece, para evitar cobrarlo dos veces.

Como antes, la compra suelta se atribuye siempre a la primera propiedad del dueño.

---

## 6. Sales Report: add-on de Priority Listing por propiedad

**Archivos:**

- `src/lib/property-payment-summary.ts`
- `src/components/admin/property-payment-summary-table.tsx`

**Cómo se guarda el pago.** El add-on es una fila propia en `services` (`Add-on: Priority Listing Placement (1 month)`, categoría `addon`, migración v65). Siempre genera su propia fila en `payments` con el `property_id` de la propiedad, tanto si se compra junto al upfront (el webhook separa el monto con `metadata.addon_service_id`) como suelto. No hay un `payment_type` propio; se identifica por el servicio.

**Cambio.** `buildPropertyPaymentSummary()` sumaba ese pago dentro de `otherPaid`, que no tenía columna en la tabla. Ahora hay un campo `priorityListingPaid` separado:

- Tabla: nueva columna ordenable "Priority listing", entre "Upfront paid" y "Pending balance".
- CSV: nueva columna "Priority listing add-on paid (CAD)"; la anterior "Add-ons & other paid" pasa a llamarse "Other paid" y ya no incluye el add-on.
- `totalPaid` da el mismo total que antes.

---

## Hallazgo fuera de alcance (no corregido)

**El add-on de $100 reduce el saldo pendiente facturado.** `getCompletedUpfrontForProperty()` en `payment-lookup.ts` suma todos los pagos `one_time` completados de la propiedad, y el add-on se guarda con `payment_type = 'one_time'`. Esa suma se resta de la tarifa total en dos sitios:

- `generateBalanceInvoice()` (`balance-invoice.ts`): un dueño Low Price que compró el add-on tiene $300 "ya pagados", y su factura de saldo sale $100 más baja de lo debido.
- `computeNetAmountDueCents()` (`plan-switch.ts`): el cambio a Founders se cobra $100 de menos.

Lo confirmé leyendo el código, no reproduciéndolo. La corrección sería excluir de esa suma los servicios que no son de categoría `plan`. No lo toqué porque cambia montos facturados y no estaba pedido; dime si lo incluyo.

Menor: el botón "Resend / Regenerate balance invoice" del modal sigue apareciendo en propiedades Premier con lease firmado. El servidor lo rechaza con un mensaje claro, así que no causa daño.
