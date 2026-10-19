# Investigación: protección contra cobros dobles por propiedad

Solo diagnóstico. No se ha modificado código ni se ha ejecutado npm install, build, lint ni tsc.

**Regla de negocio (confirmada por el dueño)**
- Una propiedad que ya pagó su plan (upfront) o su saldo completo no se puede volver a cobrar.
- Si un propietario con varias propiedades toma un plan nuevo, solo se cobran las propiedades que aún no han pagado.
- El add-on Priority Listing ($100) es un servicio aparte y no cuenta como pago de plan.

---

## Resumen

1. **Toda la protección del upfront está en la interfaz, no en el servidor.**
   `POST /api/stripe/checkout` no comprueba si la propiedad ya tiene un plan pagado. Las
   páginas ocultan el botón "Pay" cuando ya hay pago (`PaidOrCheckout`), pero no lo
   impiden:
   - una llamada directa a la API,
   - dos pestañas abiertas antes de pagar,
   - una sesión de Stripe vieja que se paga más tarde,
   - un propietario con varias propiedades y pagos antiguos sin `property_id`.
2. **La factura de saldo solo se bloquea preguntando a Stripe por la factura anterior.**
   `generateBalanceInvoice` no mira `balance_invoice_status = "paid"` en la base de datos.
   Si la consulta a Stripe falla, sigue adelante y vuelve a facturar.
3. **El webhook no es idempotente.** No hay restricción única en
   `payments.stripe_session_id` ni registro de eventos ya procesados. Si un evento llega
   dos veces, las cuotas Premier **no** se duplican (tienen su propia protección), pero
   las **suscripciones de Elite y PYME sí se crean dos veces**. Eso significa cobros
   mensuales reales duplicados.
4. **El escenario del punto 5** (propiedad 1 pagada completa bajo Low Price, Premier
   para la 2 y la 3) está protegido en todos los caminos de admin, cron y webhook. Las
   dos excepciones son un fallo puntual de Stripe al regenerar la factura y una compra
   directa por API o por pestaña vieja.

---

## 1. Checkout (`src/app/api/stripe/checkout/route.ts`)

### ¿Comprueba que la propiedad no tenga ya un plan pagado?
**No.** En el caso `"service"` (líneas 156-449):
- Carga el servicio (164-168, sin `category`).
- Si viene `propertyId`, comprueba solo que la propiedad sea del usuario (194-209).
- Calcula el monto y crea la sesión de Stripe (350-427).

En ningún momento consulta `payments`. Cualquier plan (Low Price, Founders, Support,
Premier, Elite) se puede cobrar otra vez sobre una propiedad ya pagada. Tampoco es
obligatorio enviar `propertyId` para un plan: sin él, el pago se guarda con
`property_id = null`.

**Única lógica relacionada: el "netting"** (líneas 249-287), y solo si el cliente envía
`netAgainstExisting: true`. Este flag lo decide el navegador y solo lo envían los botones
de Founders (`dashboard/page.tsx:583`, `services/page.tsx:897, 1035`). El netting:
- Calcula `computeNetAmountDueCents` (`src/lib/plan-switch.ts:42-67`), que resta lo ya
  pagado del total del plan nuevo.
- Usa `getCompletedUpfrontForProperty` (`src/lib/payment-lookup.ts:105-161`), que **solo
  suma** pagos `one_time` / `plan_switch_noop` (línea 114). Los pagos de saldo
  (`plan_balance`) y de cuotas (`plan_installment`) **no cuentan**. Una propiedad con el
  saldo pagado aparece como si solo hubiera pagado $200.
- Si el resultado es 0, guarda una fila `plan_switch_noop` de $0 y no cobra (260-282).

**Dónde está la protección real (solo interfaz):**
- `src/components/dashboard/paid-or-checkout.tsx:51-62`: si `alreadyPaid`, muestra
  "Deposit paid ✓" en lugar del botón.
