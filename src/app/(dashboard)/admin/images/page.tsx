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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search, ExternalLink } from "lucide-react";

interface ImageRow {
  id: string;
  property_id: string;
  image_url: string;
  room_category: string;
  status: string;
  uploaded_at: string;
  property?: {
    id: string;
    address: string;
    city: string;
    owner_id: string | null;
  } | null;
  owner?: {
    full_name: string;
    email: string;
  } | null;
}

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-50 text-yellow-700",
  approved: "bg-green-50 text-green-700",
  rejected: "bg-red-50 text-red-700",
};

export default function AdminImagesPage() {
  const [images, setImages] = useState<ImageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [roomFilter, setRoomFilter] = useState<string>("all");
  const [savingId, setSavingId] = useState<string | null>(null);

  const supabase = createClient();

  // Steve 6/5 (6-2.md #26): the original two-query pattern using the
  // cookie-context client (PostgREST embed for property + second
  // profile fetch) silently dropped property/owner data so the
  // search-by-owner-name filter never matched. Swapped to a server
  // role API route that joins everything reliably.
  const load = useCallback(async () => {
    const res = await fetch("/api/admin/images", { cache: "no-store" });
    if (!res.ok) {
      setLoading(false);
      return;
    }
    const json = (await res.json()) as { images: ImageRow[] };
    setImages(json.images || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function changeStatus(id: string, status: string) {
    setSavingId(id);
    await supabase.from("property_images").update({ status }).eq("id", id);
    setImages((prev) => prev.map((i) => (i.id === id ? { ...i, status } : i)));
    setSavingId(null);
  }

  // Steve 5/6: dedup the room filter dropdown by canonicalising every
  // value (lowercase + underscore). Without this, "Living Room" and
  // "living_room" both showed up because the dashboard upload UI used
  // to write Title Case while the registration form used snake_case.
  function canonicalRoom(s: string | null | undefined): string {
    return (s || "").trim().toLowerCase().replace(/\s+/g, "_");
  }
  const roomOptions = Array.from(
    new Set(images.map((i) => canonicalRoom(i.room_category)).filter(Boolean)),
  ).sort();

  const filtered = images.filter((img) => {
    if (statusFilter !== "all" && img.status !== statusFilter) return false;
    if (roomFilter !== "all" && canonicalRoom(img.room_category) !== roomFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      const haystack = [
        img.property?.address,
        img.property?.city,
        img.room_category,
        img.owner?.full_name,
        img.owner?.email,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });

  const counts = {
    all: images.length,
    pending: images.filter((i) => i.status === "pending").length,
    approved: images.filter((i) => i.status === "approved").length,
    rejected: images.filter((i) => i.status === "rejected").length,
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold md:text-3xl">Image Library</h1>
        <p className="text-muted-foreground">
          All property photos uploaded across the platform. Approve, reject, or open in a new tab.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5 flex-1 min-w-[200px] max-w-md">
          <label className="text-xs text-muted-foreground">Search</label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Address, city, owner, room..."
              className="pl-9"
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <label className="text-xs text-muted-foreground">Status</label>
          <Select value={statusFilter} onValueChange={(v) => v && setStatusFilter(v)}>
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All ({counts.all})</SelectItem>
              <SelectItem value="pending">Pending ({counts.pending})</SelectItem>
              <SelectItem value="approved">Approved ({counts.approved})</SelectItem>
              <SelectItem value="rejected">Rejected ({counts.rejected})</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <label className="text-xs text-muted-foreground">Room</label>
          <Select value={roomFilter} onValueChange={(v) => v && setRoomFilter(v)}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All rooms</SelectItem>
              {roomOptions.map((r) => (
                <SelectItem key={r} value={r}>
                  {r}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {loading ? (
        <p className="text-muted-foreground py-8 text-center">Loading...</p>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No images match your filters.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {filtered.map((img) => {
            const owner = img.owner;
            return (
              <Card key={img.id} className="overflow-hidden flex flex-col">
                <div className="aspect-[4/3] bg-muted relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={img.image_url}
                    alt={img.room_category}
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                  <Badge
                    className={`absolute top-2 left-2 text-xs ${STATUS_COLORS[img.status] || ""}`}
                  >
                    {img.status}
                  </Badge>
                </div>
                <CardHeader className="pb-1">
                  <CardTitle className="text-sm truncate">{img.room_category}</CardTitle>
                  <CardDescription className="text-xs">
                    {img.property?.address || "(deleted property)"}, {img.property?.city}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-2 text-xs flex-1 flex flex-col justify-between">
                  {owner && (
                    <div className="text-muted-foreground">
                      <p className="font-medium text-foreground">{owner.full_name}</p>
                      <p className="truncate">{owner.email}</p>
                    </div>
                  )}
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    <Button
                      size="sm"
                      variant={img.status === "approved" ? "default" : "outline"}
                      onClick={() => changeStatus(img.id, "approved")}
                      disabled={savingId === img.id}
                      className="flex-1 h-7 text-xs"
                    >
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant={img.status === "rejected" ? "default" : "outline"}
                      onClick={() => changeStatus(img.id, "rejected")}
                      disabled={savingId === img.id}
                      className="flex-1 h-7 text-xs"
                    >
                      Reject
                    </Button>
                    <a
                      href={img.image_url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center justify-center rounded-md border h-7 px-2 hover:bg-muted"
                      title="Open in new tab"
                    >
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
