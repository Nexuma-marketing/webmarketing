# Bugfix: el saldo pendiente mostrado no coincidía con el facturado tras un cambio de plan

Rama `fix/auth-dashboard`. Cambios en el working tree, sin commit. No se compiló ni se probó nada localmente; todo es revisión de código. No hace falta SQL.

## Resumen

- Payment History y Sales Report ahora calculan el saldo de una propiedad con el plan efectivo del dueño, igual que la factura. Wales pasa de $675 a $550.
- `generateBalanceInvoice` y todos los cálculos de cobro quedaron sin tocar.
- Dos cosas a tener en cuenta, detalladas abajo: la regla no se pudo reutilizar literalmente desde la factura, y hay un caso en que una factura ya emitida queda desactualizada hasta que la regeneres.

## Archivos tocados

| Archivo | Cambio |
|---|---|
| `src/lib/property-plan-balance.ts` | `resolvePropertyPlanBalance` acepta el plan más reciente del dueño y si el saldo ya se pagó; devuelve además el plan efectivo |
| `src/app/(dashboard)/dashboard/payments/page.tsx` | Payment History pasa esos dos datos y muestra el plan efectivo |
| `src/lib/property-payment-summary.ts` | Sales Report pasa esos dos datos y ajusta la columna "Plan" |

No se tocó `balance-invoice.ts`, `plan-percentage.ts`, `payment-lookup.ts`, `plan-switch.ts`, `premier-installments.ts` ni ninguna tarjeta.

## Causa

La factura y la pantalla usaban planes distintos para la misma propiedad:

| | Qué plan usa |
|---|---|
| Factura (`generateBalanceInvoice`) | El pago de plan más reciente del **dueño**, en cualquier propiedad |
| Payment History y Sales Report | El pago de plan más reciente de **esa propiedad** |

Para Wales, la factura veía Support (pagado después, por Jas) y la pantalla veía Low Price.

## Cambio

Toda la regla vive en `resolvePropertyPlanBalance`, que es la función que comparten Payment History y Sales Report. Recibe dos datos opcionales nuevos: el nombre del plan más reciente del dueño y si el saldo de la propiedad ya está pagado.

Usa el plan del dueño en vez del plan propio de la propiedad solo cuando se cumplen todas estas condiciones:

1. El upfront de la propiedad se pagó como Low Price o Founders.
2. Su saldo no está pagado (`balance_invoice_status` distinto de `paid`).
3. El pago de plan más reciente del dueño es Support o Premier.
4. La propiedad está entre las 3 primeras del dueño.

En ese caso aplica 30% a la posición 1 y 28% a la 2 y 3, menos $200. En cualquier otra combinación el resultado es el de antes.

**Sobre reutilizar la lógica de la factura:** no fue posible sin tocarla. La regla está escrita dentro de `generateBalanceInvoice`, mezclada con consultas y llamadas a Stripe, y pediste no modificarla. Quedó replicada en `resolvePropertyPlanBalance` con un comentario que apunta a la factura como fuente de verdad. Son dos copias de la misma regla; si algún día cambia una, hay que cambiar la otra.

**Condición 3, "más reciente":** usé exactamente el criterio de la factura (el último pago de plan del dueño), no "alguna vez pagó Preferred". En el caso normal dan lo mismo. Difieren solo si, después de pagar Support, el dueño hace otro pago de plan básico; ahí la factura tampoco aplicaría Preferred, y la pantalla la sigue.

**Cuotas vs factura única:** una propiedad Low Price cuyo dueño luego compró Premier sigue mostrándose con factura única, no con cuotas, porque así la factura el sistema.

## Antes y después

| Caso | Antes | Después |
|---|---|---|
| (a) Wales, $2,500, upfront Low Price, dueño luego pagó Support, saldo sin pagar | Low Price, 35%, **$675** | Support, 30%, **$550** |
| (b) Jas, $3,000, Support, posición 2 | 28%, $640 | Idéntico |
| (c) Cliente con 1 propiedad Low Price | 35% × renta − $200 | Idéntico |
| (d) Propiedad Low Price con saldo ya pagado | Low Price, "Fully paid" | Idéntico |
| (e) Langley (Support) y Washington St (Premier) | 28% cada una | Idénticos |
| Founders con 1 propiedad | 30% × renta − $200 | Idéntico |
| Elite | Sin saldo porcentual | Idéntico |

Por qué no cambian:

- (b) y (e): la regla solo se activa si el upfront fue Low Price o Founders.
- (c): el plan más reciente del dueño es Low Price, no Preferred.
- (d): el saldo está pagado.

El total del Sales Report baja en $125 por Wales (de $1,955 a $1,830 si no cambió nada más en la cuenta).

**Coquitlam (cuenta propietariotest):** queda idéntica siempre que su `balance_invoice_status` sea `paid`. No puedo consultar la base desde aquí. Si su saldo no figura como pagado, pasaría a mostrarse como Support al 30%, que es lo que la regla indica.

## Columna "Plan" del Sales Report (punto 4)

Para una propiedad en este caso muestra ambos datos: `Support Tier (upfront paid as Low Price)`. El mismo texto sale en el CSV. En el resto de propiedades la columna no cambia.

En Payment History, la tarjeta de saldo de Wales pasa a titularse con el plan efectivo (Support Tier).

## Dónde se usa el mismo resultado (punto 3)

| Pantalla | De dónde sale el saldo |
|---|---|
| Payment History: tarjetas de saldo y cuadro "Pending" | `resolvePropertyPlanBalance` |
| Sales Report: saldo, estado, total y columna Plan | `resolvePropertyPlanBalance` |
| Tarjetas por propiedad de Support/Premier (Services) | No llaman a la función |

Sobre las tarjetas por propiedad:

- Para una propiedad pagada en su propio plan Support/Premier calculan 30%/28% por posición con la misma fórmula, así que coinciden con la función. No las cambié.
- Para una propiedad como Wales no muestran ningún monto: solo "Paid under Low Price ✓ — View balance", que lleva a Payment History, donde ya aparece $550. No hay número que contradiga, pero la etiqueta sigue diciendo Low Price. No la toqué para mantener el cambio mínimo; dime si quieres que diga el plan efectivo.

## Caso a vigilar

Si la factura de saldo de una propiedad Low Price **ya estaba emitida** al 35% y después el dueño paga Support por otra propiedad, la pantalla mostrará el monto nuevo (30%) pero la factura abierta en Stripe seguirá con el monto viejo. Nada la recalcula sola. Hay que usar "Resend / Regenerate balance invoice" en el admin para que coincidan.

En el caso de Wales no pasa, porque el lease se firmó después de pagar Support.