- `alreadyPaid` lo calcula cada página con `getCompletedPaymentKeysForProperties`
  (`payment-lookup.ts:196-236`) y con:
  - `getBasicTierPlanStatus` (264-276): Low Price o Founders.
  - `getPaidPlanForProperty` (320-327): cualquiera de los 4 planes de propietario, usado
    en `owner-plan-portfolio-breakdown.tsx:73-76`.
- Elite: `elite-portfolio-breakdown.tsx:145`, solo compara el mismo servicio en la misma
  propiedad.

### ¿Y para el saldo?
El saldo **no pasa por checkout**. Solo se cobra con la factura de Stripe que genera
`generateBalanceInvoice` (ver punto 2) o con las cuotas Premier. El cliente no tiene
ningún botón que cree un cobro de saldo; "Pay remaining balance" abre la factura ya
existente (`property-balance-summary.tsx:97-106`).

### ¿Qué pasa con dos llamadas seguidas o dos pestañas?
- **Doble clic en la misma pestaña:** bloqueado. `checkout-button.tsx:44-102` desactiva el
  botón mientras espera (`disabled={loading}`).
- **Dos pestañas, o dos llamadas a la API:** se crean **dos sesiones de Stripe
  independientes** y las dos se pueden pagar. La página se dibujó antes del primer pago,
  así que ambas muestran el botón. No hay bloqueo en el servidor ni `idempotencyKey` en
  `stripe.checkout.sessions.create`.
- **Sesión vieja:** las sesiones de Checkout duran 24 h por defecto (no se fija
  `expires_at`). Una pestaña abandonada se puede pagar después de que otra pestaña ya
  pagó.
- **Resultado:** dos filas `payments` completadas de $200. Si es Premier, las cuotas se
  programan una sola vez (ver punto 3). El cliente pagó $200 de más.

---

## 2. Factura de saldo y cuotas: qué evita una segunda factura

### `generateBalanceInvoice` (`src/lib/balance-invoice.ts:380-661`)
Hay dos defensas:

1. **Protección contra repetición (408-425).** Solo actúa si la factura actual está
   *abierta*: `balance_invoice_id` existe **y** el estado **no** es `"paid"` ni
   `"voided"`. Para una propiedad **pagada** esta protección **no se aplica**, y el código
   sigue.
2. **Consulta de la factura anterior en Stripe (431-456).** Si `balance_invoice_id`
   existe, la recupera de Stripe. Si está `paid` con `amount_paid > 0`, se niega
   ("refusing to bill this property again"). Esto aplica en modo normal y en regenerar.
   **Es la única barrera para una propiedad con el saldo pagado.**
   - Si `stripe.invoices.retrieve` lanza un error (437-443), `previous` queda en `null` y
     **la función continúa y emite una factura nueva**.
   - **No** se comprueba `properties.balance_invoice_status === "paid"` en la base de
     datos.
   - **No** se comprueba si existe una fila `payments` completada de tipo `plan_balance`.

Además:
- El monto es `total del plan − getCompletedUpfrontForProperty` (555-565). Como esa suma
  excluye `plan_balance`, una refacturación cobraría **el saldo completo otra vez**, no
  $0.
- El plan se toma del **último plan pagado por el propietario** (489-508). Esto es
  intencional, según la memoria del proyecto. La consecuencia es que una refacturación de
  la propiedad 1 después de comprar Premier se calcularía al 30%.
- `generateBalanceInvoice` **no comprueba si la propiedad es Premier** ni si tiene cuotas.

**Quién la llama:**

| Llamador | Comprobación de Premier |
|---|---|
| `tenant-signed-lease/route.ts:69-74` | Sí: solo factura si el plan propio de la propiedad no es Premier (`getPropertyPlanName`). Además sale antes si el contrato ya estaba firmado (50-56). |
| `balance-invoice/route.ts:58-67` (`regenerate: true`, botón "Resend / Regenerate balance invoice") | Sí: rechaza Premier (59-64). Exige contrato firmado (52-57). |
| `balance-invoice/route.ts:39-42` (sin `regenerate`) | **No.** Llama a `generateBalanceInvoice` sin comprobar Premier. No hay botón en la interfaz que use esta rama (el modal siempre envía `regenerate: true`, `property-detail-modal.tsx:204-207`), pero cualquier admin, marketing o sales puede llamarla por API. |

