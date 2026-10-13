# Bugfix: "maintenance" pasa a "Monthly platform fee" en los textos para el cliente

**Qué es este cargo (confirmado por el dueño).** Los planes Elite cobran un valor fijo por
propiedad y, además, un cargo mensual automático por uso de la plataforma. No existe
ningún servicio de mantenimiento de la propiedad. Para el cliente, el nombre correcto es
**"Monthly platform fee"**.

**Qué cambia.** Solo los textos que ve el propietario o el inversionista. El cobro mensual,
los montos, la lógica de suscripción y los identificadores internos quedan igual
(`payment_type` y `metadata.kind` siguen valiendo `"elite_maintenance"`).

Antecedentes: `BUGFIX_PAYMENT_HISTORY_LABELS.md`.

No se ha ejecutado npm install, build, lint ni tsc.

---

## Cambios realizados

| # | Archivo | Línea | Texto anterior | Texto nuevo |
|---|---|---|---|---|
| 1 | `src/app/(dashboard)/dashboard/payments/page.tsx` ("All Payments", columna "Service / Plan") | 504-505 | *(antes caía en "Elite maintenance — …")* | Filas `subscription_canceled` con propiedad: **`Monthly platform fee (canceled) — <dirección>, <ciudad>`** |
| 2 | ídem | 506-507 | `Elite maintenance — <dirección>, <ciudad>` | **`Monthly platform fee — <dirección>, <ciudad>`** (filas `elite_maintenance`, ver nota A) |
| 3 | ídem ("All Payments", columna "Type") | 521-523 | `elite maintenance` (con la mayúscula que añade el CSS, "Elite Maintenance") | **`Platform fee`** (con la mayúscula del CSS, "Platform Fee"). Solo cuando `payment_type === "elite_maintenance"`; los demás tipos no cambian (nota B). |
| 4 | ídem (tarjeta "Active installment plans": nombre de la suscripción y texto del botón de cancelar) | 300 | `Elite maintenance — <dirección>, <ciudad>` | **`Monthly platform fee — <dirección>, <ciudad>`** |
| 5 | `src/app/api/stripe/webhook/route.ts` (nombre del producto de la suscripción en Stripe) | 376 | `Elite ${tier.name} — Monthly Maintenance Fee` | **`Elite ${tier.name} — Monthly Platform Fee`** |
| 6 | `src/components/dashboard/elite-portfolio-breakdown.tsx` (tarjeta de cada propiedad Elite) | 100 | `Monthly maintenance` | **`Monthly platform fee`** |
| 7 | ídem (aviso antes del checkout) | 158 | `…automatic recurring charge of $X CAD/month (maintenance fee), billed monthly until canceled.` | `…(monthly platform fee), billed monthly until canceled.` |
| 8 | `src/app/(dashboard)/dashboard/page.tsx` ("Your Portfolio") | 543 | `…one-time portfolio fee + monthly maintenance fee.` | `…one-time portfolio fee + monthly platform fee.` |
| 9 | `src/lib/constants.ts`, `feeDescription` de Essentials | 349 | `…+ $200 CAD/month maintenance fee, charged for this property only.` | `…+ $200 CAD/month platform fee, charged for this property only.` |
| 10 | ídem, Signature | 362 | `…+ $200 CAD/month maintenance fee…` | `…+ $200 CAD/month platform fee…` |
| 11 | ídem, Lujo | 375 | `…+ $300 CAD/month maintenance fee…` | `…+ $300 CAD/month platform fee…` |
| 12 | ídem, Below Portfolio Minimum | 402 | `…+ $200 CAD/month maintenance fee…` | `…+ $200 CAD/month platform fee…` |

Los `feeDescription` (filas 9 a 12) se muestran al cliente en
`elite-portfolio-breakdown.tsx:139`. Es el único sitio donde se usan.

Un comentario interno de `payments/page.tsx:490` cambió de "Elite maintenance label" a
"Elite platform-fee label" para que siga describiendo bien el código. No es texto visible.

**Nota A: filas sin servicio que no son cuota, saldo ni cancelación.** En la tabla, esta
rama la pedía solo para `elite_maintenance`. Pero es también la etiqueta por defecto de
**cualquier otra** fila sin `service_id` ni `pymes_plan_id` que tenga propiedad. Antes ese
texto por defecto era "Elite maintenance — …". Dejarlo igual habría seguido mostrando la
palabra "maintenance", así que ahora dice "Monthly platform fee — …". En la práctica,
las únicas filas que llegan aquí son `elite_maintenance` (pagadas o fallidas): cuotas y
saldos tienen su propia etiqueta, y los pagos fallidos de otras suscripciones se guardan
sin propiedad. El orden de las reglas no ha cambiado.

**Nota B: columna "Type".** No estaba en la lista, pero la tabla mostraba
"Elite Maintenance" en esa columna, generado a partir del valor interno de
`payment_type`. Solo cambié lo que se muestra; el valor guardado no cambia. El texto de la
cancelación sigue saliendo "Subscription canceled", como antes.

---

## Apariciones de "maintenance" que NO se han cambiado, y por qué

Búsqueda: `grep -rni maintenance src/`, sin contar los identificadores `elite_maintenance`
e `isEliteMaintenance`.

### Texto legal: se deja para la revisión legal
| Archivo | Línea | Texto |
|---|---|---|
| `src/app/api/stripe/checkout/route.ts` | 241 | `…you also authorize a separate recurring monthly charge of $X CAD (maintenance fee for this property), billed automatically each month until canceled.` El cliente lo ve en Stripe Checkout. **Sigue diciendo "maintenance fee"** y ahora no coincide con el resto de la app. Hay que corregirlo en la revisión legal. |

