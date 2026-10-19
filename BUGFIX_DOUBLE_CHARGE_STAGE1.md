# Bugfix: protección contra cobros dobles, etapa 1

Antecedentes: `INVESTIGATION_DOUBLE_CHARGE_PROTECTION.md`. Esta etapa cubre el hueco H1
completo y una parte del H2.

**Regla del dueño.** El sistema asigna el plan de cada propiedad según su renta. Una
propiedad que ya pagó su plan no se puede cobrar otra vez ni cambiar de plan. La regla
vale para todos los planes de propietario y de inversionista, incluidos los Elite. El
add-on Priority Listing no cuenta como plan.

No se ha ejecutado npm install, build, lint ni tsc.

---

## 1. Archivos y líneas cambiados

### `src/app/api/stripe/checkout/route.ts` (Cambio 1)
| Líneas | Cambio |
|---|---|
| 7 | Importa `FOUNDERS_SERVICE_NAME` y `LOW_PRICE_SERVICE_NAME` desde `@/lib/payment-lookup`. |
| 118-119 | Nuevo `PROPERTY_PLAN_ROLES`: `propietario`, `propietario_preferido` e `inversionista`. |
| 121-167 | Nueva función `getPaidPlanNamesForProperty(propertyId, ownerId)`, explicada abajo. |
| 218 | El `select` del servicio añade `category`. |
| 270-309 | Nueva comprobación antes de calcular el monto y crear la sesión de Stripe. Se ejecuta **después** de verificar que la propiedad pertenece al usuario. |

**Qué hace `getPaidPlanNamesForProperty`:**
- Usa `supabaseAdmin`.
- Busca los pagos de la propiedad con `status = "completed"` y servicio asignado.
- De esos, se queda con los servicios de categoría `"plan"`.
- Si no encuentra ninguno y el propietario tiene **una sola** propiedad, mira también sus
  pagos de plan antiguos guardados sin propiedad (`property_id = null`). Es la misma regla
  que `getCompletedPaymentForPropertyService`.
- Los pagos `refunded` o `failed` no cuentan.
- Si alguna consulta falla, devuelve `null` para no cobrar sin haber podido comprobar.

**La comprobación** solo se aplica cuando `service.category === "plan"` **y** el rol es
propietario o inversionista:

| Situación | Respuesta |
|---|---|
| No se envía `propertyId` | **400** `A property is required to purchase a plan` |
| La consulta a la base de datos falla | **503** `We couldn't verify this property's payments. Please try again in a moment.` |
| La propiedad ya tiene un plan pagado, sin `netAgainstExisting` | **409** `This property already has a paid plan` |
| Ídem, con `netAgainstExisting`, pero no es Founders sobre una propiedad que **solo** tiene Low Price pagado | **409**, mismo mensaje |
| Founders con `netAgainstExisting` y la propiedad solo tiene Low Price pagado | Se permite (el upgrade documentado). |
| Sin plan pagado | Continúa igual que antes. |

Cada bloqueo deja en los logs una línea `console.warn` `[stripe-checkout] Blocked plan
checkout…` con el usuario, la propiedad, el plan pedido y los planes ya pagados.

### `src/components/checkout/checkout-button.tsx` (mensaje visible)
**Antes**, si el servidor rechazaba la compra y no había código promocional, el error solo
iba a la consola del navegador. El cliente veía que el botón volvía a su estado normal,
sin ninguna explicación.

| Líneas | Cambio |
|---|---|
| 51-54 | Nuevo estado `checkoutError`. |
| 59 | Se limpia en cada clic. |
| 89-97 | Los errores de código promocional (respuesta 400 con un código escrito) siguen en el recuadro del código. Cualquier otro error va a `checkoutError`. Si el servidor no envía texto, se muestra "We couldn't start the checkout. Please try again." |
| 100 | Un fallo de red o una respuesta ilegible muestra el mismo texto genérico. |
| 128-130 | El mensaje aparece **debajo del botón**, en rojo (`role="alert"`). |

### `src/app/api/stripe/webhook/route.ts` (Cambio 2)
| Líneas | Cambio |
|---|---|
| 342-345 | Suscripción PYME: `stripe.subscriptions.create(…, { idempotencyKey: \`pymes_sub_${session.id}\` })` |
| 399-402 | Suscripción Elite: `stripe.subscriptions.create(…, { idempotencyKey: \`elite_sub_${session.id}\` })` |