### Cuotas (`src/lib/premier-installments.ts`)
- **Cómo se crean las filas de cuotas:**
  - `schedulePremierInstallments` (160-192), desde el webhook. Solo comprueba que no
    existan ya cuotas para la misma **propiedad + servicio** (164-185). **No** comprueba
    si la propiedad ya pagó su saldo, si `balance_invoice_status = "paid"` ni si tiene
    otro plan pagado.
  - `computePremierSchedule` (71-126) calcula `renta × % − $200`
    (`computeBalanceCents`). No tiene en cuenta pagos anteriores de saldo.
  - `reschedulePremierInstallments` (219-360), desde el admin. Exige que el plan **propio
    y más reciente** de la propiedad sea Premier (264-277) y que exista un upfront
    Premier (282-285). Solo borra cuotas `scheduled` sin factura (294-313). No vuelve a
    crear números de cuota ya facturados (343-348).
- **Facturación de cuotas:** `processDueInstallments` (392-600), usada por el cron
  (`api/cron/process-installments/route.ts`) y por el botón "Process due installments"
  (`api/admin/properties/[id]/process-installments/route.ts`).
  - Factura toda fila `scheduled` con fecha vencida (398-402).
  - Usa una reserva atómica (427-447) para que el cron y el botón no facturen la misma
    fila dos veces.
  - **No** vuelve a comprobar el estado de la propiedad: no mira si el saldo está pagado
    ni si el plan sigue siendo Premier.
  - Por eso, **solo factura cuotas de propiedades que tienen filas en `plan_installments`**.
    Una propiedad sin filas nunca recibe cuotas.

**Conclusión:** las cuotas no se generan para una propiedad con el saldo pagado
**siempre que nadie compre Premier sobre esa propiedad**. Si se compra (hueco del punto
1), el webhook programa cuotas completas sin mirar lo ya pagado.

---

## 3. Upfront de Premier duplicado (reintento de Stripe)

### `checkout.session.completed` (`src/app/api/stripe/webhook/route.ts:89-440`)
- **No hay idempotencia por evento ni por sesión.**
  - No se guarda `event.id`.
  - No se busca si ya existe una fila con `stripe_session_id = session.id` antes de
    insertar (130-149).
- **No hay restricción única** en `payments.stripe_session_id`. Solo un índice normal
  (`supabase/migration_v8_stripe.sql:38-39`; tabla en `supabase/migration.sql:301-312`).
  Además, la fila del add-on usa **la misma** `stripe_session_id` (155-167), así que una
  restricción única solo sobre esa columna rompería el add-on.
- **El webhook siempre responde 200**, incluso con errores internos (838-843). Stripe solo
  reintenta si hay un timeout o un error de red, o si alguien lo reenvía a mano desde el
  dashboard de Stripe.
  - El manejador hace muchas llamadas seguidas (Supabase, Stripe y correo). Un timeout es
    posible.
  - Si en Stripe hay **dos endpoints** apuntando a dos deploys con la misma base de datos,
    cada evento se procesa dos veces. Conviene verificarlo en Stripe → Developers →
    Webhooks.

**Qué pasa si el evento llega dos veces:**

| Efecto | ¿Se duplica? | Por qué |
|---|---|---|
| Fila `payments` del upfront | **Sí** | Inserción sin comprobar (130-149). |
| Fila del add-on | **Sí** | 155-167. |
| Cuotas Premier | **No** | `schedulePremierInstallments` ve que ya existen para propiedad + servicio (164-185). Si dos entregas llegan a la vez, `UNIQUE (property_id, service_id, sequence)` (`supabase/migration_v63_plan_installments.sql:41`) hace fallar la segunda inserción. |
| Contador de Founders | **Sí** (+1 extra) | 217-249. |
| **Suscripción mensual Elite** | **Sí: cobro mensual real duplicado** | 356-397, `stripe.subscriptions.create` sin `idempotencyKey`. |
| **Suscripción de cuotas PYME** | **Sí: cobro mensual real duplicado** | 295-345. |
| Correo de recibo | Sí | 414-434. |

