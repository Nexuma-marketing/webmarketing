import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  profileOwner,
  profileTenant,
  matchPropertiesForTenant,
} from "@/lib/profiling";

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { type } = await request.json();

    switch (type) {
      case "owner": {
        const result = await profileOwner(user.id);
        if (!result) {
          return NextResponse.json(
            { error: "No properties found" },
            { status: 400 }
          );
        }
        return NextResponse.json({ success: true, ...result });
      }

      case "tenant": {
        const result = await profileTenant(user.id);
        if (!result) {
          return NextResponse.json(
            { error: "No tenant preferences found" },
            { status: 400 }
          );
        }
        // Also run property matching
        const matched = await matchPropertiesForTenant(user.id);
        return NextResponse.json({
          success: true,
          ...result,
          matchedProperties: matched.length,
        });
      }

      case "pymes": {
        // PYMES profiling is already done during form submission
        // (score calculation + plan assignment happens inline)
        // This endpoint just returns the latest diagnosis
        const { data: diagnosis } = await supabase
          .from("pymes_diagnosis")
          .select("total_score, urgency_level, estimated_loss, recommended_plan")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .single();

        if (!diagnosis) {
          return NextResponse.json(
            { error: "No diagnosis found" },
            { status: 400 }
          );
        }

        return NextResponse.json({ success: true, ...diagnosis });
      }

      default:
        return NextResponse.json(
          { error: "Invalid type. Use: owner, tenant, or pymes" },
          { status: 400 }
        );
    }
  } catch (err) {
    console.error("Profiling error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
