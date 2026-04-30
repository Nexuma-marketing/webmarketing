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
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2, Save, PenSquare } from "lucide-react";

interface ContentItem {
  id: string;
  section: string;
  key: string;
  value: string;
  updated_at: string;
}

interface SectionDef {
  value: string;
  label: string;
  hint: string;
  starter: { key: string; value: string; helper?: string }[];
}

const SECTIONS: SectionDef[] = [
  {
    value: "branding",
    label: "Site Branding (name, tagline)",
    hint: "Change the site name (header text & browser tab) and tagline. Saves apply on next page load.",
    starter: [
      { key: "site_brand_name", value: "WebMarketing", helper: "Shown in the header and browser tab." },
      { key: "site_short_name", value: "WebMarketing", helper: "Used as a fallback when the full name is too long (mobile menu)." },
      { key: "site_tagline", value: "Residential & Business Marketing", helper: "Shown next to the site name in <title> on the homepage." },
    ],
  },
  {
    value: "landing_hero",
    label: "Landing Page - Hero",
    hint: "Headline and subtitle shown at the very top of the home page.",
    starter: [
      { key: "hero_title", value: "We turn marketing into rentals.", helper: "Big headline at the top of /" },
      { key: "hero_subtitle", value: "Marketing for property owners and tailored services for tenants and investors.", helper: "Subtitle under the headline" },
      { key: "hero_cta", value: "Get Started", helper: "Main CTA button label" },
    ],
  },
  {
    value: "landing_features",
    label: "Landing Page - Features",
    hint: "Three highlighted feature blocks under the hero.",
    starter: [
      { key: "feature_1_title", value: "Maximize your rental income" },
      { key: "feature_1_body", value: "Performance marketing campaigns until your tenant is found." },
      { key: "feature_2_title", value: "Find the right tenants" },
      { key: "feature_2_body", value: "Verified tenant matching with premium screening." },
      { key: "feature_3_title", value: "Grow your business" },
      { key: "feature_3_body", value: "Sales-leak diagnosis and rescue plans for SMBs." },
    ],
  },
  {
    value: "landing_cta",
    label: "Landing Page - CTA",
    hint: "Call-to-action band near the bottom of the home page.",
    starter: [
      { key: "cta_title", value: "Ready to get started?" },
      { key: "cta_subtitle", value: "Pick the plan that fits you and we will take it from there." },
      { key: "cta_button", value: "Schedule My Session" },
    ],
  },
  {
    value: "testimonials",
    label: "Testimonials",
    hint: "Client testimonials shown on the home page. Use one row per testimonial; the value is the body text.",
    starter: [
      { key: "testimonial_1_author", value: "Maria L." },
      { key: "testimonial_1_text", value: "We rented out our property in 11 days. The whole process was effortless." },
      { key: "testimonial_2_author", value: "Carlos M." },
      { key: "testimonial_2_text", value: "Their sales-leak diagnosis pinpointed exactly what was hurting our revenue." },
    ],
  },
  {
    value: "faq",
    label: "FAQ",
    hint: "Frequently asked questions. Pair each *_question with a *_answer.",
    starter: [
      { key: "faq_1_question", value: "How long until my property is rented?" },
      { key: "faq_1_answer", value: "Average time-to-rent is 14-16 days for properties listed on the platform." },
      { key: "faq_2_question", value: "Are tenants screened?" },
      { key: "faq_2_answer", value: "Yes, all tenants complete a verified screening before they can apply to a property." },
    ],
  },
  {
    value: "service_descriptions",
    label: "Service Descriptions",
    hint: "Long-form descriptions per service. Key format: <service_slug>_short or <service_slug>_long.",
    starter: [
      { key: "basic_short", value: "Essential property management for single-property owners." },
      { key: "preferred_short", value: "Enhanced services for growing portfolios." },
      { key: "elite_short", value: "Full-service management for investment portfolios." },
    ],
  },
  {
    value: "articles",
    label: "Articles & Resources",
    hint: "Blog-style articles. Key format: <slug>_title, <slug>_excerpt, <slug>_body, <slug>_published.",
    starter: [
      { key: "welcome_title", value: "Welcome to Nexuma" },
      { key: "welcome_excerpt", value: "An introduction to our marketing-first approach to residential rentals." },
      { key: "welcome_body", value: "Nexuma marketing ltd helps Canadian property owners turn marketing performance into reliable rental income..." },
      { key: "welcome_published", value: "true" },
    ],
  },
];

