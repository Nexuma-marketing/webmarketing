import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendContactNotification } from "@/lib/email";

const ALLOWED_ROLES = new Set([
  "propietario",
  "propietario_preferido",
  "inversionista",
  "inquilino",
  "inquilino_premium",
  "pymes",
]);

// Steve 4/30 #2: contact-form leads landed in /admin/leads with role=NULL,
// so the Pymes / Owner / Tenant role filter excluded them. The form now
// passes a `role` field; this helper falls back to a keyword scan over the
// subject so older flows still classify reasonably.
// Steve 5/2: extended Spanish coverage. "inversionista" / "comercial"
// were slipping through because the prior \binversion\b boundary
// rejected the Spanish noun and "comercial" had no mapping at all.
function inferRoleFromSubject(subject: string): string | null {
  const s = subject.toLowerCase();
  if (/\btenant\b|\binquilino\b|rent a |apartment|arrend/.test(s)) return "inquilino";
  if (/\blandlord\b|\bpropietario\b|my property|my unit|propiedad/.test(s)) return "propietario";
  if (/\bbusiness\b|\bempresa\b|\bpyme\b|\bcomercial\b|small business|my company|negocio|comercio/.test(s)) return "pymes";
  if (/\binvestor\b|\binversion|portfolio|\binversor\b|portafolio/.test(s)) return "inversionista";
  return null;
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const name = formData.get("name") as string;
    const phone = formData.get("phone") as string;
    const email = formData.get("email") as string;
    const subject = formData.get("subject") as string;
    const explicitRole = (formData.get("role") as string | null)?.trim() || null;

    if (!name || !email || !subject) {
      return NextResponse.json(
        { error: "Name, email and subject are required" },
        { status: 400 }
      );
    }

    const role =
      explicitRole && ALLOWED_ROLES.has(explicitRole)
        ? explicitRole
        : inferRoleFromSubject(subject);

    const supabase = await createClient();

    // Save as lead with source "contact_form"
    await supabase.from("leads").insert({
      full_name: name,
      email,
      phone: phone || null,
      role,
      source: "contact_form",
      status: "nuevo",
      notes: subject,
    });

    // Steve 5/7: previously this fired-and-forgot the email and
    // ALWAYS redirected to ?contact=success even when Resend silently
    // swallowed the message. Now we await the result so the user only
    // sees "success" when the email actually went out. If delivery is
    // misconfigured we redirect to ?contact=email_pending so the
    // customer knows the lead is recorded but the email is delayed.
    const emailResult = await sendContactNotification({
      name,
      email,
      phone: phone || null,
      subject,
    });

    const status = emailResult.ok ? "success" : "email_pending";
    return NextResponse.redirect(new URL(`/?contact=${status}`, request.url), 303);
  } catch (err) {
    console.error("/api/contact failed:", err);
    return NextResponse.redirect(new URL("/?contact=error", request.url), 303);
  }
}