Las filas duplicadas del upfront no cobran dinero. Pero inflan "Total Paid" y la suma de
`getCompletedUpfrontForProperty`. Eso hace que el netting y la factura de saldo resten
**de más**: cobran de menos, no de más.

### `invoice.payment_succeeded` (443-640)
Si llega dos veces:
- `plan_balance` (474-518) inserta otra fila `payments`.
- `plan_installment` (525-559) inserta otra fila; volver a marcar la cuota como `paid` no
  hace daño.
- `elite_maintenance` (581-600) inserta otra fila.

Ninguno cobra dinero, pero duplican el historial y el Sales Report. El caso de $0 está
protegido (451-464).

---

## 4. El caso histórico del Founder Package cobrado dos veces

Correcciones, en orden:
1. **`f7c9891` (2026-09-25), "Payment flow overhaul"** (`PROMPT2_PAYMENT_FLOW_REPORT.md`):
   - Item 4: crea `payment-lookup.ts` y `PaidOrCheckout` para ocultar "Pay" cuando ya hay
     pago del mismo plan en la propiedad. Low Price y Founders empiezan a enviar
     `propertyId`.
   - Corrige el netting de Founders, que en la primera compra cobraba el 30% completo en
     vez de $200 (`plan-switch.ts:61-64`; informe, líneas 369-376).
2. **`e975073` (2026-10-02)** (`FOUNDERS_ALREADY_PAID_BANNER_FIX.md`):
   - Antes, pagar Founders dejaba visible "Pay $200" en la tarjeta de Low Price, y al
     revés. Era el cobro duplicado.
   - Se añadió `getBasicTierPlanStatus` (`payment-lookup.ts:238-276`): Low Price y
     Founders comparten el estado "ya pagado" por propiedad.
3. **`42f4296` (2026-10-07):** generaliza la idea a los 4 planes de propietario con
   `buildOwnerPlanServiceRefs` y `getPaidPlanForProperty` (`payment-lookup.ts:278-327`).
   Se usan en las tarjetas Support y Premier (`owner-plan-portfolio-breakdown.tsx:73-76`):
   una propiedad pagada con otro plan muestra "Paid — <plan>" y no ofrece checkout.

