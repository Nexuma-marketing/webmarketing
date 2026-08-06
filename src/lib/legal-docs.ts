"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

// Steve 5/6: admin edits to /admin/legal (legal_documents.content) were
// not appearing on the public propietario / inquilino consent screens
// because the form pages held the consent text in a hardcoded
// LEGAL_DOCS constant. This hook fetches the latest content per type
// from the DB so the public form mirrors what the admin sees.
//
// Field naming convention:
//   - form field key: "consent_image_usage", "consent_data_processing", ...
//   - legal_documents.type matches one-to-one (same prefix included).
//
// Returns an "overlay" object the page can merge over its hardcoded
// fallbacks: legalDocsFromDb[fieldKey]?.text || LEGAL_DOCS[fieldKey].text

export interface LegalDocOverlay {
  title?: string;
  text: string;
  // Steve 5/11: surface the DB timestamp on the public form so the
  // client can confirm at a glance whether their admin edit has
  // propagated — the May 11 docx complaint "admin edits not reflected"
  // was impossible to diagnose without seeing when the row was last
  // touched.
  updatedAt?: string;
}

export function useLegalDocsOverlay(types: readonly string[]) {
  const [overlay, setOverlay] = useState<Record<string, LegalDocOverlay>>({});

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("legal_documents")
        .select("type, content, updated_at")
        .in("type", types as string[]);
      if (cancelled || !data) return;
      const next: Record<string, LegalDocOverlay> = {};
      for (const row of data) {
        if (row.type && row.content) {
          next[row.type] = {
            text: row.content,
            updatedAt: row.updated_at as string | undefined,
          };
        }
      }
      setOverlay(next);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [types.join("|")]);

  return overlay;
}
