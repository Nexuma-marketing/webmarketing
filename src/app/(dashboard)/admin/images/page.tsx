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
  properties?: {
    id: string;
    address: string;
    city: string;
    owner_id: string;
  } | null;
}

interface OwnerInfo {
  id: string;
  full_name: string;
  email: string;
}

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-50 text-yellow-700",
  approved: "bg-green-50 text-green-700",
  rejected: "bg-red-50 text-red-700",
};

export default function AdminImagesPage() {
  const [images, setImages] = useState<ImageRow[]>([]);
  const [owners, setOwners] = useState<Record<string, OwnerInfo>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [roomFilter, setRoomFilter] = useState<string>("all");
  const [savingId, setSavingId] = useState<string | null>(null);

  const supabase = createClient();

  const load = useCallback(async () => {
    // Steve 4/29: column is `uploaded_at`, not `created_at`. The previous query
    // errored out silently and the page rendered "no images" even when uploads
    // existed.
    const { data: imageData } = await supabase
      .from("property_images")
      .select("id, property_id, image_url, room_category, status, uploaded_at, properties:property_id(id, address, city, owner_id)")
      .order("uploaded_at", { ascending: false })
      .limit(500);

    const list = (imageData as unknown as ImageRow[]) || [];
    setImages(list);

    const ownerIds = Array.from(
      new Set(list.map((i) => i.properties?.owner_id).filter((x): x is string => !!x)),
    );
    if (ownerIds.length > 0) {
      const { data: ownerData } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", ownerIds);
      const map: Record<string, OwnerInfo> = {};
      (ownerData || []).forEach((o) => {
        map[o.id] = o;
      });
      setOwners(map);
    }

    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  async function changeStatus(id: string, status: string) {
    setSavingId(id);
    await supabase.from("property_images").update({ status }).eq("id", id);
    setImages((prev) => prev.map((i) => (i.id === id ? { ...i, status } : i)));
    setSavingId(null);
  }

  const roomOptions = Array.from(new Set(images.map((i) => i.room_category).filter(Boolean)));

  const filtered = images.filter((img) => {
    if (statusFilter !== "all" && img.status !== statusFilter) return false;
    if (roomFilter !== "all" && img.room_category !== roomFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      const owner = img.properties ? owners[img.properties.owner_id] : null;
      const haystack = [
        img.properties?.address,
        img.properties?.city,
        img.room_category,
        owner?.full_name,
        owner?.email,
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
            const owner = img.properties ? owners[img.properties.owner_id] : null;
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
                    {img.properties?.address || "(deleted property)"}, {img.properties?.city}
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
