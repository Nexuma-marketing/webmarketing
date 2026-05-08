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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Plus, Trash2, ChevronUp, ChevronDown, Pencil } from "lucide-react";

interface FormDef {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  target_role: string | null;
  is_active: boolean;
}

interface Question {
  id: string;
  form_id: string;
  position: number;
  field_key: string;
  label: string;
  question_type: string;
  options: { value: string; label: string }[] | null;
  required: boolean;
  is_active: boolean;
  conditional_on: string | null;
  conditional_value: string | null;
  helper_text: string | null;
}

const QUESTION_TYPES = [
  { value: "text", label: "Short text" },
  { value: "textarea", label: "Long text" },
  { value: "number", label: "Number" },
  { value: "email", label: "Email" },
  { value: "phone", label: "Phone" },
  { value: "select", label: "Single select (dropdown)" },
  { value: "multiselect", label: "Multi select" },
  { value: "radio", label: "Radio buttons" },
  { value: "checkbox", label: "Checkbox" },
  { value: "date", label: "Date" },
  { value: "yesno", label: "Yes / No" },
];

const NEEDS_OPTIONS = ["select", "multiselect", "radio"];

export default function AdminFormsPage() {
  const [forms, setForms] = useState<FormDef[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [selectedFormId, setSelectedFormId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [formDialogOpen, setFormDialogOpen] = useState(false);
  const [editForm, setEditForm] = useState<Partial<FormDef> | null>(null);

  const [questionDialogOpen, setQuestionDialogOpen] = useState(false);
  const [editQuestion, setEditQuestion] = useState<Partial<Question> | null>(null);

  const supabase = createClient();

  const loadForms = useCallback(async () => {
    const { data } = await supabase
      .from("forms_dynamic")
      .select("*")
      .order("name");
    const list = (data as FormDef[]) || [];
    setForms(list);
    if (!selectedFormId && list.length > 0) setSelectedFormId(list[0].id);
    setLoading(false);
  }, [supabase, selectedFormId]);

  const loadQuestions = useCallback(async () => {
    if (!selectedFormId) {
      setQuestions([]);
      return;
    }
    const { data } = await supabase
      .from("form_questions")
      .select("*")
      .eq("form_id", selectedFormId)
      .order("position");
    setQuestions((data as Question[]) || []);
  }, [supabase, selectedFormId]);

  useEffect(() => {
    loadForms();
  }, [loadForms]);

  useEffect(() => {
    loadQuestions();
  }, [loadQuestions]);

  // ── Form CRUD ─────────────────────────────────
  function openNewForm() {
    setEditForm({
      slug: "",
      name: "",
      description: "",
      target_role: "",
      is_active: true,
    });
    setFormDialogOpen(true);
  }

  function openEditForm(f: FormDef) {
    setEditForm({ ...f });
    setFormDialogOpen(true);
  }

  async function saveForm() {
    if (!editForm?.name || !editForm?.slug) return;
    setSaving(true);
    const payload = {
      slug: editForm.slug,
      name: editForm.name,
      description: editForm.description || null,
      target_role: editForm.target_role || null,
      is_active: editForm.is_active ?? true,
    };
    if (editForm.id) {
      await supabase.from("forms_dynamic").update(payload).eq("id", editForm.id);
    } else {
      const { data } = await supabase.from("forms_dynamic").insert(payload).select().single();
      if (data) setSelectedFormId(data.id);
    }
    setSaving(false);
    setFormDialogOpen(false);
    setEditForm(null);
    loadForms();
  }

  async function deleteForm(id: string) {
    if (!confirm("Delete this form and ALL its questions? This cannot be undone.")) return;
    await supabase.from("forms_dynamic").delete().eq("id", id);
    if (selectedFormId === id) setSelectedFormId(null);
    loadForms();
  }

  // ── Question CRUD ──────────────────────────────
  function openNewQuestion() {
    setEditQuestion({
      form_id: selectedFormId || "",
      position: questions.length,
      field_key: "",
      label: "",
      question_type: "text",
      options: [],
      required: false,
      is_active: true,
      conditional_on: null,
      conditional_value: null,
      helper_text: "",
    });
    setQuestionDialogOpen(true);
  }

  function openEditQuestion(q: Question) {
    setEditQuestion({ ...q, options: q.options || [] });
    setQuestionDialogOpen(true);
  }

  async function saveQuestion() {
    if (!editQuestion?.field_key || !editQuestion?.label || !selectedFormId) return;
    setSaving(true);
    // Steve 5/7: trim empty option rows before persisting so a half-typed
    // "Add option" click does not leak a {value:"", label:""} entry into
    // form_questions.options. The public form rendered an empty checkbox
    // for every such row.
    const trimmedOptions = (editQuestion.options ?? [])
      .map((o) => ({ value: o.value.trim(), label: o.label.trim() }))
      .filter((o) => o.value !== "" || o.label !== "");
    const payload = {
      form_id: selectedFormId,
      position: editQuestion.position ?? questions.length,
      field_key: editQuestion.field_key,
      label: editQuestion.label,
      question_type: editQuestion.question_type || "text",
      options: NEEDS_OPTIONS.includes(editQuestion.question_type || "")
        ? trimmedOptions
        : null,
      required: editQuestion.required ?? false,
      is_active: editQuestion.is_active ?? true,
      conditional_on: editQuestion.conditional_on || null,
      conditional_value: editQuestion.conditional_value || null,
      helper_text: editQuestion.helper_text || null,
    };
    if (editQuestion.id) {
      await supabase.from("form_questions").update(payload).eq("id", editQuestion.id);
    } else {
      await supabase.from("form_questions").insert(payload);
    }
    setSaving(false);
    setQuestionDialogOpen(false);
    setEditQuestion(null);
    loadQuestions();
  }

  async function deleteQuestion(id: string) {
    if (!confirm("Delete this question?")) return;
    await supabase.from("form_questions").delete().eq("id", id);
    loadQuestions();
  }

  async function moveQuestion(id: string, direction: "up" | "down") {
    const idx = questions.findIndex((q) => q.id === id);
    if (idx < 0) return;
    const swapWith = direction === "up" ? idx - 1 : idx + 1;
    if (swapWith < 0 || swapWith >= questions.length) return;
    const a = questions[idx];
    const b = questions[swapWith];
    await supabase.from("form_questions").update({ position: b.position }).eq("id", a.id);
    await supabase.from("form_questions").update({ position: a.position }).eq("id", b.id);
    loadQuestions();
  }

  async function toggleQuestionActive(q: Question) {
    await supabase
      .from("form_questions")
      .update({ is_active: !q.is_active })
      .eq("id", q.id);
    loadQuestions();
  }

  function addOption() {
    if (!editQuestion) return;
    setEditQuestion({
      ...editQuestion,
      options: [...(editQuestion.options || []), { value: "", label: "" }],
    });
  }

  function updateOption(idx: number, field: "value" | "label", value: string) {
    if (!editQuestion?.options) return;
    const opts = [...editQuestion.options];
    opts[idx] = { ...opts[idx], [field]: value };
    setEditQuestion({ ...editQuestion, options: opts });
  }

  function removeOption(idx: number) {
    if (!editQuestion?.options) return;
    setEditQuestion({
      ...editQuestion,
      options: editQuestion.options.filter((_, i) => i !== idx),
    });
  }

  const selectedForm = forms.find((f) => f.id === selectedFormId);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-muted-foreground">Loading forms...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold md:text-3xl">Form Builder</h1>
          <p className="text-muted-foreground">
            Create and edit dynamic forms. Add questions, change order, mark required, attach conditional logic.
          </p>
        </div>
        <Button onClick={openNewForm}>
          <Plus className="mr-2 h-4 w-4" />
          New form
        </Button>
      </div>

      {/* Form picker */}
      <div className="flex flex-wrap items-center gap-3">
        <Label>Form:</Label>
        {forms.length === 0 ? (
          <span className="text-sm text-muted-foreground">
            No forms yet. Click &ldquo;New form&rdquo; to create one.
          </span>
        ) : (
          <>
            <Select value={selectedFormId || ""} onValueChange={(v) => v && setSelectedFormId(v)}>
              <SelectTrigger className="w-[300px]">
                <SelectValue placeholder="Pick a form" />
              </SelectTrigger>
              <SelectContent>
                {forms.map((f) => (
                  <SelectItem key={f.id} value={f.id}>
                    {f.name} {!f.is_active && "(inactive)"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedForm && (
              <>
                <Button variant="outline" size="sm" onClick={() => openEditForm(selectedForm)}>
                  <Pencil className="mr-1 h-3.5 w-3.5" />
                  Edit form info
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-red-600"
                  onClick={() => deleteForm(selectedForm.id)}
                >
                  <Trash2 className="mr-1 h-3.5 w-3.5" />
                  Delete form
                </Button>
              </>
            )}
          </>
        )}
      </div>

      {selectedForm && (
        <Card>
          <CardHeader className="flex flex-row items-start justify-between">
            <div>
              <CardTitle className="text-base">{selectedForm.name}</CardTitle>
              <CardDescription>
                {selectedForm.description || "No description"} ·{" "}
                <code className="text-xs">{selectedForm.slug}</code>
                {selectedForm.target_role && ` · Target role: ${selectedForm.target_role}`}
                {!selectedForm.is_active && (
                  <Badge variant="outline" className="ml-2">Inactive</Badge>
                )}
              </CardDescription>
            </div>
            <Button onClick={openNewQuestion}>
              <Plus className="mr-2 h-4 w-4" />
              New question
            </Button>
          </CardHeader>
          <CardContent>
            {questions.length === 0 ? (
              <p className="py-8 text-center text-muted-foreground">
                No questions yet. Add the first one.
              </p>
            ) : (
              <div className="space-y-2">
                {questions.map((q, i) => (
                  <div
                    key={q.id}
                    className={`flex items-start gap-3 rounded-md border p-3 ${
                      !q.is_active ? "opacity-60" : ""
                    }`}
                  >
                    <div className="flex flex-col gap-1">
                      <button
                        type="button"
                        className="text-muted-foreground disabled:opacity-30"
                        disabled={i === 0}
                        onClick={() => moveQuestion(q.id, "up")}
                      >
                        <ChevronUp className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        className="text-muted-foreground disabled:opacity-30"
                        disabled={i === questions.length - 1}
                        onClick={() => moveQuestion(q.id, "down")}
                      >
                        <ChevronDown className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <code className="text-xs text-muted-foreground">{q.field_key}</code>
                        <Badge variant="outline" className="text-xs">{q.question_type}</Badge>
                        {q.required && <Badge className="text-xs">Required</Badge>}
                        {q.conditional_on && (
                          <Badge variant="outline" className="text-xs bg-purple-50 text-purple-700">
                            if {q.conditional_on} = {q.conditional_value}
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm font-medium mt-1">{q.label}</p>
                      {q.helper_text && (
                        <p className="text-xs text-muted-foreground italic">{q.helper_text}</p>
                      )}
                      {q.options && q.options.length > 0 && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Options: {q.options.map((o) => o.label).join(", ")}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={q.is_active}
                        onCheckedChange={() => toggleQuestionActive(q)}
                      />
                      <Button variant="outline" size="sm" onClick={() => openEditQuestion(q)}>
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => deleteQuestion(q.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-red-500" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Form dialog */}
      <Dialog open={formDialogOpen} onOpenChange={setFormDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editForm?.id ? "Edit Form" : "New Form"}</DialogTitle>
            <DialogDescription>
              The slug is used in URLs and code. Keep it short and lowercase.
            </DialogDescription>
          </DialogHeader>
          {editForm && (
            <div className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input
                  value={editForm.name || ""}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Slug</Label>
                <Input
                  value={editForm.slug || ""}
                  onChange={(e) =>
                    setEditForm({ ...editForm, slug: e.target.value.toLowerCase().replace(/\s/g, "-") })
                  }
                  placeholder="e.g., tenant-extra-info"
                />
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea
                  value={editForm.description || ""}
                  onChange={(e) =>
                    setEditForm({ ...editForm, description: e.target.value })
                  }
                  rows={2}
                />
              </div>
              <div className="space-y-2">
                <Label>Target role (optional — restrict who sees this form)</Label>
                <Select
                  value={editForm.target_role || "any"}
                  onValueChange={(v) =>
                    v && setEditForm({ ...editForm, target_role: v === "any" ? "" : v })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any">Anyone (no restriction)</SelectItem>
                    <SelectItem value="propietario">Property Owner</SelectItem>
                    <SelectItem value="inversionista">Investor</SelectItem>
                    <SelectItem value="inquilino">Tenant</SelectItem>
                    <SelectItem value="pymes">Business Owner</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-3">
                <Switch
                  checked={editForm.is_active ?? true}
                  onCheckedChange={(c) => setEditForm({ ...editForm, is_active: c })}
                />
                <Label>Active (visible to users)</Label>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={saveForm} disabled={saving}>
              {saving ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Question dialog */}
      <Dialog open={questionDialogOpen} onOpenChange={setQuestionDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editQuestion?.id ? "Edit Question" : "New Question"}</DialogTitle>
            <DialogDescription>
              Configure the question type, options, and visibility logic.
            </DialogDescription>
          </DialogHeader>
          {editQuestion && (
            <div className="space-y-4 pt-2">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Field key (DB column / data key)</Label>
                  <Input
                    value={editQuestion.field_key || ""}
                    onChange={(e) =>
                      setEditQuestion({
                        ...editQuestion,
                        field_key: e.target.value.toLowerCase().replace(/\s/g, "_"),
                      })
                    }
                    placeholder="e.g., has_pets"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Question type</Label>
                  <Select
                    value={editQuestion.question_type || "text"}
                    onValueChange={(v) =>
                      v && setEditQuestion({ ...editQuestion, question_type: v })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {QUESTION_TYPES.map((t) => (
                        <SelectItem key={t.value} value={t.value}>
                          {t.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Label (visible to user)</Label>
                <Input
                  value={editQuestion.label || ""}
                  onChange={(e) =>
                    setEditQuestion({ ...editQuestion, label: e.target.value })
                  }
                  placeholder="Do you have pets?"
                />
              </div>
              <div className="space-y-2">
                <Label>Helper text (optional)</Label>
                <Input
                  value={editQuestion.helper_text || ""}
                  onChange={(e) =>
                    setEditQuestion({ ...editQuestion, helper_text: e.target.value })
                  }
                  placeholder="Shown under the question to guide the user"
                />
              </div>

              {NEEDS_OPTIONS.includes(editQuestion.question_type || "") && (
                <div className="space-y-2 rounded-md border p-3">
                  <Label className="flex items-center justify-between">
                    Options
                    <Button type="button" variant="outline" size="sm" onClick={addOption}>
                      <Plus className="mr-1 h-3 w-3" />
                      Add option
                    </Button>
                  </Label>
                  {(editQuestion.options || []).length === 0 && (
                    <p className="text-xs text-muted-foreground">No options yet — add at least one.</p>
                  )}
                  {(editQuestion.options || []).map((opt, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <Input
                        placeholder="value (stored)"
                        value={opt.value}
                        onChange={(e) => updateOption(idx, "value", e.target.value)}
                        className="flex-1"
                      />
                      <Input
                        placeholder="label (shown)"
                        value={opt.label}
                        onChange={(e) => updateOption(idx, "label", e.target.value)}
                        className="flex-1"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeOption(idx)}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-red-500" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              <div className="rounded-md border p-3 space-y-3 bg-muted/30">
                <p className="text-sm font-medium">Conditional visibility (optional)</p>
                <p className="text-xs text-muted-foreground">
                  Show this question only when another question has a specific value. Leave blank to always show.
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Show when this field key</Label>
                    <Input
                      value={editQuestion.conditional_on || ""}
                      onChange={(e) =>
                        setEditQuestion({
                          ...editQuestion,
                          conditional_on: e.target.value || null,
                        })
                      }
                      placeholder="e.g., has_pets"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">equals this value</Label>
                    <Input
                      value={editQuestion.conditional_value || ""}
                      onChange={(e) =>
                        setEditQuestion({
                          ...editQuestion,
                          conditional_value: e.target.value || null,
                        })
                      }
                      placeholder="e.g., yes"
                    />
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-6">
                <div className="flex items-center gap-2">
                  <Switch
                    checked={editQuestion.required ?? false}
                    onCheckedChange={(c) =>
                      setEditQuestion({ ...editQuestion, required: c })
                    }
                  />
                  <Label>Required</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={editQuestion.is_active ?? true}
                    onCheckedChange={(c) =>
                      setEditQuestion({ ...editQuestion, is_active: c })
                    }
                  />
                  <Label>Active</Label>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setQuestionDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={saveQuestion} disabled={saving}>
              {saving ? "Saving..." : "Save question"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
