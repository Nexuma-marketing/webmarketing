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
    label: "Site Branding (name, logo, cover)",
    hint: "Change the site name, tagline, and homepage cover/logo image URLs. Paste a PUBLIC URL (must start with https:// and return an image directly when opened in a browser). Image specs are in each helper. After saving, hard-refresh the public site (Ctrl+Shift+R) to see the change.",
    starter: [
      { key: "site_brand_name", value: "Nexuma Marketing", helper: "Shown in the header and browser tab title." },
      { key: "site_short_name", value: "Nexuma", helper: "Used in the mobile menu when the full name is too long." },
      { key: "site_tagline", value: "Residential & Business Marketing", helper: "Shown next to the site name in <title> on the homepage." },
      { key: "site_logo_url", value: "", helper: "Logo URL. Recommended: 256×256 or 512×512 px, PNG or SVG with transparent background, < 200 KB. Replaces the default Sparkles icon. URL must end in .png/.jpg/.svg and be publicly accessible (no Google Drive sharing links)." },
      { key: "site_cover_image_url", value: "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=800&h=1000&fit=crop&crop=center", helper: "Stage 1 approved homepage hero image. Recommended: 1200×800 px (4:5 ratio), JPG or PNG, < 500 KB. Note: the public homepage hero now uses the Stage 1 photo directly; this URL is kept for future reuse but does not currently appear on /." },
      { key: "site_favicon_url", value: "", helper: "Browser tab icon URL. Recommended: 32×32 ICO/PNG or 64×64 PNG. Tools: realfavicongenerator.net. URL must serve the file directly with image/* content-type." },
    ],
  },
  // Steve 5/7: Landing Hero section is intentionally NOT exposed in
  // the admin UI any more. Stage 1 approved hardcoded JSX renders the
  // hero in src/app/page.tsx — exposing editable rows here was
  // misleading customers into thinking they could change the headline
  // through the panel. Re-add this entry only if Steve explicitly
  // re-opens hero editing (see homepage:revert-hero-to-stage1 commit).
  //
  // Steve 5/8: re-opens headline editing for the lower sections only
  // (How it Works, Services, Mission, Benefits, Contact). Hero stays
  // locked. Each row falls back to the Stage 1 wording in page.tsx if
  // left blank, so deleting a row reverts to the approved default.
  {
    value: "landing_headlines",
    label: "Landing Page - Headlines & Hero CTAs",
    hint: "Headlines for the home page sections (How it Works, Services, Mission, Benefits, Contact) plus the two hero CTA button labels (Property Owners / Business Owners). Leave a row blank or delete it to fall back to the Stage 1 default.",
    starter: [
      // Steve 6/2 (#05 in 6-2.md): the two hero CTA button labels.
      // Added via pickHeadline() in commit f54a07a so the code reads
      // them, but the admin starter list never exposed them — so the
      // client couldn't edit them. Now part of the standard headline
      // section.
      { key: "hero_cta_owner", value: "Property Owners", helper: "Label of the BLUE hero button on the home page (links to Property Owner registration)." },
      { key: "hero_cta_business", value: "Business Owners", helper: "Label of the GREEN hero button on the home page (links to Business / PYMES registration)." },
      { key: "howitworks_eyebrow", value: "How it Works", helper: "Small uppercase label above the heading." },
      { key: "howitworks_title", value: "Simple Steps to Get Started", helper: "Main heading for the How it Works section." },
      { key: "services_eyebrow", value: "Our Services" },
      { key: "services_title", value: "Solutions for Every Need" },
      { key: "services_subtitle", value: "Whether you are a property owner, tenant, or business, we have the right tools and services for you." },
      { key: "mission_eyebrow", value: "Why These Partners" },
      { key: "mission_title", value: "Our Mission" },
      { key: "mission_quote", value: "Building our dreams together, being passionate about our clients' projects through a human and close service.", helper: "Italic quote shown directly under the heading." },
      { key: "mission_description", value: "Every client is unique. That is why our system analyses your current situation and creates a personalized marketing plan that delivers real results." },
      { key: "benefits_eyebrow", value: "Why Choose Us" },
      { key: "benefits_title", value: "Everything You Need in One Place" },
      { key: "contact_eyebrow", value: "Get in Touch" },
      { key: "contact_title", value: "Contact Us" },
      { key: "contact_subtitle", value: "Have a question? Send us a message and our team will get back to you shortly." },
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
  // Steve 6/2 (#05 in 6-2.md): default was "landing_hero" — an orphan
  // section name that no longer exists in SECTIONS, so the page opened
  // with no selected section + no hint. Default to landing_headlines
  // (which is where the hero CTAs now live too).
  const [selectedSection, setSelectedSection] = useState("landing_headlines");
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

  // Steve 5/11: every admin save now asks the DB to return the row it
  // wrote so RLS-blocked writes (which return 0 rows + no error) are
  // caught and surfaced as a red error instead of a misleading "Saved"
  // toast. See admin/legal/page.tsx for the same pattern.
  async function handleUpdate(id: string, value: string) {
    setSaving(id);
    setMessage(null);

    const { data: returned, error } = await supabase
      .from("site_content")
      .update({ value })
      .eq("id", id)
      .select("id, value");

    setSaving(null);
    if (error) {
      setMessage(`Error: ${error.message}`);
      return;
    }
    if (!returned || returned.length === 0) {
      setMessage(
        "Error: Save reported success but the database did not change. " +
        "Likely cause: your account is missing the admin role. " +
        "Verify with: SELECT role FROM profiles WHERE id = auth.uid();",
      );
      return;
    }

    setItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, value } : i))
    );
    setMessage(`Saved & verified at ${new Date().toLocaleTimeString()}.`);
    setTimeout(() => setMessage(null), 4000);
  }

  async function handleAdd() {
    if (!newKey.trim()) return;
    setSaving("new");

    const { data: returned, error } = await supabase
      .from("site_content")
      .insert({
        section: selectedSection,
        key: newKey.trim(),
        value: newValue,
      })
      .select("id");

    setSaving(null);
    if (error) {
      setMessage(`Error: ${error.message}`);
      return;
    }
    if (!returned || returned.length === 0) {
      setMessage(
        "Error: Insert reported success but no row was created. " +
        "Likely cause: your account is missing the admin role.",
      );
      return;
    }

    setNewKey("");
    setNewValue("");
    setMessage("Item added & verified");
    setTimeout(() => setMessage(null), 3000);
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
    const { data: returned, error } = await supabase
      .from("site_content")
      .upsert(rows, { onConflict: "section,key" })
      .select("id");
    setSaving(null);
    if (error) {
      setMessage(`Error: ${error.message}`);
      return;
    }
    if (!returned || returned.length === 0) {
      setMessage(
        "Error: Seed reported success but no rows were written. " +
        "Likely cause: your account is missing the admin role.",
      );
      return;
    }
    setMessage(`Seeded ${returned.length} starter items & verified.`);
    setTimeout(() => setMessage(null), 3000);
    load();
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
        <div
          className={`rounded-md p-3 text-sm ${
            message.startsWith("Error")
              ? "bg-red-100 text-red-800 border border-red-300 font-medium"
              : "bg-green-100 text-green-800"
          }`}
        >
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
