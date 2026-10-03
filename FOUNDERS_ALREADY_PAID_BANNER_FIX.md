# Founders / Low Price: estado "ya pagado" compartido + banner de éxito de Founders

## Problema

`alreadyPaid` se calculaba **por plan**: cada tarjeta revisaba
`paidServiceKeys.has("<propertyId>:<serviceId del plan>")`. Low Price y
Founders son dos alternativas del mismo nivel base para una misma
propiedad (mismo upfront de $200, 35% vs 30% final). Por eso, si el
cliente pagaba Founders, la tarjeta de Low Price seguía mostrando
"Pay $200 CAD upfront", lo que permitía un cobro duplicado (y al revés).

## Lógica compartida de `alreadyPaid`

Nuevo helper en `src/lib/payment-lookup.ts`:

```ts
getBasicTierPlanStatus(paidServiceKeys, propertyId, { lowPriceServiceId, foundersServiceId })
  → { alreadyPaid: boolean; activePlan: "founders" | "low_price" | null }
```

- `alreadyPaid` = la propiedad tiene un pago completado de Low Price **o** de Founders.
- `activePlan` = `"founders"` si existe un pago de Founders (gana aunque también
  haya uno de Low Price, porque Founders después de Low Price es un upgrade),
  si no `"low_price"`, si no `null`.
- Usa el mismo `paidServiceKeys` que cada página ya construye con
  `getCompletedPaymentKeysForProperties`, así que no agrega consultas y
  conserva el fallback para pagos legacy con `property_id = null`.
- También se exportan las constantes `LOW_PRICE_SERVICE_NAME` y
  `FOUNDERS_SERVICE_NAME`, para no repetir los nombres de servicio escritos a mano.

Todas las tarjetas de Low Price y Founders (Dashboard home y Services)
ahora pasan `alreadyPaid={basicPlanStatus.alreadyPaid}`. Si se pagó
cualquiera de los dos, ambas tarjetas muestran el estado de pagado.

## Nuevo diseño cuando Founders es el plan activo

Solo aplica cuando `activePlan === "founders"` y el usuario es Property
Owner (no Investor):

1. **`FoundersActivePlanCard`** (nuevo). Tarjeta con borde verde y un banner
   verde suave: *"Well done! You're now saving money with Founders — your
   new total is $XXX.XX CAD"*, con el total real (30% de la renta de la
   propiedad). Debajo dice cuánto ahorra frente a Low Price, el badge
   "Active plan", los términos de Founders y el link
   "Deposit paid ✓ — View balance".
2. **Low Price atenuado debajo.** `PrimaryPlanPricingCard` acepta una nueva
   prop `notSelectedNote`. Cuando se pasa, la tarjeta se ve con borde y
   texto gris claro, sin botón ni checkbox de add-on, y con la nota
   *"Not selected — you're saving with Founders"*.
3. **Ubicación**
   - Tier `basic` (Dashboard home → "Your Service Tier"; Services → "Your
     Service"): primero la tarjeta de éxito de Founders y debajo Low Price
     atenuado. En esa misma página se oculta el banner de urgencia de
     Founders ("Only X spots left — Hurry!"), porque ya no aplica.
   - Otros casos de Property Owner donde aparece el banner de Founders
     (tier `preferred_owners` o sin tier asignado): la tarjeta de éxito
     reemplaza al banner de urgencia. Ahí no hay tarjeta de Low Price con
     la cual comparar.
4. **Si el plan pagado es Low Price**, se mantiene el comportamiento
   simple: "Deposit paid ✓ — View balance" en ambas tarjetas, sin banner
   de comparación.

Además, en Services el bloque de saldo pendiente (`PropertyBalanceSummary`)
para tier `basic` ahora usa `activePlan`. Antes elegía Low Price primero;
ahora Founders tiene prioridad cuando existen ambos pagos, así que el
saldo mostrado usa el 30% y no el 35%.

## Archivos cambiados

| Archivo | Cambio |
|---|---|
| `src/lib/payment-lookup.ts` | `getBasicTierPlanStatus`, `BasicTierPlanStatus`, `LOW_PRICE_SERVICE_NAME`, `FOUNDERS_SERVICE_NAME` |
| `src/components/dashboard/paid-or-checkout.tsx` | Se extrajo `AlreadyPaidLink` (mismo markup) para reutilizarlo; `PaidOrCheckout` lo usa |
| `src/components/dashboard/founders-active-plan-card.tsx` | **Nuevo**: tarjeta de Founders activo con banner de éxito |
| `src/components/dashboard/primary-plan-pricing-card.tsx` | Nueva prop `notSelectedNote` (modo atenuado, sin botón) |
| `src/app/(dashboard)/dashboard/page.tsx` | Dashboard home: `alreadyPaid` compartido, tarjeta de éxito + Low Price atenuado, banner de urgencia oculto con Founders activo. Ahora siempre se cargan los servicios Low Price y Founders |
| `src/app/(dashboard)/dashboard/services/page.tsx` | Services: lo mismo en "Your Service" y en las dos instancias del banner de Founders (con tier / sin tier), además de la prioridad de Founders en el resumen de saldo |

## PYME

**PYME no tiene la alternativa Low Price / Founders.** Sus planes
(`PYMES_PLANS` en `src/lib/constants.ts`) son Rescue / Growth / Scale.
Usan un solo plan recomendado por usuario, cobrado por
`type: "pymes_upfront"` y con la clave usuario + `pymes_plan_id`. Ni
Founders ni Low Price existen para ese rol. Por eso **no se cambió nada
en PYME** (`pymes-plan-card.tsx` queda igual). Investor tampoco cambia:
todo el código nuevo depende de `isOwnerNotInvestor`.

## Notas / trade-offs a considerar

- **Upgrade Low Price → Founders desde la UI.** Como se pidió ("y
  viceversa"), si el cliente pagó Low Price, la tarjeta de Founders ahora
  muestra "Deposit paid ✓". Así se bloquea el camino de upgrade con netting
  (`netAgainstExisting`, PROMPT2 item 8) desde esa tarjeta para un cliente
  que ya pagó Low Price en esa propiedad. Si se quiere permitir ese upgrade,
  el banner de Founders debería volver a mostrar el botón de checkout (con
  netting) cuando `activePlan === "low_price"`. Es un cambio de una línea en
  los tres lugares que renderizan `FoundersBanner`.
- **No hay protección del lado del servidor.** `src/app/api/stripe/checkout/route.ts`
  no rechaza un segundo checkout de Low Price si la propiedad ya tiene
  Low Price o Founders pagado. Este fix cierra el problema en la UI, pero un
  POST directo al endpoint todavía podría crear un cobro duplicado. Se
  recomienda, como follow-up, agregar en esa ruta un 409 cuando
  `serviceId` sea Low Price o Founders, no venga `netAgainstExisting` y
  `getBasicTierPlanStatus(...).alreadyPaid` sea `true`.
- No se ejecutaron `npm install` ni `npm run build`, según lo solicitado.