**¿Aplica a los demás planes?**
- **Solo en la interfaz.** El propio informe del fix lo advertía
  (`FOUNDERS_ALREADY_PAID_BANNER_FIX.md:100-105`: "No hay protección del lado del
  servidor… un POST directo al endpoint todavía podría crear un cobro duplicado"). Ese
  follow-up **no se implementó**.
- **El banner de Founders no usa la comprobación general.** En `dashboard/page.tsx:570-584`
  y `services/page.tsx:883-899, 1025-1040`, `alreadyPaid = basicPlanStatus.alreadyPaid`
  (solo Low Price o Founders sobre `ownerProperties[0]`). El banner no filtra por tier.
  - Si la propiedad #1 se pagó con **Support o Premier**, aparece "Upgrade to Founders"
    con netting.
  - El netting resta solo los $200 (ignora saldo y cuotas) y cobra `30% × renta − 200`.
    Para Premier, las cuotas siguen además programadas.
- **Elite:** solo compara el mismo servicio en la misma propiedad
  (`elite-portfolio-breakdown.tsx:145`). No detecta otro plan Elite ya pagado en esa
  propiedad.

---

## 5. Escenario: 3 propiedades; la 1 pagada completa con Low Price; Premier para la 2 y la 3

Supuesto: los pagos de la propiedad 1 tienen `property_id` (son posteriores a
`f7c9891`). Lo que pasa con pagos antiguos va al final.

| Camino | ¿Puede cobrar la propiedad 1? | Por qué (código) |
|---|---|---|
| Webhook del upfront Premier de la 2 y la 3 | **No** | Programa cuotas solo para `metadata.property_id` (`webhook/route.ts:259-292`). La 1 no aparece. |
| Cron diario `process-installments` | **No** | Solo factura filas de `plan_installments` (`premier-installments.ts:398-402`). La 1 no tiene. |
| Botón "Process due installments" en la 1 | **No** | Filtra por `propertyId` (403). No hay filas para facturar. |
| Botón "Reschedule installments" en la 1 | **No** (400) | El plan propio más reciente de la 1 es Low Price, así que lo rechaza (`premier-installments.ts:264-277`). El botón solo aparece si `uses_installments` (`api/admin/properties/[id]/route.ts:69`, `property-detail-modal.tsx:390`), y para la 1 es falso. |
| "Mark tenant signed lease" en la 1 | **No** | El contrato ya está firmado y sale antes (`tenant-signed-lease/route.ts:50-56`). |
| "Resend / Regenerate balance invoice" en la 1 | **No, salvo si Stripe falla** | El plan propio es Low Price, así que pasa la comprobación de Premier y llama a `generateBalanceInvoice(regenerate)`. La factura anterior está `paid` con `amount_paid > 0`, así que se niega (`balance-invoice.ts:451-456`). **Si `invoices.retrieve` falla** (437-443), continúa: usaría el último plan del propietario (Premier, 30% por ser la #1), restaría solo $200 y **enviaría una factura nueva de 30% × renta − 200**. |
| API `balance-invoice` sin `regenerate` en la 1 | **No, salvo si Stripe falla** | Igual que la fila anterior. |
| Checkout del cliente desde la interfaz | **No** | Tarjeta Premier de la 1: "Paid — Low Price" (`owner-plan-portfolio-breakdown.tsx:74-76`). Banner de Founders: `basicPlanStatus.alreadyPaid` es verdadero para `ownerProperties[0]`, así que no muestra el botón. |
| Checkout por API directa, o una pestaña abierta antes del primer pago | **Sí** | Sin protección en el servidor (punto 1). Si el plan es Premier, el webhook cobra $200 **y programa cuotas** para la 1 (rango 0: una cuota del `30% × renta − 200`, a +2 meses). |

**Pagos antiguos con `property_id = null`.** Si el Low Price de la propiedad 1 es
anterior a `f7c9891`, la búsqueda de "ya pagado" solo lo atribuye cuando el propietario
tiene **una** propiedad (`payment-lookup.ts:214`). Con 3 propiedades, la 1 aparece **sin
pagar**: la tarjeta Premier muestra "Pay $200" y se puede cobrar desde la interfaz. Es el
hueco conocido descrito en `payment-lookup.ts:99-103` y en el informe PROMPT2, que
requiere un ajuste manual de esos pagos.

---

## 6. Huecos: caminos que todavía pueden cobrar dos veces

| # | Hueco | Gravedad | Dónde |
|---|---|---|---|
| H1 | El checkout no comprueba en el servidor si la propiedad ya tiene un plan pagado. Afecta a llamadas directas, dos pestañas, sesiones viejas (24 h) y propietarios con varias propiedades y pagos antiguos. Si el plan es Premier, además se programan cuotas completas. | **Alta** | `checkout/route.ts:156-427` |
| H2 | El webhook no es idempotente: un evento repetido crea **suscripciones Elite y PYME duplicadas** (cobro mensual doble) y filas `payments` duplicadas. | **Alta** (Elite/PYME), media (filas) | `webhook/route.ts:130-173, 295-345, 356-397`; sin restricción única en `payments` |
| H3 | `generateBalanceInvoice` no comprueba en la base de datos que el saldo ya está pagado. Depende de que Stripe responda; si `invoices.retrieve` falla, vuelve a facturar el saldo completo. | Media | `balance-invoice.ts:408-456` |
| H4 | La API `balance-invoice` sin `regenerate` no rechaza Premier, y `generateBalanceInvoice` tampoco. Una propiedad Premier puede recibir una factura de saldo completo **además** de sus cuotas. Solo por API, sin botón. | Media | `balance-invoice/route.ts:39-42`; `balance-invoice.ts:380+` |
| H5 | El banner "Upgrade to Founders" solo mira Low Price y Founders en `ownerProperties[0]`. Si esa propiedad se pagó con Support o Premier, ofrece el upgrade, y el netting ignora saldo y cuotas pagadas. | Media | `dashboard/page.tsx:577-584`; `services/page.tsx:889-898, 1031-1037`; `payment-lookup.ts:114` |
| H6 | Programar y facturar cuotas no comprueba si la propiedad ya pagó su saldo con otro plan. Es la consecuencia de H1 cuando el plan comprado por duplicado es Premier. | Media (depende de H1) | `premier-installments.ts:160-192, 392-447` |
| H7 | Propietarios con varias propiedades y pagos de plan antiguos (`property_id = null`): la interfaz los muestra sin pagar. | Media (datos antiguos) | `payment-lookup.ts:57-61, 214` |

**Priority Listing:** está bien separado. `getCompletedUpfrontForProperty` descarta los
servicios que no son plan (116-131), `getPaidPlanForProperty` solo mira servicios de plan,
y el Sales Report lo pone en su propia columna. Comprar el add-on no marca la propiedad
como pagada ni resta del plan.

---

## 7. Propuesta de cambio mínimo (sin aplicar)

### P1 → H1: protección en el servidor del checkout
**Dónde:** `checkout/route.ts`, caso `"service"`.
- Añadir `category` al `select` del servicio (165-166).
- Antes de crear la sesión, si `service.category === "plan"`:
  - Si no viene `propertyId` y el usuario es propietario o inversionista, responder 400.
    Los planes deben ir siempre asociados a una propiedad.
  - Con `supabaseAdmin`, buscar pagos `completed` en la propiedad cuyo servicio sea de
    categoría `plan`. Incluir el caso antiguo de una sola propiedad, igual que
    `getCompletedPaymentForPropertyService`. Si existe alguno:
    - **Sin** `netAgainstExisting`: responder **409** "This property already has a paid
      plan".
    - **Con** `netAgainstExisting`: permitirlo **solo** si el servicio pedido es Founders
      y el plan existente es Low Price (el upgrade documentado). En cualquier otro caso,
      409.
- Opcional, para reducir la ventana de las sesiones viejas: `expires_at` a 30 minutos (el
  mínimo de Stripe) en `checkout.sessions.create`.

**Qué podría verse afectado:**
- El upgrade Low Price → Founders sigue funcionando.
- Una recompra después de un **reembolso** sigue permitida (el estado pasa a `refunded`).
- Los inversionistas Elite no pueden recomprar el mismo tier en la misma propiedad. Es lo
  deseado, pero conviene confirmar que no existe el caso "pagar otro tier Elite en la
  misma propiedad".
- PYME (`pymes_upfront`) no cambia.
- Propietarios con pagos antiguos sin `property_id` y varias propiedades: P1 tampoco los
  detecta (ver P7).

### P2 → H2: idempotencia del webhook
1. Al inicio de `checkout.session.completed`: si ya existe una fila `payments` con
   `stripe_session_id = session.id` y `status = "completed"`, salir con `break`. Así se
   salta todo: inserción, contador, cuotas, suscripciones y correo.
2. Lo mismo en `invoice.payment_succeeded` para `plan_balance`, `plan_installment` y
   `elite_maintenance`, buscando con `invoice.id`.
3. Pasar `idempotencyKey` a `stripe.subscriptions.create`: `elite_sub_${session.id}` en
   la línea 380 y `pymes_sub_${session.id}` en la 328. Stripe guarda la clave 24 h y
   cubre las entregas simultáneas.
4. Para entregas concurrentes en la base de datos, migración con un índice único parcial:
   `CREATE UNIQUE INDEX ... ON payments (stripe_session_id, service_id) NULLS NOT DISTINCT WHERE status = 'completed'`.
   - `NULLS NOT DISTINCT` requiere PostgreSQL 15 o superior.
   - El add-on no choca porque tiene otro `service_id`.
   - Los pagos fallidos repetidos (`status = "failed"`) quedan fuera del índice.
   - **Antes de crearlo hay que buscar duplicados existentes**; si los hay, la migración
     falla.

**Qué podría verse afectado:** reenviar a mano un evento desde Stripe ya no repararía
una fila que faltaba si la primera entrega sí la insertó. Es el comportamiento correcto.
Toca el webhook, así que requiere tu aprobación explícita.

### P3 → H3: no volver a facturar un saldo pagado
**Dónde:** `generateBalanceInvoice`, justo después de cargar la propiedad (402).
- Rechazar si existe un pago `payments` **completado**, `payment_type = "plan_balance"`,
  `amount > 0`, en esa propiedad.
- No usar solo `balance_invoice_status === "paid"`: ese estado también puede venir de una
  factura fantasma de $0 de un bug anterior, y el código permite refacturar esos casos
  a propósito. Las facturas de $0 nunca generan fila en `payments` (webhook 451-464).
- Si `stripe.invoices.retrieve` falla (437-443), devolver error (`success: false`) en vez
  de continuar.

**Qué podría verse afectado:** si Stripe no responde, regenerar falla y el admin tiene que
reintentar. Las refacturaciones legítimas (factura anulada, abierta o fantasma de $0)
siguen funcionando.

### P4 → H4: nunca factura de saldo completo para Premier
**Dónde:** en `generateBalanceInvoice`, para que cubra cualquier llamador.
- Rechazar si `isPremierTierPlan(await getPropertyPlanName(propertyId))`.
- O bien, si la propiedad tiene cuotas que no están `voided`.

**Qué podría verse afectado:** nada de lo que funciona hoy. `tenant-signed-lease` y la
rama `regenerate` ya excluyen Premier. Una propiedad Low Price recalculada por un Premier
de otra propiedad sigue facturándose, porque `getPropertyPlanName` usa el plan propio.

### P5 → H5: banner de Founders
**Dónde:** las tres apariciones del banner (`dashboard/page.tsx:579`,
`services/page.tsx:890, 1032`).
- Usar `alreadyPaid = getPaidPlanForProperty(...)` con cualquier plan **excepto Low
  Price**: Low Price sigue pudiendo pasar a Founders.
- En `computeNetAmountDueCents`, si la propiedad tiene saldo o cuotas pagadas, devolver 0
  o rechazar.

**Qué podría verse afectado:** propietarios Support o Premier dejan de ver el upgrade a
Founders. Confirmar que es lo deseado.

### P6 → H6: programar cuotas sobre una propiedad ya pagada
**Dónde:** `schedulePremierInstallments` (después de 185).
- Si la propiedad tiene un pago completado de otro plan (o un `plan_balance`), no
  programar. Devolver `skipped: "already_paid"` y registrar un error CRITICAL.
- Con P1 este camino casi desaparece; P6 es una segunda capa.

**Qué podría verse afectado:** hoy no existe ningún cambio de plan legítimo hacia Premier
sobre una propiedad pagada. Si se quisiera permitir en el futuro, habría que restar lo
pagado en vez de saltarse la programación.

### P7 → H7: datos antiguos
Sin cambio de código: ajustar a mano `property_id` en los pagos de plan antiguos de
propietarios con varias propiedades, como recomienda el informe PROMPT2. Es necesario
para que P1 y la interfaz los detecten.

---

### Orden recomendado
**P1 y P2.3** (las `idempotencyKey`, sin migración) primero: cierran los dos cobros
reales de mayor riesgo. Después **P3 y P4** (cambios pequeños en una sola función),
**P2.1, P2.2 y P2.4** (idempotencia completa más la migración), y **P5 y P6**. **P7** es
un ajuste de datos, independiente del resto.
