import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = await createClient();
  const { data: post } = await supabase
    .from("articles")
    .select("*")
    .eq("slug", slug)
    .eq("is_published", true)
    .single();

  if (!post) notFound();

  return (
    <article className="min-h-screen bg-background px-4 py-12">
      <div className="mx-auto max-w-3xl space-y-6">
        <Link
          href="/blog"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to all articles
        </Link>

        {post.category && (
          <Badge variant="outline" className="text-xs">
            {post.category}
          </Badge>
        )}

        <h1 className="text-3xl font-bold tracking-tight md:text-4xl">{post.title}</h1>

        <div className="text-sm text-muted-foreground">
          {post.author_name && <span>by {post.author_name}</span>}
          {post.author_name && post.published_at && <span> · </span>}
          {post.published_at && (
            <span>
              {new Date(post.published_at).toLocaleDateString("en-CA", {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </span>
          )}
        </div>

        {post.cover_image_url && (
          <div className="aspect-[16/9] overflow-hidden rounded-lg bg-muted">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={post.cover_image_url}
              alt={post.title}
              className="h-full w-full object-cover"
            />
          </div>
        )}

        {post.excerpt && (
          <p className="text-lg text-muted-foreground italic">{post.excerpt}</p>
        )}

        <div className="prose prose-sm md:prose-base max-w-none whitespace-pre-wrap">
          {post.body}
        </div>

        {post.tags && post.tags.length > 0 && (
          <div className="flex flex-wrap gap-2 border-t pt-6">
            {post.tags.map((t: string) => (
              <Badge key={t} variant="outline">
                {t}
              </Badge>
            ))}
          </div>
        )}
      </div>
    </article>
  );
}