export default function AdminContentPage() {
  const [items, setItems] = useState<ContentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSection, setSelectedSection] = useState("landing_hero");
  const [saving, setSaving] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");

  const supabase = createClient();

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("site_content")
      .select("*")
      .order("section")
      .order("key");

    setItems(data || []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  const filteredItems = items.filter((i) => i.section === selectedSection);
  const currentSection = SECTIONS.find((s) => s.value === selectedSection);

  async function handleUpdate(id: string, value: string) {
    setSaving(id);
    setMessage(null);

    await supabase.from("site_content").update({ value }).eq("id", id);

    setItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, value } : i))
    );
    setSaving(null);
    setMessage("Saved");
    setTimeout(() => setMessage(null), 2000);
  }

  async function handleAdd() {
    if (!newKey.trim()) return;
    setSaving("new");

    await supabase.from("site_content").insert({
      section: selectedSection,
      key: newKey.trim(),
      value: newValue,
    });

    setNewKey("");
    setNewValue("");
    setSaving(null);
    setMessage("Item added");
    setTimeout(() => setMessage(null), 2000);
    load();
  }

  async function seedSection() {
    const def = SECTIONS.find((s) => s.value === selectedSection);
    if (!def) return;
    setSaving("seed");
    const rows = def.starter.map((s) => ({
      section: selectedSection,
      key: s.key,
      value: s.value,
    }));
    const { error } = await supabase
      .from("site_content")
      .upsert(rows, { onConflict: "section,key" });
    setSaving(null);
    if (error) {
      setMessage(`Error: ${error.message}`);
    } else {
      setMessage(`Seeded ${rows.length} starter items.`);
      setTimeout(() => setMessage(null), 3000);
      load();
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this content item?")) return;
    await supabase.from("site_content").delete().eq("id", id);
    setItems((prev) => prev.filter((i) => i.id !== id));
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold md:text-3xl">Content Management</h1>
        <p className="text-muted-foreground">
          Edit landing page text, testimonials, FAQ, and service descriptions
        </p>
      </div>

      {message && (
        <div className="rounded-md bg-green-100 p-3 text-sm text-green-800">
          {message}
        </div>
      )}

      {/* Section selector */}
      <div className="flex flex-wrap items-center gap-3">
        <PenSquare className="h-4 w-4 text-muted-foreground" />
        <Select value={selectedSection} onValueChange={(v) => v && setSelectedSection(v)}>
          <SelectTrigger className="w-[300px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SECTIONS.map((s) => (
              <SelectItem key={s.value} value={s.value}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Badge variant="outline">{filteredItems.length} items</Badge>
      </div>

      {currentSection?.hint && (
        <p className="text-sm text-muted-foreground">{currentSection.hint}</p>
      )}

      {/* Content items */}
      <div className="space-y-4">
        {filteredItems.map((item) => (
          <Card key={item.id}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-mono">{item.key}</CardTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDelete(item.id)}
                >
                  <Trash2 className="h-3.5 w-3.5 text-red-500" />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <ContentEditor
                value={item.value}
                saving={saving === item.id}
                onSave={(v) => handleUpdate(item.id, v)}
              />
            </CardContent>
          </Card>
        ))}

        {filteredItems.length === 0 && currentSection && (
          <Card>
            <CardContent className="py-8 text-center space-y-3">
              <p className="text-muted-foreground">
                No content items in this section yet.
              </p>
              <p className="text-xs text-muted-foreground">
                Tip: click <b>&ldquo;Seed starter items&rdquo;</b> to populate this section with{" "}
                {currentSection.starter.length} example entries you can edit.
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={seedSection}
                disabled={saving === "seed"}
              >
                {saving === "seed" ? "Seeding..." : "Seed starter items"}
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Add new item */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Add New Content Item</CardTitle>
          <CardDescription>
            Add a new key-value pair to the {SECTIONS.find((s) => s.value === selectedSection)?.label} section
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Key</Label>
            <Input
              value={newKey}
              onChange={(e) => setNewKey(e.target.value)}
              placeholder="e.g., hero_title"
            />
          </div>
          <div className="space-y-2">
            <Label>Value</Label>
            <Textarea
              value={newValue}
              onChange={(e) => setNewValue(e.target.value)}
              placeholder="Content text..."
              rows={3}
            />
          </div>
          <Button onClick={handleAdd} disabled={saving === "new" || !newKey.trim()}>
            <Plus className="mr-2 h-4 w-4" />
            {saving === "new" ? "Adding..." : "Add Item"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function ContentEditor({
  value: initial,
  saving,
  onSave,
}: {
  value: string;
  saving: boolean;
  onSave: (value: string) => void;
}) {
  const [value, setValue] = useState(initial);
  const changed = value !== initial;

  return (
    <div className="space-y-2">
      <Textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        rows={3}
      />
      {changed && (
        <Button size="sm" onClick={() => onSave(value)} disabled={saving}>
          <Save className="mr-1 h-3.5 w-3.5" />
          {saving ? "Saving..." : "Save"}
        </Button>
      )}
    </div>
  );
}
