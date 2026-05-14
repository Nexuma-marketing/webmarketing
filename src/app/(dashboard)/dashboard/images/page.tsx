"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ImageIcon, Upload, Trash2, CheckCircle2, AlertCircle, Clock } from "lucide-react";
import { ROOM_CATEGORIES, IMAGE_STATUS_COLORS } from "@/lib/constants";

interface PropertyOption {
  id: string;
  address: string;
  city: string;
}

interface PropertyImage {
  id: string;
  property_id: string;
  room_category: string;
  image_url: string;
  status: string;
  validation_notes: string | null;
  sort_order: number;
  uploaded_at: string;
}

const IMAGE_RULES = [
  "Minimum resolution: 1280px width",
  "Minimum file size: 100KB (no screenshots)",
  "Landscape orientation preferred",
  "Natural lighting — avoid flash",
  "Clean and decluttered spaces",
  "No personal items or identifiable information",
  "No people or pets (not even in reflections)",
];

// Required room categories per MVP (min 1 photo each)
const REQUIRED_ROOMS = [
  "Living Room",
  "Kitchen",
  "Master Bedroom",
  "Bathroom",
  "Exterior",
];

export default function ImagesPage() {
  const searchParams = useSearchParams();
  const preselectedProperty = searchParams.get("property");

  const [properties, setProperties] = useState<PropertyOption[]>([]);
  const [selectedProperty, setSelectedProperty] = useState<string>(preselectedProperty || "");
  const [images, setImages] = useState<PropertyImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [selectedRoom, setSelectedRoom] = useState(ROOM_CATEGORIES[0]);
  const [uploadMessage, setUploadMessage] = useState<{ type: "success" | "warning" | "error"; text: string } | null>(null);

  const supabase = createClient();

  useEffect(() => {
    async function loadProperties() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from("properties")
        .select("id, address, city")
        .eq("owner_id", user.id)
        .order("created_at", { ascending: false });

      setProperties(data || []);

      if (!selectedProperty && data && data.length > 0) {
        setSelectedProperty(data[0].id);
      }
      setLoading(false);
    }
    loadProperties();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!selectedProperty) return;
    loadImages();
  }, [selectedProperty]); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadImages() {
    const { data } = await supabase
      .from("property_images")
      .select("*")
      .eq("property_id", selectedProperty)
      .order("room_category")
      .order("sort_order");

    setImages(data || []);
  }

  // Steve 5/4: the 4/30 fix wasn't enough — "Living Room" (space) and
  // "living_room" (underscore) compared as different strings, so a real
  // Living Room photo still showed up as Missing on the owner checklist.
  // Normalize both sides to alphanumerics only ("livingroom") before
  // comparing. Approved + pending count, rejected does not.
  function normalizeRoom(s: string): string {
    return (s || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
  }
  function matchesRoom(imgCategory: string, target: string): boolean {
    const cat = normalizeRoom(imgCategory);
    if (cat === target) return true;
    // Master Bedroom matches any "bedroom*" room (Bedroom 2, etc.)
    if (target === "masterbedroom" && cat.startsWith("bedroom")) return true;
    return false;
  }
  // Steve 5/13: the docx from May 8-13 keeps re-reporting "Image Gallery
  // says Living Room missing but the photo is loaded and shows in My
  // Properties". Root cause: the photo IS loaded but is in REJECTED
  // status — the property detail page renders every image (rejected
  // ones just get a red badge), while hasPhotoForRoom() correctly
  // excludes rejected. The user reads "missing" as "no file" and
  // assumes a bug. Distinguish the three real states so the warning
  // becomes self-explanatory.
  type RoomStatus = "covered" | "rejected-only" | "missing";
  function roomStatusFor(room: string): RoomStatus {
    const target = normalizeRoom(room);
    let anyMatch = false;
    let anyNonRejected = false;
    for (const i of images) {
      if (!matchesRoom(i.room_category, target)) continue;
      anyMatch = true;
      if (i.status !== "rejected") anyNonRejected = true;
    }
    if (anyNonRejected) return "covered";
    if (anyMatch) return "rejected-only";
    return "missing";
  }

  function validateImageFile(file: File): Promise<{
    ok: boolean;
    quality: "high" | "acceptable" | "low";
    message: string;
    width: number;
    height: number;
    orientation: "landscape" | "portrait";
  }> {
    return new Promise((resolve) => {
      const img = new window.Image();
      img.onload = () => {
        const width = img.width;
        const height = img.height;
        const orientation: "landscape" | "portrait" = width >= height ? "landscape" : "portrait";
        const sizeMB = file.size / 1024 / 1024;
        const sizeKB = file.size / 1024;

        if (width < 1280) {
          resolve({ ok: false, quality: "low", orientation, width, height,
            message: `Resolution too low (${width}px wide). Minimum 1280px width required.` });
          return;
        }
        if (sizeMB > 10) {
          resolve({ ok: false, quality: "low", orientation, width, height,
            message: `File too large (${sizeMB.toFixed(1)}MB). Maximum 10MB.` });
          return;
        }
        if (sizeKB < 100) {
          resolve({ ok: false, quality: "low", orientation, width, height,
            message: `File too small (${sizeKB.toFixed(0)}KB). Minimum 100KB. Screenshots not accepted.` });
          return;
        }

        let quality: "high" | "acceptable" | "low" = "acceptable";
        let message = "Acceptable quality";
        if (width >= 1920 && orientation === "landscape") {
          quality = "high";
          message = "High quality image";
        } else if (orientation === "portrait") {
          message = "Acceptable — landscape orientation is preferred";
        }

        resolve({ ok: true, quality, orientation, width, height, message });
      };
      img.onerror = () => resolve({ ok: false, quality: "low", orientation: "landscape",
        width: 0, height: 0, message: "Could not read image dimensions." });
      img.src = URL.createObjectURL(file);
    });
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !selectedProperty) {
      e.target.value = "";
      return;
    }

    setUploading(true);
    setUploadMessage(null);
    try {
      const validation = await validateImageFile(file);
      if (!validation.ok) {
        setUploadMessage({ type: "error", text: validation.message });
        return;
      }

      const ext = file.name.split(".").pop();
      const path = `properties/${selectedProperty}/${Date.now()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("property-images")
        .upload(path, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from("property-images")
        .getPublicUrl(path);

      // Steve 5/6: registration form (image-upload.tsx) saves lowercase
      // snake_case ("living_room"), but this dashboard upload UI used to
      // save Title Case ("Living Room"), so the admin Image Library Room
      // filter ended up with duplicate entries. Normalize to the same
      // shape (lowercase + underscore) at write time.
      const canonicalRoom = (selectedRoom || "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "_");

      await supabase.from("property_images").insert({
        property_id: selectedProperty,
        room_category: canonicalRoom,
        image_url: publicUrl,
        original_filename: file.name,
        file_size_bytes: file.size,
        resolution_ok: validation.width >= 1280,
        orientation: validation.orientation,
        status: "pending",
        sort_order: images.filter((i) =>
          (i.room_category || "").toLowerCase().replace(/\s+/g, "_") === canonicalRoom,
        ).length,
      });

      setUploadMessage({
        type: validation.quality === "high" ? "success" : "warning",
        text: `${validation.message} (${validation.width}×${validation.height})`,
      });

      await loadImages();
    } catch (err) {
      console.error("Upload failed:", err);
      setUploadMessage({ type: "error", text: "Upload failed. Please try again." });
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  async function handleDelete(imageId: string) {
    if (!confirm("Delete this image?")) return;

    await supabase.from("property_images").delete().eq("id", imageId);
    setImages((prev) => prev.filter((i) => i.id !== imageId));
  }

  const statusIcon = (status: string) => {
    switch (status) {
      case "approved":
        return <CheckCircle2 className="h-4 w-4 text-green-600" />;
      case "rejected":
        return <AlertCircle className="h-4 w-4 text-red-600" />;
      default:
        return <Clock className="h-4 w-4 text-yellow-600" />;
    }
  };

  // Steve 5/5: registration form (image-upload.tsx) saves room_category as
  // "living_room" lowercase, but constants.ts ROOM_CATEGORIES is Title Case
  // ("Living Room"). Strict-equality grouping never matched, so the gallery
  // appeared empty for owners who registered through the form. Group by the
  // raw DB value so every image shows up under the casing the DB has.
  const groupedImages = images.reduce<Record<string, PropertyImage[]>>(
    (acc, img) => {
      const key = img.room_category || "Other";
      if (!acc[key]) acc[key] = [];
      acc[key].push(img);
      return acc;
    },
    {}
  );

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
        <h1 className="text-2xl font-bold md:text-3xl">Image Gallery</h1>
        <p className="text-muted-foreground">
          Manage room-by-room images for your properties
        </p>
      </div>

      {/* 5-Rule Checklist */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Photography Guidelines</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {IMAGE_RULES.map((rule, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
                {rule}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {properties.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center py-8 text-center">
            <ImageIcon className="mb-3 h-8 w-8 text-muted-foreground" />
            <p className="text-muted-foreground">
              No properties found. Register a property first to upload images.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Property selector + upload */}
          <div className="flex flex-wrap items-end gap-4">
            <div className="w-full space-y-2 sm:w-auto">
              <Label>Property</Label>
              <Select value={selectedProperty} onValueChange={(v: string | null) => v && setSelectedProperty(v)}>
                <SelectTrigger className="w-full sm:w-[300px]">
                  <SelectValue>
                    {selectedProperty
                      ? (() => {
                          const p = properties.find((pr) => pr.id === selectedProperty);
                          return p ? `${p.address}, ${p.city}` : "Select property";
                        })()
                      : "Select property"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {properties.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.address}, {p.city}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="w-full space-y-2 sm:w-auto">
              <Label>Room Category</Label>
              <Select value={selectedRoom} onValueChange={(v) => v && setSelectedRoom(v)}>
                <SelectTrigger className="w-full sm:w-[200px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROOM_CATEGORIES.map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {cat}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Button
                disabled={uploading || !selectedProperty}
                onClick={() => document.getElementById("image-upload")?.click()}
              >
                <Upload className="mr-2 h-4 w-4" />
                {uploading ? "Uploading..." : "Upload Image"}
              </Button>
              <Input
                id="image-upload"
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleUpload}
                disabled={uploading}
              />
            </div>
          </div>

          {/* Upload result message */}
          {uploadMessage && (
            <div
              className={`rounded-md border p-3 text-sm ${
                uploadMessage.type === "success"
                  ? "border-green-200 bg-green-50 text-green-700"
                  : uploadMessage.type === "warning"
                    ? "border-yellow-200 bg-yellow-50 text-yellow-700"
                    : "border-red-200 bg-red-50 text-red-700"
              }`}
            >
              {uploadMessage.text}
            </div>
          )}

          {/* Required rooms checklist (MVP: min 1 photo per required room) */}
          {selectedProperty && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  Required Rooms ({REQUIRED_ROOMS.filter((r) => roomStatusFor(r) === "covered").length}/{REQUIRED_ROOMS.length})
                </CardTitle>
                <CardDescription>
                  Upload at least 1 photo per required room to complete your listing.
                  Rejected photos do not count — re-upload a replacement.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="grid gap-2 sm:grid-cols-2 md:grid-cols-3">
                  {REQUIRED_ROOMS.map((room) => {
                    const st = roomStatusFor(room);
                    return (
                      <li key={room} className="flex items-center gap-2 text-sm">
                        {st === "covered" ? (
                          <CheckCircle2 className="h-4 w-4 text-green-600" />
                        ) : st === "rejected-only" ? (
                          <AlertCircle className="h-4 w-4 text-amber-500" />
                        ) : (
                          <AlertCircle className="h-4 w-4 text-red-500" />
                        )}
                        <span
                          className={
                            st === "covered"
                              ? "text-green-700"
                              : st === "rejected-only"
                                ? "text-amber-700"
                                : "text-muted-foreground"
                          }
                        >
                          {room}
                          {st === "rejected-only" && (
                            <span className="ml-1 text-xs font-medium">(rejected — re-upload)</span>
                          )}
                        </span>
                      </li>
                    );
                  })}
                </ul>
                {(() => {
                  const covered = REQUIRED_ROOMS.filter((r) => roomStatusFor(r) === "covered");
                  const rejectedOnly = REQUIRED_ROOMS.filter((r) => roomStatusFor(r) === "rejected-only");
                  const missing = REQUIRED_ROOMS.filter((r) => roomStatusFor(r) === "missing");
                  if (covered.length === REQUIRED_ROOMS.length) {
                    return (
                      <p className="mt-3 text-sm font-medium text-green-600">
                        ✓ All required rooms have photos
                      </p>
                    );
                  }
                  return (
                    <div className="mt-3 space-y-1 text-sm">
                      {missing.length > 0 && (
                        <p className="text-red-500">
                          Missing photos for: {missing.join(", ")}
                        </p>
                      )}
                      {rejectedOnly.length > 0 && (
                        <p className="text-amber-600">
                          Rejected photos only (please upload a replacement) for:{" "}
                          {rejectedOnly.join(", ")}
                        </p>
                      )}
                    </div>
                  );
                })()}
                {/* Steve 5/8: when client reported "Living Room missing
                    even though the photo is loaded", inspecting the
                    issue showed photos tagged with non-required
                    categories (e.g. "Other"). Surface the actual
                    category labels stored in the DB so the owner can
                    see at a glance which categories were used and
                    re-tag if needed via Manage Images. */}
                {(() => {
                  const counted = images.filter((i) => i.status !== "rejected");
                  if (counted.length === 0) return null;
                  const categoryCounts = counted.reduce<Record<string, number>>(
                    (acc, i) => {
                      const k = i.room_category || "(no category)";
                      acc[k] = (acc[k] || 0) + 1;
                      return acc;
                    },
                    {},
                  );
                  const list = Object.entries(categoryCounts)
                    .sort((a, b) => a[0].localeCompare(b[0]))
                    .map(([k, n]) => `${k} (${n})`)
                    .join(", ");
                  return (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Photos on file by category: {list}
                    </p>
                  );
                })()}
              </CardContent>
            </Card>
          )}

          {/* Image grid grouped by room */}
          {Object.keys(groupedImages).length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center py-8 text-center">
                <ImageIcon className="mb-3 h-8 w-8 text-muted-foreground" />
                <p className="text-muted-foreground">
                  No images uploaded for this property yet.
                </p>
              </CardContent>
            </Card>
          ) : (
            Object.entries(groupedImages).map(([category, catImages]) => (
              <Card key={category}>
                <CardHeader>
                  <CardTitle className="text-base">{category}</CardTitle>
                  <CardDescription>{catImages.length} image(s)</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                    {catImages.map((img) => {
                      const colors = IMAGE_STATUS_COLORS[img.status] || IMAGE_STATUS_COLORS.pending;
                      return (
                        <div key={img.id} className="group relative rounded-md border overflow-hidden">
                          <div className="aspect-video bg-muted">
                            <img
                              src={img.image_url}
                              alt={`${category} photo`}
                              className="h-full w-full object-cover"
                            />
                          </div>
                          <div className="p-2 flex items-center justify-between">
                            <div className="flex items-center gap-1.5">
                              {statusIcon(img.status)}
                              <Badge className={`${colors.bg} ${colors.text} text-xs`}>
                                {img.status}
                              </Badge>
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100"
                              onClick={() => handleDelete(img.id)}
                            >
                              <Trash2 className="h-3.5 w-3.5 text-red-500" />
                            </Button>
                          </div>
                          {img.validation_notes && (
                            <p className="px-2 pb-2 text-xs text-muted-foreground">
                              {img.validation_notes}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </>
      )}
    </div>
  );
}
