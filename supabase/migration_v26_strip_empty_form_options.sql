-- ============================================================
-- Migration v26 - strip empty rows from form_questions.options
-- ============================================================
-- Steve 5/7 (Test E2E #1 spinoff): the propietario form rendered an
-- unlabelled 9th checkbox for "objectives" because an empty option
-- row had been persisted into form_questions.options. Root cause was
-- /admin/forms saveQuestion() saving the entire options array
-- including any half-typed {"value":"","label":""} entry that admin
-- had clicked "Add option" for but never filled in.
--
-- The companion code commit hardens saveQuestion() so this cannot
-- happen again. This migration scrubs any blank rows that already
-- leaked into the table.
--
-- Idempotent: each pass produces the same result.
-- ============================================================

UPDATE form_questions
SET options = (
  SELECT jsonb_agg(elem)
  FROM jsonb_array_elements(options) elem
  WHERE
    -- Keep entries with a non-empty value OR non-empty label.
    -- Strip {value:"", label:""} and trimmed equivalents.
    NULLIF(BTRIM(COALESCE(elem ->> 'value', '')), '') IS NOT NULL
    OR NULLIF(BTRIM(COALESCE(elem ->> 'label', '')), '') IS NOT NULL
)
WHERE options IS NOT NULL
  AND jsonb_typeof(options) = 'array'
  AND EXISTS (
    -- Only touch rows that actually contain a blank entry, so
    -- updated_at does not bump on every cleanup run.
    SELECT 1 FROM jsonb_array_elements(options) elem
    WHERE
      NULLIF(BTRIM(COALESCE(elem ->> 'value', '')), '') IS NULL
      AND NULLIF(BTRIM(COALESCE(elem ->> 'label', '')), '') IS NULL
  );

-- Verification:
-- SELECT field_key, jsonb_array_length(options) FROM form_questions
-- WHERE options IS NOT NULL ORDER BY field_key;
