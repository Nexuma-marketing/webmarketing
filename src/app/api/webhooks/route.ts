import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * External webhook endpoint for Make/Zapier integration.
 * Secured with x-api-key header.
 */
export async function POST(request: Request) {
  const apiKey = request.headers.get("x-api-key");

  if (!apiKey || apiKey !== process.env.WEBHOOK_API_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { event, data } = await request.json();

    switch (event) {
      case "lead.created": {
        if (data?.email) {
          await supabaseAdmin.from("leads").insert({
            full_name: data.full_name || "External Lead",
            email: data.email,
            phone: data.phone || null,
            role: data.role || null,
            source: data.source || "webhook",
            status: "nuevo",
            notes: data.notes || null,
          });
        }
        break;
      }

      case "lead.updated": {
        if (data?.id && data?.status) {
          await supabaseAdmin
            .from("leads")
            .update({ status: data.status, notes: data.notes || undefined })
            .eq("id", data.id);
        }
        break;
      }

      case "payment.completed": {
        // Log external payment events
        if (data?.user_id) {
          await supabaseAdmin.from("payments").insert({
            user_id: data.user_id,
            amount: data.amount || 0,
            currency: data.currency || "CAD",
            payment_type: data.payment_type || "external",
            status: "completed",
            stripe_session_id: data.reference_id || `ext_${Date.now()}`,
          });
        }
        break;
      }

      case "user.registered":
      case "diagnosis.completed":
        // Acknowledge but no action needed — these are outbound events
        break;

      default:
        return NextResponse.json(
          { error: `Unknown event: ${event}` },
          { status: 400 }
        );
    }

    return NextResponse.json({ received: true, event });
  } catch (err) {
    console.error("External webhook error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
