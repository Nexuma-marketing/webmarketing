# Milestone 4 — Final Business Decisions

**Source**: Alex Sanabria (client), message dated 2026-05-20.
**Purpose**: Canonical reference for all business decisions made during Milestone 4 finalization. Code, migrations, and configuration in this repo should match what's documented here. If you change any of these later, update this file in the same commit.

---

## 1. Domain

| Item | Decision |
|------|----------|
| Domain provider | **Cloudflare** (registered there directly) |
| Domain | `nexuma.ca` |
| DNS access | Client has full admin login |
| Current state of `nexuma.ca` | Empty — no web page, no redirects |
| Target deployment | **Root domain `nexuma.ca`** (NOT a subdomain like `app.nexuma.ca`) |
| Setup target | Monday 2026-05-25 session — connect Vercel directly to root |

Note: Vercel root-domain setup requires `A` records pointing at `76.76.21.21` and/or `AAAA` record. Cloudflare proxy (orange cloud) must be **disabled** during initial verification, then optionally re-enabled.

---

## 2. Tax handling

| Item | Decision |
|------|----------|
| Mode | **Tax-exclusive** — prices shown DO NOT include tax; Stripe adds at checkout |
| Rate | **5% GST** (Canada federal, marketing services) |
| Stripe Tax setup | Already configured by client at Stripe account level (marketing services product class) |
| GST registration number | **NOT YET ISSUED** — client is applying with CRA |
| GST number on receipts | **Leave blank/disabled** for now; client will add to Stripe Dashboard once CRA assigns |

Code state: `automatic_tax: { enabled: true }`, `billing_address_collection: 'required'`, `tax_behavior: 'exclusive'` on all checkout sessions + recurring prices. Already deployed in commit `f0d951d`.

---

## 3. Refund policy

**Decision**: **NO REFUNDS** (Final Sale) once service starts or first marketing assets are delivered.

**Exact text approved by client** (Spanish, must appear at checkout and in Terms of Service):

> Debido a la naturaleza personalizada de nuestros servicios de marketing y consultoría, todas las ventas son definitivas. No se otorgan reembolsos totales ni parciales una vez iniciado el periodo mensual de servicio o tras la entrega de los primeros activos de marketing.

**Implementation notes**:
- Display this text on the checkout button area before user clicks "Pay"
- Add to Terms of Service (`legal_documents.terms_of_service`)
- Admin can still issue refunds via `/admin/payments` Refund button — but it's reserved for exceptional cases (fraud disputes, technical errors), not standard policy

---

## 4. Cancellation policy (monthly plans — both Residencial and Empresarial)

| Question | Decision |
|----------|----------|
| Customer cancels mid-month — service stops immediately? | **No** |
| Service continues until end of current billing cycle (already paid)? | **Yes** |
| Prorated refund for unused days? | **No** (no prorated refunds) |
| Auto-cancellation at end of cycle? | **Yes** — Stripe stops charging on the next cycle |

**Implementation**: Use Stripe's `cancel_at_period_end: true` flag instead of immediate `subscriptions.cancel()`. Customer keeps access until `current_period_end`, then subscription auto-cancels and stops charging.

---

## 5. Final pricing (production)

### Basic tier (1 property)

| Plan | Upfront | + | Description |
|------|---------|---|-------------|
| **Low Price** | $200 | + 35% of monthly rent | One-time. $200 deducted from the 35%. |
| **Founders Package** | $200 | + 30% of monthly rent | One-time. $200 deducted from the 30%. **Limited to first 20 owners only.** |

**Founders counter starts at: `0`** (real launch — no marketing inflation).

### Preferred Owner tier (2–3 properties)

#### Support Tier
| Property # | Upfront | + | % of rent |
|-----------|---------|---|-----------|
| 1st property | $200 | + | 30% (one-time, $200 deducted from 30%) |
| 2nd, 3rd properties | $200 | + | 28% per property (one-time, $200 deducted from 28%) |

#### Premier Tier (1.5+ year contract required)
| Property # | Upfront | + | % of rent | Payment schedule |
|-----------|---------|---|-----------|------------------|
| 1st property | $200 maintenance fee | + | 30% | Rest collected 2 months after tenant signs |
| 2nd, 3rd properties | $200 maintenance fee | + | 28% per property | 50% at month 1, 30% at month 2, 20% at month 3 |

### Elite Assets & Legacy tier (4+ properties)

