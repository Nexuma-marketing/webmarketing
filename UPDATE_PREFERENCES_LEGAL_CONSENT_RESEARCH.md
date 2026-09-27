# Consents Captured At Registration (exact list, storage location)

Registration for Property Owner/Investor happens in **two separate steps**, each capturing a different set of consents.

## Step 1 — Account creation (`/register`, all roles)

File: [src/app/(auth)/register/page.tsx](<src/app/(auth)/register/page.tsx>)

Two checkboxes, required to submit (lines ~61-102, ~268-317):

| Checkbox | Label shown to user |
|---|---|
| `accept_terms` | "I accept the Terms of Service" (links to full text at `/legal/terms`) |
| `accept_privacy` | "I accept the Privacy Policy (PIPA / PIPEDA)" (links to `/legal/privacy`) |

On success, written to `consent_logs` (lines ~147-156):
```ts
logConsents(userId, [
  { type: "terms_of_service", granted: true },
  { type: "privacy_policy", granted: true },
])
```

## Step 2 — Role-specific onboarding (`/forms/propietario`, covers both Owner and Investor — investor status is derived inside this same form from property count, not a separate route)

File: [src/app/forms/propietario/page.tsx](src/app/forms/propietario/page.tsx), schema: `ownerFormSchema` in [src/types/forms.ts:61-84](src/types/forms.ts#L61-L84)

Seven checkboxes, all `z.boolean().refine(v => v === true, ...)` — hard-required, shown in a "Legal Consents" step (~lines 1970-2009), each with a "Read full document" expander of the full legal text:

| Form field key | Checkbox label |
|---|---|
| `consent_image_usage` | "I authorize the use and editing of property images for commercial purposes." |
| `consent_data_processing` | "I accept the rights and privacy declaration." |
| `consent_marketing` | "I consent to electronic communications (CASL)." |
| `consent_third_party` | "I accept the terms and conditions." |
| `consent_legal_representation` | "I authorize legal representation by Nexuma marketing ltd for matters related to marketing and tenant placement." |
| `consent_liability_limitation` | "I accept the limitation of liability outlined in the service agreement." |
| `consent_electronic_signature` | "I consent to use electronic signatures and acknowledge their legal validity." |

**Important gap found (pre-existing, not caused by the Update Preferences flow):** only 4 of these 7 are actually written to `consent_logs` on submit (page.tsx lines ~643-651) — `data_processing`, `image_usage`, `marketing`, `third_party`. The 3 newer consents (`legal_representation`, `liability_limitation`, `electronic_signature`) are validated client-side as required, but **never logged** to `consent_logs`, so there is no audit trail for them today. This is unrelated to Update Preferences but worth knowing since it affects what a "consent audit" can actually reconstruct.

The same 4 logged booleans are also duplicated onto the `discovery_briefs` row (lines ~597-601).

A related but distinct flow, **Add Property** ([src/app/forms/propietario/add-property/page.tsx](src/app/forms/propietario/add-property/page.tsx)), re-asks the same 4 core consents when adding an additional property — but a codebase search confirms it **never calls `logConsents` at all**, a separate, likely-unintentional audit gap on that specific path.

## Storage schema

**`consent_logs`** — created in [supabase/migration_v2_mvp.sql:295-303](supabase/migration_v2_mvp.sql#L295-L303):
```sql
CREATE TABLE IF NOT EXISTS consent_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  consent_type TEXT NOT NULL CHECK (consent_type IN (...)),
  granted BOOLEAN NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  granted_at TIMESTAMPTZ DEFAULT NOW()
);
```
Columns: `id, user_id, consent_type, granted, ip_address, user_agent, granted_at`.

Two properties of this table matter directly for this diagnostic:
- **No `property_id` column.** Consent is captured per-`user_id` (account-level), not per-property/listing. There is no way today to say "this consent covered property X specifically."
- **No `version` column.** There is no link from a `consent_logs` row to which version of the `legal_documents.content` text the user actually saw at that moment. If admin edits the legal text later (`/admin/legal`), historical consent rows become ambiguous about exactly what was agreed to.

The `consent_type` CHECK constraint was widened over time (originally 4 types → tenant types added in [migration_v18](supabase/migration_v18_consent_log_expansion.sql#L19-L44) → `terms_of_service`/`privacy_policy`/the 3 newer owner types added + historical backfill in [migration_v25](supabase/migration_v25_consent_logs_backfill.sql#L31-L61)).

**`legal_documents`** — created in [supabase/migration_v7_milestone3.sql:97-124](supabase/migration_v7_milestone3.sql#L97-L124):
```sql
CREATE TABLE IF NOT EXISTS legal_documents (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  type TEXT NOT NULL UNIQUE,
  content TEXT NOT NULL DEFAULT '',
  version TEXT NOT NULL DEFAULT '1.0',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```
This is the source of the actual legal text shown in the "Read full document" expanders, publicly readable, admin-editable via `/admin/legal`. As noted above, its `version` column is never cross-referenced by `consent_logs`.

`profiles` itself has **no consent columns** — consent booleans live only on `discovery_briefs` (owner/investor) and `tenant_preferences` (tenant), plus the append-only `consent_logs` audit table.

# General Practice: Does Updating Existing Info Require Re-Consent?

*(General practice research only — not a legal opinion. See disclaimer in the Recommendation section.)*

The common distinction drawn in consent-based data protection frameworks (PIPEDA in Canada, GDPR-style guidance more broadly, and typical platform ToS design) is between:

1. **The underlying legal basis for holding and using the data/photos** (e.g., "we may use your property photos for marketing for the duration of the service relationship") — this is what an initial consent typically covers, and it is standard practice for that consent to **remain valid for the life of the relationship** without needing to be re-clicked every time the customer edits a record, as long as:
   - the *purpose* of use hasn't changed from what was originally disclosed,
   - the *scope* of what's covered hasn't materially expanded, and
   - the consent language itself said (or reasonably implied) it covers ongoing/future updates, not just the specific data present at signup.

2. **A materially new or different use** that wasn't covered by the original disclosure — this is the case where re-confirmation is generally expected, e.g., a new purpose (say, sharing data with a new category of third party), a new/expanded audience, or a document version change that alters what the customer is actually agreeing to.

Editing a property's own address/rent/details under "Update Preferences" is squarely category 1: it's the same customer, same property, same purpose (managing their own listing), and doesn't invoke any new legal basis. General practice does **not** require re-showing ToS/Privacy/data-processing checkboxes for this kind of routine self-service edit — that would be normal SaaS behavior. This matches how the codebase already treats it: `propertyEditSchema` explicitly `.omit()`s the 4 core consent fields with the comment *"the one-time legal consents, which were already captured at registration"* ([src/types/forms.ts:157-166](src/types/forms.ts#L157-L166)).

Photo re-upload during that same edit is a closer call and is addressed specifically in the next section, since it's the one piece of "Update Preferences" that plausibly *does* generate new content the original consent may not have contemplated.

# Any Consent Type That Warrants Special Attention For This Flow

Yes — **`consent_image_usage`** ("Image Usage & Editing Authorization") stands apart from the others for this specific flow, for a few concrete reasons found in the code:

1. **It's already a distinct, dedicated consent type in this product's own design** — not folded into the generic Terms & Conditions (`consent_third_party`) or the account-level Terms of Service. The product itself has already decided image usage deserves its own separate legal grant, separately required and separately logged at registration. That product decision is the strongest signal for why it deserves separate consideration here too — the other consents (data processing, marketing, third-party terms, liability, e-signature, legal representation) are about the *relationship/service* in the abstract, and don't change meaning when a property's rent or address is edited. Image usage is different: it's a grant to use *specific media*, and "Update Preferences" → "Manage Photos" ([src/app/(dashboard)/dashboard/images/page.tsx](<src/app/(dashboard)/dashboard/images/page.tsx>)) is precisely where **new** media enters the system after the original consent was given.

2. **The consent is account-scoped, not property- or photo-scoped, in storage** — `consent_logs` has no `property_id` and no linkage to specific uploaded images. So today, one `image_usage` grant from registration is treated as covering *all* photos the owner ever uploads for *any* of their properties, indefinitely, with no re-affirmation when a new batch of photos is swapped in later. Whether that's *legally* sufficient depends on how the original consent text is worded (see next point) — but it's worth knowing that's the actual mechanism today, since it's easy to assume (incorrectly) that each photo upload is separately covered.

3. **The registration text itself already anticipates an ongoing relationship**, per the agent's research into the seeded `legal_documents` content: it states the authorization covers use/reproduction/editing/publishing of photos "for the duration of the service agreement" with a 30-day written revocation notice — i.e., the text was written to be durable across the relationship, not a one-time snapshot grant. That's a meaningful point in favor of "no re-consent needed on ordinary photo updates," *if* that's the actual, current, admin-edited text (see point 4).

4. **The version-tracking gap compounds specifically here.** Because `consent_logs` has no `version` column, if the `legal_documents` "Image Usage" text is ever edited by an admin after a given owner registered, there is no way to know whether that owner's original consent still matches the current wording. This is a general gap (affects every consent type), but it matters most for image usage precisely because this is the one type where *new content* (new photos) keeps getting added under that original grant indefinitely — the durability argument in point 3 only holds if the text an owner actually agreed to is knowable and hasn't silently changed underneath them.

None of the other 6 owner consents have this "new content keeps arriving under an old grant" property — they're all about the terms of the service relationship itself, which the current one-time-at-registration model fits comfortably.

# Recommendation (with explicit disclaimer this is not legal advice)

**Disclaimer:** This is product/engineering research based on general data-protection practice patterns and a read of this codebase's own existing design choices — it is **not legal advice**, and Alex should have a lawyer confirm this for the actual PIPEDA/PIPA/CASL exposure before relying on it, especially since the actual enforceability turns on the exact wording of the `legal_documents` text (which I did not review in full for compliance) and on facts outside this codebase (e.g., what was actually presented to which cohort of users historically).

With that said, based on what's implemented today:

- **Routine property-detail edits** (address, rent, description, etc.) via "Update Preferences" not requiring re-consent is consistent with how this kind of one-time-consent-for-ongoing-relationship model is normally built, and matches what the code already does deliberately (the `propertyEditSchema.omit()` with its own comment). No change appears warranted here on legal-safety grounds alone.
- **Photo re-uploads specifically** are the one part of this flow worth a closer, deliberate look — not necessarily because the current approach is wrong, but because:
  - it's the one place genuinely *new* content is introduced after the original grant, and
  - the underlying consent record has no way to prove *which* text version was agreed to, or that it covers photos added months/years later.
  - A low-risk, non-breaking hardening (if a lawyer agrees it's warranted) would be something like: confirming the current "Image Usage" legal text explicitly and unambiguously covers *future* photo uploads for the *life of the account* (not just "photos submitted at signup"), and/or adding a lightweight, one-time re-affirmation the first time an owner uploads photos through `/dashboard/images` if the legal text has since changed — but that is a design decision for Alex and counsel, not something inferred as necessary from the code alone.
- Separately from the Update Preferences question, this research surfaced two **pre-existing audit-trail gaps** worth flagging to Alex regardless of what's decided here: (1) 3 of the 7 registration consents (`legal_representation`, `liability_limitation`, `electronic_signature`) are required at signup but never written to `consent_logs`, and (2) the Add Property flow re-asks consents but never logs them at all. Neither is caused by, or specific to, Update Preferences, but both would matter to any broader consent-compliance review.