Nada más del webhook cambia: montos, metadata, filas de `payments`, contador de Founders,
correos y cuotas Premier quedan igual.

**Qué pasa exactamente cuando un evento llega dos veces:**
- Antes de crear la suscripción, el webhook crea un "precio" nuevo en Stripe
  (`stripe.prices.create`). Ese paso no tiene clave de repetición, así que en la segunda
  entrega se crea un precio distinto.
- Stripe recibe entonces la misma clave de suscripción con un precio diferente y
  responde con un error de idempotencia. **No crea una segunda suscripción.**
- El error queda en los logs (`Webhook handler error`) y el resto de esa segunda entrega
  se omite: actualización del lead y correo de recibo. Ya se hicieron en la primera
  entrega, así que no se pierde nada.
- Queda un precio sin usar en Stripe. No cobra nada.
- **Límite:** Stripe guarda cada clave **24 horas**. Un reenvío después de ese plazo podría
  crear una segunda suscripción. Eso se cubre con la idempotencia completa de la etapa 2
  (P2.1, P2.2 y P2.4).

---

## 2. Servicios cubiertos por la protección

La protección se basa en la **categoría** del servicio, no en una lista de nombres. Así
que cubre **cualquier** servicio con `category = "plan"` que compre un propietario o un
inversionista. Según las migraciones del repositorio son estos:

| Servicio (nombre en BD) | Lo compra | ¿Cubierto? |
|---|---|---|
| Plan: Low Price | Propietario | **Sí** |
| Plan: Founder Package — Visionary Owners | Propietario | **Sí**. Upgrade desde Low Price permitido. |
| Plan: Owner Preferred — Support Tier | Propietario | **Sí** |
| Plan: Owner Preferred — Premier Tier | Propietario | **Sí** |
| Plan: Elite — Essentials | Inversionista | **Sí** |
| Plan: Elite — Signature | Inversionista | **Sí** |
| Plan: Elite — Lujo (se muestra "Luxury") | Inversionista | **Sí** |
| Plan: Elite — Below Portfolio Minimum | Inversionista | **Sí** |

**No cubiertos:**
- **Plan: PYMES — Rescue / Growth / Scale.** Son categoría `plan`, pero los compra el rol
  `pymes`, que queda fuera, y su compra va por `type: "pymes_upfront"`, que no se ha
  tocado.
- **Add-on: Priority Listing Placement**, de categoría `addon`. Ni se bloquea ni cuenta
  como plan pagado.
- **Cualquier otro servicio que no sea plan** (servicios de inquilino, consultorías,
  etc.).
- **Compras hechas por roles internos** (admin, sales…) o por inquilinos.

Para confirmar la lista real en producción, se puede ejecutar en Supabase:
`select name from services where category = 'plan' and is_active;`

---

## 3. Qué ve el cliente cuando se bloquea

El botón deja de girar ("Processing…") y vuelve a su texto normal. **Debajo** aparece un
texto rojo:
- **"This property already has a paid plan"** (respuesta 409), o
- **"A property is required to purchase a plan"** (400; no debería verse desde la
  interfaz, ver el punto 4), o
- **"We couldn't verify this property's payments. Please try again in a moment."** (503,
  solo si falla la base de datos).

No se abre Stripe, no se crea ninguna sesión de pago y no hay ningún cargo.

---

## 4. Flujos que hoy funcionan: ¿se ven afectados?

