"use client";

import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { X, Upload, AlertCircle, CheckCircle2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const ROOM_CATEGORIES = [
  { value: "living_room", label: "Living Room" },
  { value: "bedroom", label: "Bedroom" },
  { value: "kitchen", label: "Kitchen" },
  { value: "bathroom", label: "Bathroom" },
  { value: "dining_room", label: "Dining Room" },
  { value: "office", label: "Office / Study" },
  { value: "balcony", label: "Balcony / Terrace" },
  { value: "exterior", label: "Exterior / Facade" },
  { value: "common_areas", label: "Common Areas" },
  { value: "parking", label: "Parking / Garage" },
];

interface ImageWithMeta {
  file: File;
  preview: string;
  room: string;
  validation: {
    resolution_ok: boolean;
    orientation: "landscape" | "portrait";
    file_size_ok: boolean;
    status: "green" | "yellow" | "red";
    message: string;
  };
}

interface ImageUploadProps {
  images: ImageWithMeta[];
  onImagesChange: (images: ImageWithMeta[]) => void;
  maxImages?: number;
}

function validateImage(file: File): Promise<ImageWithMeta["validation"]> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const width = img.width;
      const height = img.height;
      const orientation = width >= height ? "landscape" : "portrait";
      const resolution_ok = width >= 1280;
      const file_size_ok = file.size <= 10 * 1024 * 1024; // 10MB max
      const min_weight_ok = file.size >= 100 * 1024; // 100KB min (avoid screenshots)

      let status: "green" | "yellow" | "red" = "green";
      let message = "All checks passed";

      if (!resolution_ok) {
        status = "red";
        message = `Resolution too low (${width}px wide). Minimum: 1280px width.`;
      } else if (!file_size_ok) {
        status = "red";
        message = `File too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Maximum: 10MB.`;
      } else if (!min_weight_ok) {
        status = "red";
        message = `File too small (${(file.size / 1024).toFixed(0)}KB). Minimum: 100KB. Screenshots are not accepted.`;
      } else if (orientation === "portrait") {
        status = "yellow";
        message = "Portrait orientation detected. Landscape is preferred.";
      }

      resolve({ resolution_ok, orientation, file_size_ok, status, message });
    };
    img.onerror = () => {
      resolve({
        resolution_ok: false,
        orientation: "landscape",
        file_size_ok: file.size <= 10 * 1024 * 1024,
        status: "red",
        message: "Could not read image dimensions.",
      });
    };
    img.src = URL.createObjectURL(file);
  });
}

