"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, Pencil, Trash2, Newspaper } from "lucide-react";

interface Article {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  body: string;
  cover_image_url: string | null;
  author_name: string | null;
  category: string | null;
  tags: string[];
  is_published: boolean;
  published_at: string | null;
  created_at: string;
}

export default function AdminArticlesPage() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<Partial<Article> | null>(null);
  const [saving, setSaving] = useState(false);
  const [tagsText, setTagsText] = useState("");

  const supabase = createClient();

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("articles")
      .select("*")
      .order("created_at", { ascending: false });
    setArticles((data as Article[]) || []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  function openNew() {
    setEdit({
      slug: "",
      title: "",
      excerpt: "",
      body: "",
      author_name: "",
      category: "",
      tags: [],
      is_published: false,
    });
    setTagsText("");
    setOpen(true);
  }

  function openEdit(a: Article) {
    setEdit({ ...a });
    setTagsText((a.tags || []).join(", "));
    setOpen(true);
  }

  async function save() {
    if (!edit?.title || !edit?.slug) return;
    setSaving(true);
    const tags = tagsText.split(",").map((t) => t.trim()).filter(Boolean);
    const isPublished = edit.is_published ?? false;
    const payload = {
      slug: edit.slug,
      title: edit.title,
      excerpt: edit.excerpt || null,
      body: edit.body || "",
      cover_image_url: edit.cover_image_url || null,
      author_name: edit.author_name || null,
      category: edit.category || null,
      tags,
      is_published: isPublished,
      published_at: isPublished ? edit.published_at || new Date().toISOString() : null,
    };
    if (edit.id) {
      await supabase.from("articles").update(payload).eq("id", edit.id);
    } else {
      await supabase.from("articles").insert(payload);
    }
    setSaving(false);
    setOpen(false);
    setEdit(null);
    load();
  }

  async function togglePublish(a: Article) {
    await supabase
      .from("articles")
      .update({
        is_published: !a.is_published,
        published_at: !a.is_published ? new Date().toISOString() : null,
      })
      .eq("id", a.id);
    load();
  }

  async function deleteArticle(id: string) {
    if (!confirm("Delete this article? This cannot be undone.")) return;
    await supabase.from("articles").delete().eq("id", id);
    load();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold md:text-3xl">Articles & Resources</h1>
          <p className="text-muted-foreground">
            Publish blog posts, guides and resources for clients.
          </p>
        </div>
        <Button onClick={openNew}>
          <Plus className="mr-2 h-4 w-4" />
          New Article
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Newspaper className="h-4 w-4" />
            All articles ({articles.length})
          </CardTitle>
          <CardDescription>
            Published articles are visible at <code>/blog/&lt;slug&gt;</code>. Drafts are only visible to admins.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-muted-foreground py-4">Loading...</p>
          ) : articles.length === 0 ? (
            <p className="text-muted-foreground py-4">No articles yet. Create your first one.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Slug</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {articles.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="font-medium">{a.title}</TableCell>
                    <TableCell>
                      <code className="text-xs">{a.slug}</code>
                    </TableCell>
                    <TableCell>{a.category || "—"}</TableCell>
                    <TableCell>
                      {a.is_published ? (
                        <Badge className="bg-green-50 text-green-700">Published</Badge>
                      ) : (
                        <Badge variant="outline">Draft</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(a.created_at).toLocaleDateString("en-CA")}
                    </TableCell>
                    <TableCell className="text-right space-x-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => togglePublish(a)}
                      >
                        {a.is_published ? "Unpublish" : "Publish"}
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => openEdit(a)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => deleteArticle(a.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-red-500" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Editor dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{edit?.id ? "Edit Article" : "New Article"}</DialogTitle>
            <DialogDescription>
              Markdown is supported in the body. Use the slug for the URL: <code>/blog/&lt;slug&gt;</code>
            </DialogDescription>
          </DialogHeader>
          {edit && (
            <div className="space-y-4 pt-2">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Title</Label>
                  <Input
                    value={edit.title || ""}
                    onChange={(e) => setEdit({ ...edit, title: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Slug</Label>
                  <Input
                    value={edit.slug || ""}
                    onChange={(e) =>
                      setEdit({
                        ...edit,
                        slug: e.target.value.toLowerCase().replace(/\s/g, "-"),
                      })
                    }
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Category</Label>
                  <Input
                    value={edit.category || ""}
                    onChange={(e) => setEdit({ ...edit, category: e.target.value })}
                    placeholder="e.g., Marketing tips"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Author</Label>
                  <Input
                    value={edit.author_name || ""}
                    onChange={(e) => setEdit({ ...edit, author_name: e.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Cover image URL</Label>
                <Input
                  value={edit.cover_image_url || ""}
                  onChange={(e) =>
                    setEdit({ ...edit, cover_image_url: e.target.value })
                  }
                  placeholder="https://..."
                />
              </div>
              <div className="space-y-2">
                <Label>Excerpt (one-line summary)</Label>
                <Textarea
                  value={edit.excerpt || ""}
                  onChange={(e) => setEdit({ ...edit, excerpt: e.target.value })}
                  rows={2}
                />
              </div>
              <div className="space-y-2">
                <Label>Body (Markdown supported)</Label>
                <Textarea
                  value={edit.body || ""}
                  onChange={(e) => setEdit({ ...edit, body: e.target.value })}
                  rows={14}
                  className="font-mono text-sm"
                />
              </div>
              <div className="space-y-2">
                <Label>Tags (comma-separated)</Label>
                <Input
                  value={tagsText}
                  onChange={(e) => setTagsText(e.target.value)}
                  placeholder="rentals, owners, marketing"
                />
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={edit.is_published ?? false}
                  onCheckedChange={(c) => setEdit({ ...edit, is_published: c })}
                />
                <Label>Published</Label>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