| Flujo | ¿Afectado? | Por qué |
|---|---|---|
| Primera compra de un plan para una propiedad sin pagar | No | No hay pagos de plan, así que continúa igual. |
| Low Price con el add-on Priority Listing en la misma compra | No | La propiedad no tiene plan pagado. El add-on va en la misma sesión. |
| Priority Listing comprado aparte (`priority-listing-card.tsx`) | No | Es categoría `addon`; la comprobación no se aplica. |
| Upgrade Low Price → Founders (banner de Founders, `netAgainstExisting`) | No | Es el caso permitido. El netting y la fila de $0 `plan_switch_noop` siguen igual. |
| Un segundo upgrade a Founders cuando ya hay Founders pagado | **Ahora 409** | Es lo deseado. La interfaz ya mostraba "Deposit paid" en ese caso. |
| Recompra después de un reembolso | No | Los pagos `refunded` no cuentan. |
| Tarjetas Support y Premier por propiedad (`owner-plan-portfolio-breakdown.tsx:127-131`) | No | Siempre envían `propertyId`. |
| Tarjetas Elite por propiedad (`elite-portfolio-breakdown.tsx:144-149`) | No | Siempre envían `propertyId`. |
| Tarjetas Low Price y Founders (`primary-plan-pricing-card.tsx:121-125`, banner de Founders) | No, si el propietario tiene al menos una propiedad | Envían `ownerProperties[0]?.id`. Sin propiedades, ahora el servidor responde 400 en lugar de cobrar un plan sin propiedad. |
| Botones de compra **sin** `propertyId` (`services/page.tsx:1264` y `1342`) | No | El 1264 manda los planes a "Acquire this plan" (enlace a contacto) y solo cobra servicios que no son plan. El 1342 está en "Recommended for You", que se oculta a propietarios e inversionistas (`!isOwnerRole`, línea 1280; `isOwnerRole` incluye al inversionista, 152-155). |
| Compras PYME (`pymes_upfront`) | No | No se ha tocado. |
| Netting, cuotas Premier, facturas de saldo, Sales Report | No | No se han tocado. |

**Efecto sobre H5, que no se cambió pero conviene saber:** el banner "Upgrade to Founders"
sigue apareciendo para un propietario cuya primera propiedad se pagó con Support o Premier.
Al pulsarlo, ahora el servidor responde 409 y el cliente ve "This property already has a
paid plan". Antes se le cobraba. Ocultar el banner en ese caso queda para la etapa de H5.

**Lo que esta etapa NO cierra:**
- **Dos pestañas que ya están en Stripe.** Si las dos pestañas pulsaron "Pay" **antes**
  de que se pagara ninguna, ya existen dos sesiones de Stripe abiertas. Pagar en las dos
  sigue cobrando dos veces, porque la comprobación ocurre al crear la sesión, no al
  pagarla. Hace falta la protección en el webhook o `expires_at` (etapa 2).
- **Founders sobre una propiedad Low Price con el saldo ya pagado** se sigue permitiendo,
  porque es el upgrade autorizado. El netting no resta el saldo pagado (H5), así que
  cobraría `30% × renta − $200`. Esto contradice "no se puede cambiar de plan una vez
  pagado". Confirmar con el dueño si el upgrade debe permitirse solo mientras el saldo de
  Low Price **no** esté pagado.
- **Propietarios con varias propiedades y pagos de plan antiguos sin `property_id`** (H7):
  el servidor tampoco los atribuye a una propiedad concreta.
- H3, H4, H6 y la idempotencia completa del webhook.

---

## 5. Prueba en vivo (sin conocimientos técnicos)

**Qué cuenta usar.** No hay ninguna cuenta de pruebas de propietario documentada en el
repositorio; `INTERNAL_TEST_ACCOUNTS_SETUP_GUIDE.md` solo cubre admin y sales. Usar una
cuenta de **Property Owner** de pruebas que tenga **una propiedad sin ningún pago**.
- Lo más sencillo es crear un propietario nuevo con una propiedad nueva.
- O añadir una propiedad nueva a un propietario de pruebas existente. **No** usar 111
  Washington St, que ya está pagada.
- Stripe debe estar en modo prueba. Tarjeta **4242 4242 4242 4242**, cualquier fecha
  futura y cualquier CVC.

**Prueba A: dos pestañas (la principal)**
1. Entrar con esa cuenta y abrir **Services** (`/dashboard/services`) en **dos pestañas**.
2. Comprobar que, en las dos, la tarjeta del plan de esa propiedad muestra "Pay $200 CAD
   upfront". Según la cuenta será Low Price, Support o Premier.
3. En la **pestaña 1**, pulsar "Pay", completar el pago en Stripe con la tarjeta de
   prueba y esperar a volver a la página de éxito.