export function ImageUpload({
  images,
  onImagesChange,
  maxImages = 20,
}: ImageUploadProps) {
  const [selectedRoom, setSelectedRoom] = useState("living_room");

  const [rejectedMessages, setRejectedMessages] = useState<string[]>([]);

  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      const remaining = maxImages - images.length;
      const newFiles = acceptedFiles.slice(0, remaining);

      const newImages: ImageWithMeta[] = [];
      const rejected: string[] = [];
      for (const file of newFiles) {
        const validation = await validateImage(file);
        if (validation.status === "red") {
          rejected.push(`${file.name}: ${validation.message}`);
        } else {
          newImages.push({
            file,
            preview: URL.createObjectURL(file),
            room: selectedRoom,
            validation,
          });
        }
      }

      if (rejected.length > 0) {
        setRejectedMessages(rejected);
        setTimeout(() => setRejectedMessages([]), 8000);
      }

      if (newImages.length > 0) {
        onImagesChange([...images, ...newImages]);
      }
    },
    [images, maxImages, onImagesChange, selectedRoom]
  );

  const removeImage = (index: number) => {
    URL.revokeObjectURL(images[index].preview);
    onImagesChange(images.filter((_, i) => i !== index));
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "image/jpeg": [".jpg", ".jpeg"],
      "image/png": [".png"],
      "image/webp": [".webp"],
      "image/heic": [".heic"],
    },
    maxSize: 10 * 1024 * 1024,
    disabled: images.length >= maxImages,
  });

  const statusIcon = (status: "green" | "yellow" | "red") => {
    if (status === "green")
      return <CheckCircle2 className="h-4 w-4 text-green-500" />;
    if (status === "yellow")
      return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
    return <AlertCircle className="h-4 w-4 text-red-500" />;
  };

  return (
    <div className="space-y-4">
      {/* 6-Rule Checklist */}
      <div className="rounded-lg border bg-muted/30 p-4">
        <p className="mb-2 text-sm font-medium">Photo Guidelines</p>
        <ol className="space-y-1 text-xs text-muted-foreground list-decimal list-inside">
          <li>Images must be well-lit (natural light preferred)</li>
          <li>Rooms must be clean and staged</li>
          <li>No personal items or people visible</li>
          <li>No people or pets (not even in reflections of mirrors or shiny surfaces)</li>
          <li>Horizontal / landscape orientation preferred</li>
          <li>Minimum resolution: 1280px width. Minimum file size: 100KB</li>
        </ol>
      </div>

      {/* Rejection messages */}
      {rejectedMessages.length > 0 && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 space-y-1">
          <p className="text-sm font-medium text-red-600">Images rejected:</p>
          {rejectedMessages.map((msg, i) => (
            <p key={i} className="text-xs text-red-500">{msg}</p>
          ))}
        </div>
      )}

      {/* Room selector */}
      <div className="space-y-2">
        <Label>Room category for upload</Label>
        <Select value={selectedRoom} onValueChange={(val) => { if (val) setSelectedRoom(val); }}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ROOM_CATEGORIES.map((room) => (
              <SelectItem key={room.value} value={room.value}>
                {room.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Dropzone */}
      <div
        {...getRootProps()}
        className={`flex min-h-[120px] cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-6 transition-colors ${
          isDragActive
            ? "border-primary bg-primary/5"
            : images.length >= maxImages
              ? "cursor-not-allowed border-muted bg-muted/50"
              : "border-muted-foreground/25 hover:border-primary/50"
        }`}
      >
        <input {...getInputProps()} />
        <Upload className="mb-2 h-8 w-8 text-muted-foreground" />
        {images.length >= maxImages ? (
          <p className="text-sm text-muted-foreground">
            Maximum of {maxImages} images reached
          </p>
        ) : isDragActive ? (
          <p className="text-sm text-primary">Drop images here...</p>
        ) : (
          <div className="text-center">
            <p className="text-sm text-muted-foreground">
              Drag images here or click to select
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              JPG, PNG, WebP or HEIC. Max 10MB per image. ({images.length}/
              {maxImages})
            </p>
          </div>
        )}
      </div>

      {/* Image grid with validation */}
      {images.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {images.map((img, index) => (
            <div
              key={index}
              className={`group relative overflow-hidden rounded-lg border ${
                img.validation.status === "red"
                  ? "border-red-300"
                  : img.validation.status === "yellow"
                    ? "border-yellow-300"
                    : "border-green-300"
              }`}
            >
              <div className="relative aspect-square">
                <img
                  src={img.preview}
                  alt={`${img.room} ${index + 1}`}
                  className="h-full w-full object-cover"
                />
                <Button
                  type="button"
                  variant="destructive"
                  size="icon"
                  className="absolute right-1 top-1 h-6 w-6 opacity-0 transition-opacity group-hover:opacity-100"
                  onClick={() => removeImage(index)}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
              <div className="flex items-center gap-1.5 px-2 py-1.5">
                {statusIcon(img.validation.status)}
                <span className="text-xs text-muted-foreground truncate">
                  {ROOM_CATEGORIES.find((r) => r.value === img.room)?.label}
                </span>
              </div>
              {img.validation.status !== "green" && (
                <p className="px-2 pb-1.5 text-xs text-muted-foreground">
                  {img.validation.message}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export type { ImageWithMeta };
