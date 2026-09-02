-- Payback uses the portfolio one-time fee divided by monthly CFP.
-- Corrects values persisted before the calculation used the recurring fee.
UPDATE public.properties
SET payback_months = CASE elite_tier
  WHEN 'essentials' THEN 900 / NULLIF(cfp_monthly, 0)
  WHEN 'signature' THEN 1410 / NULLIF(cfp_monthly, 0)
  WHEN 'lujo' THEN 1650 / NULLIF(cfp_monthly, 0)
  ELSE payback_months
END
WHERE elite_tier IN ('essentials', 'signature', 'lujo')
  AND cfp_monthly > 0;
