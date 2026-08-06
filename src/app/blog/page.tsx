import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

export default async function BlogIndexPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("articles")
    .select("slug, title, excerpt, category, author_name, published_at, cover_image_url, tags")
    .eq("is_published", true)
    .order("published_at", { ascending: false });

  const posts = data || [];

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-secondary/20 px-4 py-12">
      <div className="mx-auto max-w-5xl space-y-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold tracking-tight">Blog & Resources</h1>
          <p className="mt-2 text-muted-foreground">
            Insights for property owners, investors, tenants and small businesses.
          </p>
        </div>

        {posts.length === 0 ? (
          <p className="py-12 text-center text-muted-foreground">
            No articles published yet. Check back soon.
          </p>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {posts.map((p) => (
              <Link key={p.slug} href={`/blog/${p.slug}`}>
                <Card className="h-full hover:shadow-md transition-shadow">
                  {p.cover_image_url && (
                    <div className="aspect-[16/9] overflow-hidden rounded-t-lg bg-muted">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={p.cover_image_url}
                        alt={p.title}
                        className="h-full w-full object-cover"
                        loading="lazy"
                      />
                    </div>
                  )}
                  <CardHeader>
                    {p.category && (
                      <Badge variant="outline" className="w-fit text-xs">
                        {p.category}
                      </Badge>
                    )}
                    <CardTitle className="text-base">{p.title}</CardTitle>
                    {p.excerpt && (
                      <CardDescription className="line-clamp-3">
                        {p.excerpt}
                      </CardDescription>
                    )}
                  </CardHeader>
                  <CardContent className="text-xs text-muted-foreground">
                    {p.author_name && <p>by {p.author_name}</p>}
                    {p.published_at && (
                      <p>
                        {new Date(p.published_at).toLocaleDateString("en-CA", {
                          year: "numeric",
                          month: "long",
                          day: "numeric",
                        })}
                      </p>
                    )}
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
