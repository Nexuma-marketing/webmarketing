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

// ============================================================
// Steve 5/20 Milestone 4 — customer-facing payment emails.
// Client confirmed: "los email automatico si tambien al cliente".
// Four flavors, all called from the Stripe webhook handlers so the
// trigger is the actual money-movement event (no duplicates from
// retries because Stripe deduplicates events). Every helper is
// fire-and-forget and never throws — webhook delivery to Stripe
// must always succeed even if email is down.
// ============================================================

const APP_NAME = "Nexuma Marketing";

// Steve 5/20 Milestone 4 — client confirmed every payment-related
// email should also CC the commercial team in real time.
// `COMMERCIAL_AREA_EMAIL` is already in Vercel env.
const COMMERCIAL_EMAIL = process.env.COMMERCIAL_AREA_EMAIL || NOTIFICATION_EMAIL;

function commercialRecipients(): string[] {
  return parseRecipients(COMMERCIAL_EMAIL);
}

function formatCurrency(amountCents: number, currency = "CAD"): string {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency,
  }).format(amountCents / 100);
}

function brandFooter(): string {
  return `
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0"/>
    <p style="color:#6b7280;font-size:12px;line-height:1.5">
      You received this email because you are a registered customer of ${APP_NAME}.<br/>
      Nexuma marketing ltd · British Columbia, Canada<br/>
      Questions? Reply to this email or contact support.
    </p>
  `;
}

// Steve 5/20 Milestone 4: every payment email now also BCCs the
// commercial team so they get a live feed of receipts / refunds /
// cancellations / failed payments without seeing the customer's
// To: header.
async function sendOne(args: {
  to: string;
  subject: string;
  html: string;
  notifyCommercial?: boolean;
}): Promise<void> {
  emailMetrics.attempts += 1;
  if (!process.env.RESEND_API_KEY) {
    emailMetrics.skippedNoApiKey += 1;
    emailMetrics.lastError = "RESEND_API_KEY not configured";
    return;
  }
  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    await resend.emails.send({
      from: FROM_EMAIL,
      to: [args.to],
      bcc: args.notifyCommercial ? commercialRecipients() : undefined,
      subject: args.subject,
      html: args.html,
    });
    emailMetrics.succeeded += 1;
    emailMetrics.lastSuccessAt = new Date().toISOString();
  } catch (err) {
    emailMetrics.failed += 1;
    emailMetrics.lastError = err instanceof Error ? err.message : String(err);
    console.error("payment email failed:", err);
  }
}

export async function sendPaymentReceiptEmail(args: {
  to: string;
  customerName: string;
  serviceName: string;
  amountCents: number;
  taxCents?: number;
  currency?: string;
  receiptUrl?: string | null;
  paymentDate?: string;
}): Promise<void> {
  const currency = args.currency || "CAD";
  const subtotal = formatCurrency(args.amountCents, currency);
  const tax = args.taxCents
    ? formatCurrency(args.taxCents, currency)
    : null;
  const total = formatCurrency(args.amountCents + (args.taxCents || 0), currency);
  const date = args.paymentDate
    ? new Date(args.paymentDate).toLocaleDateString("en-CA", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : new Date().toLocaleDateString("en-CA", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });

  await sendOne({
    to: args.to,
    notifyCommercial: true,
    subject: `Payment receipt — ${args.serviceName}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto">
        <h2 style="color:#16a34a">Thank you, ${args.customerName}</h2>
        <p>Your payment was processed successfully. Here are the details:</p>
        <table style="border-collapse:collapse;width:100%;margin:16px 0;font-size:14px">
          <tr><td style="padding:8px;color:#6b7280">Service</td><td style="padding:8px;text-align:right;font-weight:600">${args.serviceName}</td></tr>
          <tr><td style="padding:8px;color:#6b7280">Date</td><td style="padding:8px;text-align:right">${date}</td></tr>
          <tr><td style="padding:8px;color:#6b7280">Subtotal</td><td style="padding:8px;text-align:right">${subtotal}</td></tr>
          ${tax ? `<tr><td style="padding:8px;color:#6b7280">GST (5%)</td><td style="padding:8px;text-align:right">${tax}</td></tr>` : ""}
          <tr style="border-top:1px solid #e5e7eb"><td style="padding:8px;font-weight:600">Total paid</td><td style="padding:8px;text-align:right;font-weight:600;color:#16a34a">${total}</td></tr>
        </table>
        ${args.receiptUrl ? `<p><a href="${args.receiptUrl}" style="background:#16a34a;color:white;padding:10px 16px;text-decoration:none;border-radius:6px;display:inline-block">View Stripe receipt</a></p>` : ""}
        <p>You can also see this payment any time in your <a href="${process.env.NEXT_PUBLIC_APP_URL || "https://app.nexuma.ca"}/dashboard/payments">payment history</a>.</p>
        ${brandFooter()}
      </div>
    `,
  });
}

