"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export interface FieldMeta {
  field_key: string;
  position: number;
  label: string;
  helper_text: string | null;
  required: boolean;
  is_active: boolean;
}

export type FieldMetaMap = Record<string, FieldMeta>;

const cache: Record<string, FieldMetaMap> = {};
const inflight: Record<string, Promise<FieldMetaMap>> = {};

async function fetchFormMeta(formSlug: string): Promise<FieldMetaMap> {
  if (cache[formSlug]) return cache[formSlug];
  if (inflight[formSlug]) return inflight[formSlug];

  const supabase = createClient();
  inflight[formSlug] = (async () => {
    const { data: forms } = await supabase
      .from("forms_dynamic")
      .select("id")
      .eq("slug", formSlug)
      .maybeSingle();

    if (!forms?.id) {
      cache[formSlug] = {};
      return {};
    }

    const { data: questions } = await supabase
      .from("form_questions")
      .select("field_key, position, label, helper_text, required, is_active")
      .eq("form_id", forms.id)
      .order("position");

    const map: FieldMetaMap = {};
    for (const q of questions || []) {
      map[q.field_key] = q as FieldMeta;
    }
    cache[formSlug] = map;
    return map;
  })();

  try {
    return await inflight[formSlug];
  } finally {
    delete inflight[formSlug];
  }
}

/**
 * Steve 4/28 round 2: admin edits in /admin/forms must affect the
 * actual user-facing forms. This hook lets each production form
 * overlay its hardcoded fields with admin-editable metadata
 * (label, helper text, required, visibility) loaded from the
 * forms_dynamic + form_questions tables.
 *
 * Returns an empty map until loaded — components should fall back
 * to their hardcoded defaults when a field_key is not found.
 */
export function useFormFieldMeta(formSlug: string): FieldMetaMap {
  const [meta, setMeta] = useState<FieldMetaMap>(cache[formSlug] || {});
  useEffect(() => {
    let cancelled = false;
    fetchFormMeta(formSlug).then((m) => {
      if (!cancelled) setMeta(m);
    });
    return () => {
      cancelled = true;
    };
  }, [formSlug]);
  return meta;
}

export function fieldDisplay(meta: FieldMetaMap, fieldKey: string, fallback: { label: string; helper?: string | null; required?: boolean }) {
  const m = meta[fieldKey];
  if (!m) return { ...fallback, hidden: false };
  return {
    label: m.label || fallback.label,
    helper: m.helper_text ?? fallback.helper ?? null,
    required: m.required ?? fallback.required ?? false,
    hidden: m.is_active === false,
  };
}
