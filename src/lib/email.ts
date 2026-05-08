import { Resend } from "resend";

// Steve 4/19: domain is nexuma.ca, receiver is alexsanabria33@hotmail.com until commercial email ready
const NOTIFICATION_EMAIL = process.env.CONTACT_NOTIFICATION_EMAIL || "alexsanabria33@hotmail.com";
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || "WebMarketing <notifications@nexuma.ca>";

// Support multi-recipient: comma-separated emails → array
function parseRecipients(value: string): string[] {
  return value.split(",").map((s) => s.trim()).filter(Boolean);
}

// Steve 5/7: in-process counters surfaced through /api/health so we
// can detect "the contact form is silently swallowing emails" without
// waiting for the next customer feedback round. Reset on cold start.
const emailMetrics = {
  attempts: 0,
  succeeded: 0,
  failed: 0,
  skippedNoApiKey: 0,
  lastError: null as string | null,
  lastSuccessAt: null as string | null,
};

export function getEmailMetrics() {
  return { ...emailMetrics };
}

// Steve 5/7: contact-form ladder.
// 1. Send the internal "new lead" notification to the commercial team.
// 2. Send a confirmation back to the user that we received the message
//    (this is what Steve called "el correo al cliente" in the 7 May
//    DOCX — it never actually existed in code, the older claim was
//    incorrect, but the customer expectation is reasonable so we add
//    it now).
// Returns a structured result so the caller can decide whether to
// surface a "we got it" or a "delivery still pending" UI state.
export async function sendContactNotification({
  name,
  email,
  phone,
  subject,
}: {
  name: string;
  email: string;
  phone: string | null;
  subject: string;
}): Promise<{ ok: boolean; reason?: string }> {
  emailMetrics.attempts += 1;

  if (!process.env.RESEND_API_KEY) {
    emailMetrics.skippedNoApiKey += 1;
    emailMetrics.lastError = "RESEND_API_KEY not configured";
    console.warn("RESEND_API_KEY not set — skipping email notification");
    return { ok: false, reason: "missing_api_key" };
  }

  const resend = new Resend(process.env.RESEND_API_KEY);

  try {
    // 1. Internal notification (commercial team)
    await resend.emails.send({
      from: FROM_EMAIL,
      to: parseRecipients(NOTIFICATION_EMAIL),
      replyTo: email,
      subject: `New Contact Form: ${subject}`,
      html: `
        <h2>New Contact Form Submission</h2>
        <table style="border-collapse:collapse;width:100%;max-width:500px">
          <tr><td style="padding:8px;font-weight:bold">Name</td><td style="padding:8px">${name}</td></tr>
          <tr><td style="padding:8px;font-weight:bold">Email</td><td style="padding:8px"><a href="mailto:${email}">${email}</a></td></tr>
          ${phone ? `<tr><td style="padding:8px;font-weight:bold">Phone</td><td style="padding:8px">${phone}</td></tr>` : ""}
          <tr><td style="padding:8px;font-weight:bold">Subject</td><td style="padding:8px">${subject}</td></tr>
        </table>
        <p style="color:#666;font-size:12px;margin-top:20px">
          This notification was sent from the Nexuma Marketing contact form.
        </p>
      `,
    });

    // 2. Customer-facing confirmation
    await resend.emails.send({
      from: FROM_EMAIL,
      to: [email],
      subject: "We received your message — Nexuma Marketing",
      html: `
        <h2>Thanks for reaching out, ${name}</h2>
        <p>We received your message and our team will get back to you within 24 hours.</p>
        <p style="margin-top:16px"><strong>Subject:</strong> ${subject}</p>
        <p style="color:#666;font-size:12px;margin-top:24px">
          If you did not submit this form, please ignore this email.<br/>
          Nexuma marketing ltd · British Columbia, Canada
        </p>
      `,
    });

    emailMetrics.succeeded += 1;
    emailMetrics.lastSuccessAt = new Date().toISOString();
    return { ok: true };
  } catch (err) {
    emailMetrics.failed += 1;
    emailMetrics.lastError = err instanceof Error ? err.message : String(err);
    console.error("sendContactNotification failed:", err);
    return { ok: false, reason: "send_failed" };
  }
}
