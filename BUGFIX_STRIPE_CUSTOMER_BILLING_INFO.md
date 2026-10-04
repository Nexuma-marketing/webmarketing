# Bugfix: el "Bill to" de las facturas de saldo no corresponde al dueño real

## Síntoma

En la factura de saldo de **Prpi Cod** (14 Edward St, Richmond), el email era
el correcto (`marketing26@zohomailcloud.ca`), pero el nombre decía **"Alex S"**
y la dirección **"4890 Southlawn Drive"**.

## Causa raíz

Hay dos piezas que, juntas, producen el problema.

1. **Stripe Checkout sobrescribe el Customer.** `src/app/api/stripe/checkout/route.ts`
   crea las sesiones de pago (incluido el upfront de $200) con:

   ```ts
   billing_address_collection: "required",
   customer_update: { address: "auto", name: "auto" },
   ```

   Con `customer_update: "auto"`, Stripe copia en el Customer el **nombre y la
   dirección de facturación que se escriben en la página de pago**. Durante las
   pruebas, quien pagó el upfront de la cuenta de Prpi Cod puso sus propios
   datos de tarjeta ("Alex S", "4890 Southlawn Drive"), y esos datos quedaron
   guardados en el Customer de Stripe de Prpi Cod. El email no cambió porque
   Checkout no permite editar el email de un Customer existente. Por eso solo el
   email estaba bien.

2. **`ensureStripeCustomer` nunca corregía nada.** En
   `src/lib/balance-invoice.ts`, la función hacía
   `if (existingId) return existingId;`: si el dueño ya tenía
   `stripe_customer_id`, lo devolvía tal cual, sin tocar nombre ni dirección.
   Stripe copia el nombre y la dirección del Customer en la factura al
   finalizarla, así que la factura salía con los datos que había dejado
   Checkout.

## Qué corregí

### `ensureStripeCustomer` (`src/lib/balance-invoice.ts`)

- Ahora recibe un objeto: `{ ownerId, email, name, existingId, billingProperty }`.
- **Siempre sincroniza** el Customer con nuestra base de datos antes de cada
  factura:
  - Si el Customer existe, hace `stripe.customers.update(id, { email, name, address, metadata })`
    **antes** de crear la factura. Así se corrigen los datos viejos o de
    pruebas anteriores.
  - Si el Customer fue borrado en Stripe o no se puede recuperar, crea uno
    nuevo con los datos correctos y guarda el nuevo `stripe_customer_id` en
    `profiles`.
  - Si no existe, lo crea igual que antes, pero ahora también con dirección.
- Deja un log `[balance-invoice-diag] Syncing Stripe customer billing info from DB`
  con los valores antes y después, para ver en Vercel qué se corrigió.

### Origen de los datos

- **Nombre y email:** `profiles.full_name` y `profiles.email`.
- **Dirección:** la tabla `profiles` **no tiene dirección postal del dueño**.
  Revisé los tipos, las migraciones y los formularios de registro
  (`/forms/propietario`, `/forms/propietario/add-property`), y la única
  dirección que guardamos de un dueño es la de sus propiedades. Por eso se usa
  **la dirección de la propiedad que se está facturando** (`properties.address`,
  `city`, `province`, `postal_code`, `country`). `country` se convierte al
  código ISO de 2 letras que pide Stripe; si viene vacío, se usa `CA`. Si en el
  futuro se agrega una dirección postal del dueño en `profiles`, basta con
  cambiar `billingProperty` en los dos lugares que llaman a la función.

### Premier Tier: sí estaba afectado, y quedó corregido

El cron `src/app/api/cron/process-installments/route.ts` usa el mismo
`ensureStripeCustomer`, así que sus facturas de cuotas tenían el mismo "Bill to"
incorrecto. Ahora llama a la función con el nuevo formato, pasando la propiedad
de la cuota; para eso el `select` agrega `province, postal_code, country`.

### Lo que no cambié

No quité `customer_update: { address: "auto", name: "auto" }` del checkout.
Stripe Tax lo necesita para calcular el impuesto con la dirección que se
escribe en el pago, y los recibos de Checkout reflejan legítimamente al titular
de la tarjeta. Con la sincronización, cualquier cosa que Checkout escriba en el
Customer se corrige antes de cada factura de saldo o de cuota.

## Archivos cambiados

- `src/lib/balance-invoice.ts`: `ensureStripeCustomer` (sincronización y
  dirección), `generateBalanceInvoice` (pasa la propiedad y amplía el `select`).
- `src/app/api/cron/process-installments/route.ts`: nueva forma de llamar a la
  función y `select` ampliado.

## Cómo volver a probar (14 Edward St)

Stripe guarda una copia del nombre y la dirección en la factura al
finalizarla, así que **la factura ya emitida no cambia sola**. Después del
deploy:

1. /admin → Properties → 14 Edward St → **"Resend / Regenerate balance invoice"**.
   Esto anula la factura abierta anterior y emite una nueva.
2. En los logs de Vercel, `Syncing Stripe customer billing info from DB` debe
   mostrar `before: Alex S / 4890 Southlawn Drive` y
   `after: Prpi Cod / 14 Edward St, Richmond`.
3. En Stripe (test), la nueva factura debe decir en "Bill to": **Prpi Cod**,
   14 Edward St, Richmond, BC, con el mismo email.

No se ejecutó `npm install` / `npm run build`, según lo solicitado.
