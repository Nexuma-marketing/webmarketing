-- Investor service assignment corrections: Elite fee descriptions only.
-- No schema changes and no changes to Stripe checkout behavior.

UPDATE services
SET description =
  'Elite Assets & Legacy — Asset Management, Essentials. For properties with monthly rent from $2,500 to $3,999 CAD. One-time fee: $900 per property. Monthly maintenance fee: $200 per property.'
WHERE name = 'Plan: Elite — Essentials';

UPDATE services
SET description =
  'Elite Assets & Legacy — Asset Management, Signature. For properties with monthly rent from $4,000 to $7,000 CAD. One-time fee: $1,410 per property. Monthly maintenance fee: $200 per property.'
WHERE name = 'Plan: Elite — Signature';

UPDATE services
SET description =
  'Elite Assets & Legacy — Asset Management, Lujo. For properties with monthly rent of $7,001 CAD or more. One-time fee: $1,650 per property. Monthly maintenance fee: $300 per property.'
WHERE name = 'Plan: Elite — Lujo';
