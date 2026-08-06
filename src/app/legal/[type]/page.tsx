import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft } from "lucide-react";

export const dynamic = "force-dynamic";

// Public-facing legal document viewer. The register page links here as
// /legal/terms and /legal/privacy from the consent box, so the slugs
// must keep mapping to the legal_documents.type rows seeded in v7/v11
// (terms_of_service, privacy_policy, cookie_policy). Anything else 404s.
const SLUG_TO_TYPE: Record<string, { type: string; title: string }> = {
  terms: { type: "terms_of_service", title: "Terms of Service" },
  privacy: { type: "privacy_policy", title: "Privacy Policy" },
  cookies: { type: "cookie_policy", title: "Cookie Policy" },
};

export default async function LegalDocPage({
  params,
}: {
  params: Promise<{ type: string }>;
}) {
  const { type: slug } = await params;
  const mapping = SLUG_TO_TYPE[slug];
  if (!mapping) notFound();

  const supabase = await createClient();
  const { data: doc } = await supabase
    .from("legal_documents")
    .select("type, content, version, updated_at")
    .eq("type", mapping.type)
    .single();

  if (!doc) notFound();

  return (
    <article className="min-h-screen bg-background px-4 py-12">
      <div className="mx-auto max-w-3xl space-y-6">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to home
        </Link>

        <div className="flex items-center justify-between gap-3">
          <h1 className="text-3xl font-bold tracking-tight md:text-4xl">
            {mapping.title}
          </h1>
          {doc.version && <Badge variant="outline">v{doc.version}</Badge>}
        </div>

        {doc.updated_at && (
          <p className="text-sm text-muted-foreground">
            Last updated{" "}
            {new Date(doc.updated_at).toLocaleDateString("en-CA", {
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </p>
        )}

        <div className="prose prose-sm md:prose-base max-w-none whitespace-pre-wrap">
          {doc.content}
        </div>
      </div>
    </article>
  );
}
