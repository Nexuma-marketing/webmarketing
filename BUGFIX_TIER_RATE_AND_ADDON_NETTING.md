# Bugfix: porcentaje por posición en Support y add-on restado del saldo

Rama `fix/auth-dashboard`. Cambios en el working tree, sin commit. No se compiló ni se probó nada localmente; todo es revisión de código. No hace falta SQL.

## Resumen

- **Parte 1:** corregida con un cambio en 1 archivo (`src/lib/balance-invoice.ts`).
- **Parte 2:** corregida con un cambio en 1 archivo (`src/lib/payment-lookup.ts`).
- **No puedo confirmar que (c) y (d) den lo mismo que antes para Support.** La causa raíz no es el flujo de "agregar propiedad": la factura de saldo de Support cobraba 30% en cualquier posición. Una 2ª o 3ª propiedad en Support registrada de una vez también se facturaba al 30%. Ahora da 28%. Detalle abajo.
- **Queda un bug relacionado sin corregir**, descrito al final: la factura detecta el plan por dueño, no por propiedad.

## Archivos tocados

| Parte | Archivo | Cambio |
|---|---|---|
| 1 | `src/lib/balance-invoice.ts` | Un bloque nuevo dentro de `generateBalanceInvoice()` |
| 2 | `src/lib/payment-lookup.ts` | Filtro dentro de `getCompletedUpfrontForProperty()` |

No se solapan en archivos. Sí se combinan en el resultado: `generateBalanceInvoice()` llama a `getCompletedUpfrontForProperty()`, así que el monto de una factura de saldo de Support con add-on depende de ambos cambios.

No se tocó `plan-percentage.ts`, `plan-switch.ts`, `premier-installments.ts`, `property-plan-balance.ts`, ninguna tarjeta, ni el flujo de add-property.

---

## Parte 1: Langley facturada al 30%

### Causa raíz

El porcentaje se decide en tres sitios distintos, y solo uno ignoraba la posición:

| Dónde | Cómo calcula Support/Premier |
|---|---|
| Tarjeta por propiedad, Payment History, Sales Report | Por posición (`created_at`): 30% la 1ª, 28% la 2ª y 3ª |
| Cuotas Premier (`premier-installments.ts`) | Por posición: 30% / 28% |
| **Factura de saldo (`generateBalanceInvoice`)** | **`getPlanPercentage(nombreDelPlan)`: fijo por nombre. Support = 30%, Premier = 28%, sin mirar la posición** |

Langley es Support, así que su saldo salió de `getPlanPercentage("…Support Tier")` = 30%: $3,200 × 30% = $960. Washington St salió bien porque es Premier, y Premier no pasa por la factura de saldo sino por las cuotas, que sí usan posición.

Respuestas a tus preguntas:

- ¿Se calcula por cantidad de propiedades? No. Se calculaba por nombre de plan.
- ¿La posición ignora propiedades pagadas como Low Price? No. Donde se usa posición, cuenta todas las propiedades del dueño. El problema es que la factura no usaba posición.
- El flujo de add-property no interviene en el porcentaje. Solo asigna `service_tier` por cantidad, y ese campo no se usa para cobrar. El checkout del upfront cobra $200 fijos en todos los casos.

### Cambio aplicado

En `generateBalanceInvoice()`, después de obtener el porcentaje por nombre: si el plan es "Owner Preferred" (Support o Premier), se calcula la posición de la propiedad entre todas las del dueño por `created_at`, con el mismo criterio que ya usan las cuotas Premier y las tarjetas.

- Posición 1: 30%.
- Posición 2 o 3: 28%.
- Posición 4 o más: no se genera factura y devuelve un error claro. Antes cobraba 30%.
- Si no se puede resolver la posición: error, sin factura.

Low Price y Founders no entran en ese bloque.

No se modificó ningún pago, factura ni fila existente. Langley queda como está; el cambio solo afecta facturas generadas a partir de ahora. Si regeneras la factura de Langley desde el admin, saldría al 28%.

### La tarjeta y la factura (punto 5)

La tarjeta ya mostraba el porcentaje por posición (28% para Langley). No hubo que cambiarla: ahora la factura usa la misma regla y coinciden.

### Tabla de casos después del cambio

Ejemplos con renta de $3,200/mes. "Saldo" es la factura de saldo, con solo el upfront de $200 pagado.

| Caso | Propiedad | % | Total | Saldo | ¿Igual que antes? |
|---|---|---|---|---|---|
| (a) 1 propiedad, Low Price | 1ª | 35% | $1,120 | $920 | Sí |
| (a) 1 propiedad, Founders | 1ª | 30% | $960 | $760 | Sí |
| (b) Low Price + 2ª en Support | 2ª | 28% | $896 | $696 | **No: antes 30%, $960, $760** |
| (b) Low Price + 2ª en Premier | 2ª | 28% | $896 | 3 cuotas | Sí |
| (c) 3 propiedades, Support | 1ª | 30% | $960 | $760 | Sí |
| (c) 3 propiedades, Support | 2ª y 3ª | 28% | $896 | $696 | **No: antes 30%, $960, $760** |
| (c) 3 propiedades, Premier | 1ª | 30% | $960 | 1 cuota de $760 | Sí |
| (c) 3 propiedades, Premier | 2ª y 3ª | 28% | $896 | 3 cuotas ($348 / $208.80 / $139.20) | Sí |
| (d) 3 registradas de una vez, pagadas en cualquier orden | todas | igual que (c) | | | igual que (c) |
| (e) 4ª propiedad en Support/Premier | 4ª | ninguno | sin factura | error | **No: antes 30%** |
| (e) las 3 primeras al agregar una 4ª | 1ª a 3ª | sin cambio | | | Sí |