| Portfolio | Rent range (CAD/mo) | One-time per property | Monthly portfolio fee |
|-----------|---------------------|----------------------|----------------------|
| **Essentials** | $2,500 – $3,999 | $900 | $100/month |
| **Signature** | $4,000 – $7,000 | $1,410 | $100/month |
| **Lujo** | $7,001 – **$12,000** | $1,650 | $300/month |

Note: Lujo cap is **$12,000** (per client). Previous code said "$7,001+" — needs description update if upper bound matters.

### PYMES (business plans)

| Plan | Price |
|------|-------|
| Rescue | $1,500 |
| Growth | $2,500 |
| Scale | $3,800 |

---

## 6. Email automation

**Decision**: Send automatic emails on every payment event to **BOTH**:
- Customer (the buyer)
- Commercial team (internal — uses `COMMERCIAL_AREA_EMAIL` env var)

Events:
- Receipt (after successful checkout)
- Refund confirmation (after admin issues refund)
- Subscription cancellation confirmation (when user/admin cancels installments)
- Failed recurring payment alert (when monthly charge fails)

Customer copy is already in `src/lib/email.ts` (commit `f0d951d`). Needs internal CC added.

---

## 7. Test accounts to delete before production launch

**20 emails to remove from `profiles` (and CASCADE to all related data)**:

```
alexsmarke@gmail.com
jacreingenieria@gmail.com
jalexss2025@gmail.com
pdf0jacreingenieria@gmail.com
Permi@gmail.com
produccionulf@gmail.com
e2e4test@gmail.com
owner-test-422b@test.com
tenant422@test.com
investor-test-422@test.com
test@gmail.com
investor-test@example.com
tony-test-nonadmin@example.com
pepe@hotmail.com
johnsontakashi4522@gmail.com
johnsontakashi45@gmail.com
aupwork00@gmail.com
test@example.com
verify@test.com
admin@nexuma.ca   ← Steve's dev admin (intentional — project handover)
```

**Effect**: After this cleanup, only the client's account (`alexsanabria33@hotmail.com`) will have admin role. CASCADE deletes will also remove these accounts' properties, leads, consent_logs, payments, tenant_preferences, discovery_briefs.

**Migration**: `supabase/migration_v32_purge_test_accounts.sql` — written but **NOT auto-run**. Client should review and execute manually after final confirmation.

### Follow-up — auth.users orphans (2026-05-20 docx feedback)

After v32 ran, client reported in `20 May 26 Observaciones desarrollo Steve.docx`:

> "si entro con uno correo de esos, me dice que el perfil aun existe"

Cause: v32 only deletes from `profiles`. The matching `auth.users` rows remain because there is no FK from `auth.users` → `profiles` to drive a CASCADE. Supabase treats an existing `auth.users` row as a registered account, so re-signup with that email is blocked even though the profile is gone.

**Resolution**: `supabase/migration_v33_purge_auth_users.sql` — `DELETE FROM auth.users WHERE LOWER(email) IN (...)` for the same 20 emails. Must be run by `postgres` / `service_role` from the Supabase SQL Editor. After v33 runs the emails are fully free for fresh test signups.

---

## 8. Handover documentation (2026-05-20 docx feedback)

Client also requested a full handover manual covering tech stack, repo structure, how to manage pricing, architecture, Supabase data dictionary, environment variables, deployment, and operations.

**Delivered**: `HANDOVER_MANUAL.md` at repo root — single canonical reference covering all of the above. Update it in the same commit whenever architecture, env vars, or operational procedures change.

---

## Items still needing answers (not addressed in client's 2026-05-20 reply)

- Logo URL (PNG/SVG, ~256×256, transparent background)
- Favicon URL (32×32 ICO/PNG)
- Hero image replacement (currently Unsplash stock)
- Real testimonials (currently 3 Unsplash placeholders)
- "Schedule My Session" button destination (Calendly URL?)
- Legal review status of Privacy Policy / Terms of Service / Cookie Policy / 14 consent texts
- Optional integrations:
  - Make/Zapier (needs `WEBHOOK_API_KEY` if used)
  - Google Analytics / Plausible
  - Sentry error tracking
  - Cookie consent banner (PIPEDA strict? GDPR if EU customers?)
  - Live chat / WhatsApp widget
- Supabase `service_role` key verification (Vercel "Needs Attention" warning)
- Stripe Live Mode activation data (legal name, incorporation #, address, bank, SIN)