export async function sendRefundConfirmationEmail(args: {
  to: string;
  customerName: string;
  serviceName: string;
  amountCents: number;
  currency?: string;
}): Promise<void> {
  const amount = formatCurrency(args.amountCents, args.currency || "CAD");
  await sendOne({
    to: args.to,
    notifyCommercial: true,
    subject: `Refund processed — ${args.serviceName}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto">
        <h2 style="color:#2563eb">Refund processed for ${args.customerName}</h2>
        <p>We've issued a refund for <strong>${amount}</strong> for your purchase of <strong>${args.serviceName}</strong>.</p>
        <p>The refund will appear on your original payment method within <strong>5–10 business days</strong>, depending on your bank.</p>
        <p>If you don't see it after 10 business days, contact your bank and reference the original transaction date.</p>
        ${brandFooter()}
      </div>
    `,
  });
}

export async function sendSubscriptionCanceledEmail(args: {
  to: string;
  customerName: string;
  planName: string;
}): Promise<void> {
  await sendOne({
    to: args.to,
    notifyCommercial: true,
    subject: `Installment plan canceled — ${args.planName}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto">
        <h2 style="color:#d97706">Your installment plan was canceled</h2>
        <p>Hi ${args.customerName},</p>
        <p>Your monthly installments for <strong>${args.planName}</strong> have been canceled. You will not be charged again going forward.</p>
        <p><strong>Important:</strong> any installments already paid are not refunded automatically. If you believe a refund is due, reply to this email and our team will review.</p>
        <p>You can re-subscribe any time from your <a href="${process.env.NEXT_PUBLIC_APP_URL || "https://app.nexuma.ca"}/dashboard/services">services dashboard</a>.</p>
        ${brandFooter()}
      </div>
    `,
  });
}

export async function sendPaymentFailedEmail(args: {
  to: string;
  customerName: string;
  planName: string;
  amountCents: number;
  currency?: string;
}): Promise<void> {
  const amount = formatCurrency(args.amountCents, args.currency || "CAD");
  await sendOne({
    to: args.to,
    notifyCommercial: true,
    subject: `Payment failed — please update your card`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto">
        <h2 style="color:#dc2626">Payment failed — action needed</h2>
        <p>Hi ${args.customerName},</p>
        <p>We were unable to charge <strong>${amount}</strong> for your <strong>${args.planName}</strong> installment.</p>
        <p>This usually happens when:</p>
        <ul style="line-height:1.6">
          <li>The card on file has expired</li>
          <li>The card has insufficient funds</li>
          <li>Your bank blocked the transaction</li>
        </ul>
        <p>Please update your payment method as soon as possible to avoid your plan being canceled:</p>
        <p><a href="${process.env.NEXT_PUBLIC_APP_URL || "https://app.nexuma.ca"}/dashboard/payments" style="background:#dc2626;color:white;padding:10px 16px;text-decoration:none;border-radius:6px;display:inline-block">Update payment method</a></p>
        <p style="font-size:13px;color:#6b7280;margin-top:16px">
          Stripe will automatically retry the charge a few times over the next week. If all retries fail, your installment plan will be canceled.
        </p>
        ${brandFooter()}
      </div>
    `,
  });
}

// Steve 5/20 Milestone 4: when a customer (or admin) requests a
// subscription cancellation we set cancel_at_period_end=true in
// Stripe. The actual deletion event fires at cycle end. The user
// expects an immediate confirmation though, so we send this email
// directly from the cancel API route — independent of the webhook —
// with the exact end date Stripe returned. Per client policy: no
// prorated refund, service continues until period end.
export async function sendSubscriptionScheduledCancelEmail(args: {
  to: string;
  customerName: string;
  planName: string;
  cycleEndUnix: number | null;
}): Promise<void> {
  const dateLabel = args.cycleEndUnix
    ? new Date(args.cycleEndUnix * 1000).toLocaleDateString("en-CA", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : "the end of your current billing cycle";

  await sendOne({
    to: args.to,
    notifyCommercial: true,
    subject: `Cancellation scheduled — ${args.planName}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto">
        <h2 style="color:#d97706">Cancellation scheduled</h2>
        <p>Hi ${args.customerName},</p>
        <p>Your cancellation request for <strong>${args.planName}</strong> has been received.</p>
        <p style="background:#fef3c7;border-left:4px solid #d97706;padding:12px 16px;margin:16px 0">
          <strong>Your service stays active until ${dateLabel}.</strong><br/>
          You have already paid for the current billing cycle, so you continue to receive all benefits of your plan until that date. On ${dateLabel} the subscription will close and no further charges will be made.
        </p>
        <p style="font-size:14px;color:#374151">
          Per our policy, payments already made are <strong>not refunded</strong> on cancellation
          (no prorated refunds). If you believe a refund is due because of a technical issue or
          service problem, reply to this email and our team will review your case manually.
        </p>
        <p>Changed your mind? You can re-subscribe any time from your
          <a href="${process.env.NEXT_PUBLIC_APP_URL || "https://app.nexuma.ca"}/dashboard/services">services dashboard</a>
          — if you do it before ${dateLabel} we simply resume billing on the existing schedule.
        </p>
        ${brandFooter()}
      </div>
    `,
  });
}