Confirmaciones pedidas:

- **(a): confirmado, idéntico.** El bloque nuevo no se ejecuta para Low Price ni Founders.
- **(c) y (d): idénticos para Premier y para la 1ª propiedad en Support. Distintos para la 2ª y 3ª en Support**, que antes se facturaban al 30% y ahora al 28%. Es el mismo bug de Langley, no un efecto secundario: la regla de negocio y la tarjeta dicen 28%. Si en tus pruebas en vivo las 3 propiedades salieron bien, probablemente la 2ª y 3ª eran Premier, o su factura de saldo de Support no se revisó contra el 28%. Si en realidad quieres que Support siga en 30% en ese caso, dímelo y lo limito.
- **(d):** la posición sale de `created_at`, no del orden de pago, así que pagar en otro orden no cambia nada.
- **(e):** agregar una 4ª no cambia la posición de las 3 primeras. Las tarjetas solo ofrecen pago para las 3 primeras, y las cuotas Premier ya rechazaban la 4ª.

---

## Parte 2: el add-on de $100 reduce el saldo

### Cambio aplicado

En `getCompletedUpfrontForProperty()`, antes de sumar, se resuelven las categorías de los servicios de esos pagos y se descartan solo los que tienen un servicio **conocido** con categoría distinta de `plan`.

Siguen contando como pago de plan:

- Pagos sin `service_id`.
- Pagos cuyo servicio no existe o no se puede leer (incluido el caso en que falle la consulta a `services`).
- Pagos cuyo servicio tiene categoría vacía.

Se aplica igual a la suma por propiedad y a la suma de pagos antiguos sin `property_id`. Todos los planes, incluidos los Elite, tienen categoría `plan` en las migraciones, así que no se excluyen.

Como `generateBalanceInvoice()` y `computeNetAmountDueCents()` leen de esta función, ambos quedan corregidos sin tocarlos.

### Antes y después

Propiedades **sin** add-on: los números no cambian. Todos sus pagos one_time son de plan y se suman igual.

Propiedad **con** add-on (Coquitlam, Low Price, $200 de upfront + $100 de add-on). No tengo la renta real de Coquitlam, así que va la fórmula y un ejemplo con $3,000/mes:

| | Antes | Después |
|---|---|---|
| "Ya pagado" que se resta | $300 | $200 |
| Saldo Low Price | 35% × renta − $300 → $750 | 35% × renta − $200 → **$850** |
| Cobro al cambiar a Founders | 30% × renta − $300 → $600 | 30% × renta − $200 → **$700** |

### Revisión de los otros sitios (punto 3)

Ninguno tiene el problema; no se cambió nada.

| Sitio | Resultado |
|---|---|
| `resolvePropertyPlanBalance` | No suma pagos. Calcula renta × % − $200 fijos. |
| Payment History | Busca el pago de plan por categoría `plan`; el saldo viene de `resolvePropertyPlanBalance`. |
| Sales Report | Ya separa el add-on en su propia columna; el saldo viene de `resolvePropertyPlanBalance`. |
| `getBasicTierPlanStatus` | Compara contra los ids de Low Price y Founders; el add-on no coincide. |
| Tarjetas Support/Premier | Usan $200 fijos. |

El add-on se sigue mostrando aparte como hoy.

---

## Hallazgo relacionado, no corregido

**`generateBalanceInvoice()` detecta el plan por dueño, no por propiedad.** Toma el pago de plan más reciente del dueño en cualquier propiedad (paso 3 de la función).

Consecuencia en el caso (b): si el saldo de Coquitlam (Low Price) se factura **después** de que el dueño pagó Support por Langley, la función cree que Coquitlam es Support y cobra 30% en vez de 35%. Esto ya pasaba antes de mis cambios y sigue igual. En tu prueba no se vio porque Coquitlam ya estaba pagada al agregar Langley.

No lo corregí porque pediste el cambio mínimo y este es otro bug. Propuesta, en el mismo archivo y de unas 3 líneas: usar `getPropertyPlanName(propertyId)`, que ya existe y ya usa la ruta de "Tenant signed lease", y dejar la detección actual por dueño como respaldo cuando no devuelva nada (pagos antiguos sin `property_id`).

- Riesgo de aplicarlo: bajo. Para un dueño con 1 propiedad el resultado es el mismo. Cambia solo para dueños con varias propiedades en planes distintos.
- Riesgo de no aplicarlo: una propiedad Low Price o Founders de un dueño que luego compró Support se factura 5 puntos por debajo (Low Price) si su lease se firma después.
