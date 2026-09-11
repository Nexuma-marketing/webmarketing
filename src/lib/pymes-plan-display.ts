import { PYMES_PLANS } from "@/lib/constants";
import type { SupabaseClient } from "@supabase/supabase-js";

export type PymesPlanDetails = (typeof PYMES_PLANS)[string];

export interface PymesPlanInfo {
  pymesPlan: string | null;
  pymesPlanDetails: PymesPlanDetails | null;
  pymesPlanRecord: { id: string } | null;
  pymesScore: number | null;
  pymesUrgency: string | null;
  pymesLoss: number | null;
}

// Steve — PYME dashboard/services UX fix: this is the single source of
// truth both /dashboard and /dashboard/services use to resolve a PYMES
// customer's recommended plan (with admin overrides applied) and the
// pymes_plans row id needed to render a working checkout button. Having
// one function means both pages render identical plan content instead of
// drifting the way the "Start Now" button (dashboard) and "Pay $X CAD
// upfront" button (services) previously did.
export async function getPymesPlanForUser(
  supabase: SupabaseClient,
  userId: string,
): Promise<PymesPlanInfo> {
  const { data: diagnosis } = await supabase
    .from("pymes_diagnosis")
    .select("recommended_plan, total_score, urgency_level, estimated_loss")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  const pymesPlan = diagnosis?.recommended_plan || null;
  const pymesScore = diagnosis?.total_score ?? null;
  const pymesUrgency = diagnosis?.urgency_level ?? null;
  const pymesLoss = diagnosis?.estimated_loss ? Number(diagnosis.estimated_loss) : null;

  if (!pymesPlan) {
    return {
      pymesPlan: null,
      pymesPlanDetails: null,
      pymesPlanRecord: null,
      pymesScore,
      pymesUrgency,
      pymesLoss,
    };
  }

  const baseDetails = PYMES_PLANS[pymesPlan] || null;

  const [{ data: planRecord }, { data: overrideRows }] = await Promise.all([
    supabase
      .from("pymes_plans")
      .select("id")
      .eq("plan_type", pymesPlan)
      .eq("is_active", true)
      .limit(1)
      .single(),
    supabase
      .from("app_config")
      .select("key, value")
      .eq("category", `plan_features:pymes_${pymesPlan}`),
  ]);

  let pymesPlanDetails = baseDetails;
  if (baseDetails && overrideRows && overrideRows.length > 0) {
    const tagline = overrideRows.find((r) => r.key === "tagline")?.value as string | undefined;
    const featuresRaw = overrideRows.find((r) => r.key === "features")?.value as string | undefined;
    pymesPlanDetails = {
      ...baseDetails,
      tagline: tagline ?? baseDetails.tagline,
      features: featuresRaw
        ? featuresRaw.split("\n").map((f) => f.trim()).filter(Boolean)
        : baseDetails.features,
    };
  }

  return {
    pymesPlan,
    pymesPlanDetails,
    pymesPlanRecord: planRecord ? { id: planRecord.id } : null,
    pymesScore,
    pymesUrgency,
    pymesLoss,
  };
}
