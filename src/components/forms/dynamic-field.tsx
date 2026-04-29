"use client";

import type { ReactNode } from "react";
import { Label } from "@/components/ui/label";
import { fieldDisplay, type FieldMetaMap } from "@/lib/form-meta";

interface DynamicFieldProps {
  meta: FieldMetaMap;
  fieldKey: string;
  fallbackLabel: string;
  fallbackHelper?: string | null;
  fallbackRequired?: boolean;
  htmlFor?: string;
  className?: string;
  labelClassName?: string;
  children: ReactNode;
}

/**
 * Steve 4/28 round 2 — admin overlay for production form fields.
 * Renders the label + helper using metadata from /admin/forms when
 * present, otherwise falls back to the hardcoded copy. Hides the
 * whole block when admin set is_active=false.
 *
 * Usage:
 *   <DynamicField meta={meta} fieldKey="employment_type"
 *                 fallbackLabel="Current employment" htmlFor="employment_type">
 *     <Select ... />
 *   </DynamicField>
 */
export function DynamicField({
  meta,
  fieldKey,
  fallbackLabel,
  fallbackHelper,
  fallbackRequired,
  htmlFor,
  className,
  labelClassName,
  children,
}: DynamicFieldProps) {
  const display = fieldDisplay(meta, fieldKey, {
    label: fallbackLabel,
    helper: fallbackHelper,
    required: fallbackRequired,
  });
  if (display.hidden) return null;
  return (
    <div className={className ?? "space-y-2"}>
      <Label htmlFor={htmlFor} className={labelClassName}>
        {display.label}
        {display.required && <span className="ml-1 text-red-500">*</span>}
      </Label>
      {children}
      {display.helper && (
        <p className="text-xs text-muted-foreground">{display.helper}</p>
      )}
    </div>
  );
}

/**
 * Lightweight variant when the parent already has a Label
 * structure that can't be replaced — just gates visibility +
 * lets you pull the resolved label/helper as values.
 */
export function useFieldDisplay(meta: FieldMetaMap, fieldKey: string, fallback: { label: string; helper?: string | null; required?: boolean }) {
  return fieldDisplay(meta, fieldKey, fallback);
}