4. Abrir **Payment History** en la pestaña 1 y confirmar que aparece el pago de $200. Si
   no aparece, esperar unos segundos y refrescar: el pago lo registra Stripe en segundo
   plano.
5. Ir a la **pestaña 2**, **sin refrescarla**, y pulsar el mismo botón "Pay".
6. **Resultado esperado:**
   - El botón gira un momento y vuelve a su estado normal.
   - Debajo aparece en rojo **"This property already has a paid plan"**.
   - **No** se abre la página de Stripe.
7. **Comprobación final:** en Payment History hay **un solo** pago de $200 para esa
   propiedad. En el dashboard de Stripe (modo prueba) → Payments hay un solo cargo.

**Prueba B: el botón sigue funcionando para una propiedad sin pagar.** Con otra propiedad
sin pagar, pulsar "Pay". Debe abrir Stripe con normalidad. Se puede cerrar sin pagar.

**Importante para la prueba A.** Hay que pulsar "Pay" en la pestaña 2 **después** de
pagar en la 1. Si se pulsa "Pay" en las dos pestañas antes de pagar, las dos páginas de
Stripe ya están abiertas y pagar en ambas cobraría dos veces. Ese caso es el que queda
para la etapa 2 (ver el punto 4).

---

## 6. Cómo se cobran hoy los planes de empresa (PYME), en lenguaje sencillo

**Lo que paga el cliente al contratar**
- La empresa elige su plan y paga **un primer pago** en la página de pago de Stripe.
- Ese primer pago es el "monto inicial" guardado en el plan. Si el plan no tiene un monto
  inicial guardado, se cobra **la mitad del precio total**.
  (`src/app/api/stripe/checkout/route.ts`, caso `pymes_upfront`, líneas 545-649; el
  cálculo del monto está en la línea 566.)

**Lo que se programa después**
- En cuanto Stripe confirma ese primer pago, el sistema crea en Stripe **una suscripción
  mensual**: un cobro automático que se repite cada mes con la tarjeta del cliente
  (`src/app/api/stripe/webhook/route.ts`, líneas 295-348).
- Cada cobro mensual es la "cuota mensual" del plan, más el 5% de GST.
- El número de meses es el "número de cuotas" del plan.
- Según los valores iniciales del sistema (`supabase/migration_v2_mvp.sql:375-420`):

| Plan | Precio total | Primer pago | Cuotas mensuales |
|---|---|---|---|
| Rescue | $1,500 | $750 | 3 × $250 |
| Growth | $2,500 | $1,000 | 4 × $375 |
| Scale | $3,800 | $1,500 | 5 × $460 |

  Son los valores con los que se creó la tabla. Si alguien los cambió después en la base
  de datos, mandan los actuales.

**Cuándo para**
- Cada vez que Stripe cobra un mes, el sistema lo anota en el historial como "installment"
  con su número ("2 of 4"…).
- Cuando se cobra la última cuota, el sistema **cancela la suscripción** para que no siga
  cobrando (`webhook/route.ts`, líneas 609-646, en especial 642-644).
- El cliente también puede cancelarla él mismo desde Payment History, en "Active
  installment plans".

**¿Depende de Stripe?** Sí, por completo. Los cobros mensuales los hace Stripe con esa
suscripción. Nuestro sistema no tiene un calendario propio para PYME (a diferencia de las
cuotas Premier, que sí lo tienen).

**Cosas a verificar (solo reporte):**
- **Cuándo se cobra el primer mes.** La suscripción se crea sin periodo de espera. Lo
  normal en Stripe es que el **primer mes se cobre el mismo día** que el primer pago, no
  un mes después.
- **Si la tarjeta queda guardada.** La página de pago no pide guardar la tarjeta para
  cobros futuros (no hay `setup_future_usage` en `checkout/route.ts`). Si Stripe no tiene
  una tarjeta guardada para ese cliente, la suscripción podría quedar **"incomplete"** y
  no cobrar ninguna cuota.

Conviene revisar en el dashboard de Stripe (modo prueba) una compra PYME real: si la
suscripción quedó "Active" o "Incomplete", y en qué fecha se cobró el primer mes. Esta
etapa no cambia nada de esto. La clave de repetición añadida solo evita que se cree una
**segunda** suscripción.
