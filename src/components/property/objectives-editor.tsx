"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

// Same list originally offered on the 6-step registration form's
// Owner Profile step (src/app/forms/propietario/page.tsx OBJECTIVES).
const OBJECTIVES = [
  "Rent extra spaces (rooms, den)",
  "Rent a full unit (basement, suite, house, apartment, penthouse)",
  "Cover mortgage payments",
  "Increase income",
  "Get return on property investment",
  "Short-term rentals",
  "Long-term rentals",
  "Optimize assets",
];

export function ObjectivesEditor({
  briefId,
  initialObjectives,
}: {
  briefId: string;
  initialObjectives: string[];
}) {
  const [objectives, setObjectives] = useState<string[]>(initialObjectives);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  function toggle(value: string) {
    setObjectives((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value],
    );
  }

  async function handleSave() {
    setSaving(true);
    setMessage(null);
    const supabase = createClient();
    const { error } = await supabase
      .from("discovery_briefs")
      .update({ objectives })
      .eq("id", briefId);

    setMessage(error ? "Failed to save. Please try again." : "Objectives saved.");
    setSaving(false);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Investment Objectives</CardTitle>
        <CardDescription>
          These preferences apply to your account, not any single property.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {message && (
          <div
            className={`rounded-md p-3 text-sm ${
              message.startsWith("Failed")
                ? "bg-destructive/10 text-destructive"
                : "bg-green-100 text-green-800"
            }`}
          >
            {message}
          </div>
        )}
        <div className="grid gap-2 sm:grid-cols-2">
          {OBJECTIVES.map((o) => (
            <div key={o} className="flex items-center gap-2">
              <Checkbox
                id={`obj-${o}`}
                checked={objectives.includes(o)}
                onCheckedChange={() => toggle(o)}
              />
              <Label htmlFor={`obj-${o}`} className="text-sm font-normal">
                {o}
              </Label>
            </div>
          ))}
        </div>
        <div className="flex justify-end">
          <Button type="button" onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save Objectives"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
