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
function inferRoleFromSubject(subject: string): string | null {
  const s = subject.toLowerCase();
  if (/\btenant\b|\binquilino\b|rent a |apartment/.test(s)) return "inquilino";
  if (/\blandlord\b|\bpropietario\b|my property|my unit/.test(s)) return "propietario";
  if (/\bbusiness\b|\bempresa\b|\bpyme\b|small business|my company/.test(s)) return "pymes";
  if (/\binvestor\b|\binversion\b|portfolio/.test(s)) return "inversionista";
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

    // Send email notification (non-blocking)
    sendContactNotification({ name, email, phone: phone || null, subject }).catch(
      (err) => console.error("Email notification failed:", err)
    );

    // Redirect back to homepage with success message
    return NextResponse.redirect(new URL("/?contact=success", request.url), 303);
  } catch {
    return NextResponse.redirect(new URL("/?contact=error", request.url), 303);
  }
}
