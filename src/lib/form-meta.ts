"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export interface FieldOption {
  value: string;
  label: string;
}

export interface FieldMeta {
  field_key: string;
  position: number;
  label: string;
  helper_text: string | null;
  required: boolean;
  is_active: boolean;
  // Steve 5/5: also surface options so admin edits to dropdown
  // choices propagate to the public forms.
  options: FieldOption[] | null;
}

export type FieldMetaMap = Record<string, FieldMeta>;

const cache: Record<string, FieldMetaMap> = {};
const inflight: Record<string, Promise<FieldMetaMap>> = {};

async function fetchFormMeta(formSlug: string): Promise<FieldMetaMap> {
  const cached = cache[formSlug];
  if (cached) return cached;
  const pending = inflight[formSlug];
  if (pending) return pending;

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
      .select("field_key, position, label, helper_text, required, is_active, options")
      .eq("form_id", forms.id)
      .order("position");

    const map: FieldMetaMap = {};
    for (const q of questions || []) {
      const raw = (q as { options?: unknown }).options;
      let parsedOptions: FieldOption[] | null = null;
      if (Array.isArray(raw)) {
        // Steve 5/7: defensively skip blank rows that may have leaked
        // into form_questions.options before saveQuestion() was hardened
        // (admin "Add option" + Save without typing anything used to
        // persist a {value:"", label:""} row, which then rendered as an
        // unlabelled checkbox on the public form).
        parsedOptions = (raw as unknown[])
          .map((o) => {
            if (typeof o === "string") {
              const trimmed = o.trim();
              return trimmed ? { value: trimmed, label: trimmed } : null;
            }
            const oo = o as { value?: unknown; label?: unknown };
            if (typeof oo.value === "string" && typeof oo.label === "string") {
              const v = oo.value.trim();
              const l = oo.label.trim();
              if (!v && !l) return null;
              return { value: v || l, label: l || v };
            }
            return null;
          })
          .filter((x): x is FieldOption => x !== null);
        if (parsedOptions.length === 0) parsedOptions = null;
      }
      map[q.field_key] = {
        field_key: q.field_key,
        position: q.position,
        label: q.label,
        helper_text: q.helper_text,
        required: q.required,
        is_active: q.is_active,
        options: parsedOptions,
      };
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

/**
 * Steve 5/5 deep-fix: when admin edits the dropdown options of a
 * select field in /admin/forms, those edits must show in the public
 * form. This helper returns the admin-defined options when present,
 * otherwise the hardcoded fallback the form file ships with.
 *
 * Accepts either a plain string array (legacy "Bedroom 2" style) or
 * a {value,label}[] array. Always returns {value,label}[] so callers
 * can render a single shape.
 */
export function fieldOptions(
  meta: FieldMetaMap,
  fieldKey: string,
  fallback: ReadonlyArray<string | { value: string; label: string } | { value: number; label: string }>,
): FieldOption[] {
  const m = meta[fieldKey];
  if (m?.options && m.options.length > 0) return m.options;
  return fallback.map((o) => {
    if (typeof o === "string") return { value: o, label: o };
    return { value: String(o.value), label: o.label };
  });
}