### Identificadores internos: no se cambian por instrucción
- `payment_type: "elite_maintenance"`: `webhook/route.ts:591, 818`.
- `metadata.kind: "elite_maintenance"`: `webhook/route.ts:391, 581, 807`.
- Variable `isEliteMaintenance`: `webhook/route.ts:807, 813, 818`.
- Comparaciones nuevas con `"elite_maintenance"` en `payments/page.tsx`.

### Comentarios en el código: no se muestran
`src/types/database.ts:20`, `src/lib/constants.ts:282`, `src/lib/payment-lookup.ts:87`,
`src/app/api/stripe/checkout/route.ts:189, 237, 407`,
`src/app/api/stripe/webhook/route.ts:349, 574, 727, 811`,
`src/components/dashboard/elite-portfolio-breakdown.tsx:26`.

### Reportes internos y admin: solo reporte
| Archivo | Línea | Qué muestra |
|---|---|---|
| `src/lib/property-payment-summary.ts` (Sales Report) | 36 | Solo un comentario ("Elite monthly maintenance"). En pantalla, estos pagos aparecen en la columna "other paid", sin la palabra. |
| `src/app/(dashboard)/admin/payments/page.tsx` | 166-171 | Columna "Type": `payment_type.replace("_", " ")`, así que muestra **"Elite Maintenance"** al admin. |
| `src/app/(dashboard)/admin/reports/page.tsx` | 287 | Si un pago no tiene `service_id`, usa `payment_type` como nombre, así que muestra **"elite_maintenance"** tal cual. |
| `src/app/(dashboard)/admin/export/page.tsx` | 107 | Exporta la columna `payment_type` con el valor `elite_maintenance`. |
| `src/app/(dashboard)/admin/plans/page.tsx` | 125 | "Local vendor alliances for repairs & maintenance" (ver abajo). |

### Características de los planes que hablan de mantenimiento: decisión del dueño
Estas frases no se refieren al cargo mensual. Hablan de una red de proveedores de
reparaciones. Cambiarlas por "Monthly platform fee" no tendría sentido, así que **no las
he tocado**. Pero son visibles para el cliente y dicen "maintenance":
- `src/lib/constants.ts:126`: "Local vendor alliances for repairs & maintenance". Está en
  la lista de características del plan Elite ("Elite Assets & Legacy", `constants.ts:111`).
  Hay una copia en `admin/plans/page.tsx:125`.
- `src/lib/constants.ts:302`: "Local vendor partnerships (repairs, maintenance, cleaning
  services)". Es `ELITE_ESSENTIALS_FEATURES`.

Si el dueño confirma que la plataforma tampoco ofrece esa red de proveedores, habría que
reescribir o quitar esas frases. No se ha hecho.

### Correos
No hay ningún texto con "maintenance" en los correos de la app (Resend / `email.ts`).
Los recibos y facturas que **Stripe** envía de la suscripción usan el nombre del producto,
que es el que cambia en la fila 5 de la tabla.

---

## Qué verá el cliente

| Pantalla | Antes | Después |
|---|---|---|
| `/dashboard/payments`, "All Payments", cargo mensual Elite | "Elite maintenance — 12 Main St, Vancouver" · Type "Elite Maintenance" | **"Monthly platform fee — 12 Main St, Vancouver"** · Type **"Platform Fee"** |
| ídem, cancelación de la suscripción | "Elite maintenance — 12 Main St, Vancouver" · Type "Subscription canceled" | **"Monthly platform fee (canceled) — 12 Main St, Vancouver"** · Type "Subscription canceled" |
| ídem, "Active installment plans" | "Elite maintenance — 12 Main St, Vancouver" | **"Monthly platform fee — 12 Main St, Vancouver"** |
| ídem, modal "Request refund" de esas filas | nombre "Elite maintenance — …" | nombre "Monthly platform fee — …" (el botón no cambia) |
| `/dashboard/services`, tarjeta de propiedad Elite | etiqueta "Monthly maintenance"; descripción "…/month maintenance fee…"; aviso "(maintenance fee)" | **"Monthly platform fee"**; "…/month platform fee…"; "(monthly platform fee)" |
| `/dashboard` (inicio), "Your Portfolio" | "…one-time portfolio fee + monthly maintenance fee." | "…one-time portfolio fee + monthly platform fee." |
| Stripe Checkout del plan Elite | "(maintenance fee for this property)" | **Sin cambios**: está pendiente de la revisión legal |
| Facturas y recibos de Stripe de la suscripción **nueva** | "Elite Signature — Monthly Maintenance Fee" | "Elite Signature — Monthly Platform Fee" |

Las cuotas Premier, los saldos, los pagos iniciales y los planes PYME no cambian.

---

## Nota: suscripciones ya creadas en Stripe

El nombre del producto se fija **al crear** la suscripción, en el webhook
`checkout.session.completed`. Por eso:
- Las suscripciones de mantenimiento Elite que **ya existen** en Stripe (modo prueba)
  conservan el producto **"Elite <tier> — Monthly Maintenance Fee"**. Sus facturas y
  recibos mensuales seguirán diciendo "Maintenance Fee".
- Solo las suscripciones creadas **después del deploy** usarán "Monthly Platform Fee".
- Dentro de la app no hay problema: la tabla de pagos no usa el nombre del producto de
  Stripe, sino `payment_type`, así que también las suscripciones antiguas se verán como
  "Monthly platform fee".
- Si se quiere unificar las antiguas, se puede renombrar cada producto desde el dashboard
  de Stripe (Products → editar nombre). No cambia precios ni cobros. No se ha hecho.
