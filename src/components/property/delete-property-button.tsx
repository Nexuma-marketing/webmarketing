"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Trash2, AlertTriangle } from "lucide-react";

export function DeletePropertyButton({
  propertyId,
  propertyLabel,
}: {
  propertyId: string;
  propertyLabel: string;
}) {
  const router = useRouter();
  const [showConfirm, setShowConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setDeleting(true);
    setError(null);
    try {
      const supabase = createClient();

      // 1. Delete images first (FK constraint)
      await supabase.from("property_images").delete().eq("property_id", propertyId);

      // 2. Delete the property
      const { error: deleteError } = await supabase
        .from("properties")
        .delete()
        .eq("id", propertyId);

      if (deleteError) throw deleteError;

      // 3. Re-run profiling so role and tier get recalculated
      await fetch("/api/profiling", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "owner" }),
      }).catch(() => null);

      // 4. Refresh the page
      router.refresh();
    } catch (err) {
      console.error("Delete property failed:", err);
      setError("Failed to delete. Please try again.");
      setDeleting(false);
    }
  }

  if (showConfirm) {
    return (
      <div className="rounded-md border border-red-200 bg-red-50 p-3 space-y-2">
        <div className="flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 text-red-600 mt-0.5 shrink-0" />
          <div className="flex-1 text-sm">
            <p className="font-medium text-red-900">Delete this property?</p>
            <p className="text-red-700 text-xs mt-0.5">
              {propertyLabel}
            </p>
            <p className="text-red-600 text-xs mt-1">
              This will remove the property and all its images. This cannot be undone.
            </p>
          </div>
        </div>
        {error && <p className="text-xs text-red-700">{error}</p>}
        <div className="flex gap-2">
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={handleDelete}
            disabled={deleting}
            className="flex-1"
          >
            {deleting ? "Deleting..." : "Yes, delete"}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setShowConfirm(false)}
            disabled={deleting}
            className="flex-1"
          >
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={() => setShowConfirm(true)}
      className="flex-1 text-red-600 hover:text-red-700 hover:bg-red-50"
    >
      <Trash2 className="h-3.5 w-3.5 mr-1" />
      Delete
    </Button>
  );
}
