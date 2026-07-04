/**
 * frontend/src/components/ChangeDocumentationForm.tsx
 * ======================================================
 * Documents one optimization change for an account (v1: account-scoped,
 * not campaign-scoped — see backend/change_history.py for why). Appends
 * an immutable record via POST /api/changes; there is no edit/delete —
 * a correction is a new record referencing the one it corrects in Notes.
 */

import { useState } from "react";
import { logChange } from "@/lib/api";
import { CHANGE_CATEGORIES, CHANGE_TAXONOMY, PRIORITIES, type Priority } from "@/lib/changeTaxonomy";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export function ChangeDocumentationForm({
  accountId,
  onSaved,
  onCancel,
}: {
  accountId: string;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [category, setCategory]   = useState("");
  const [changeType, setChangeType] = useState("");
  const [customType, setCustomType] = useState("");
  const [previousValue, setPreviousValue] = useState("");
  const [newValue, setNewValue]     = useState("");
  const [reason, setReason]         = useState("");
  const [expectedImpact, setExpectedImpact] = useState("");
  const [notes, setNotes]           = useState("");
  const [priority, setPriority]     = useState<Priority>("Medium");
  const [saving, setSaving]         = useState(false);
  const [error, setError]           = useState<string | null>(null);

  const isCustomCategory = category === "Custom Changes" || category === "Others";
  const typeOptions = category ? CHANGE_TAXONOMY[category] ?? [] : [];

  const effectiveChangeType = isCustomCategory ? customType.trim() : changeType;
  const canSubmit =
    category !== "" &&
    effectiveChangeType !== "" &&
    reason.trim().length >= 10 &&
    !saving;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSaving(true);
    setError(null);
    try {
      await logChange({
        account_id:       accountId,
        change_category:  category,
        change_type:      effectiveChangeType,
        previous_value:   previousValue.trim() || undefined,
        new_value:        newValue.trim() || undefined,
        reason:           reason.trim(),
        expected_impact:  expectedImpact.trim() || undefined,
        notes:            notes.trim() || undefined,
        priority,
      });
      toast.success("Change recorded");
      onSaved();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to save change.";
      setError(msg);
      toast.error("Couldn't save change", { description: msg });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-lg font-bold text-foreground">Log a change</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          This record can't be edited or deleted after saving — review before submitting.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <Label>Change category</Label>
          <Select value={category} onValueChange={(v) => { setCategory(v); setChangeType(""); }}>
            <SelectTrigger><SelectValue placeholder="Select a category" /></SelectTrigger>
            <SelectContent>
              {CHANGE_CATEGORIES.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>Change type</Label>
          {isCustomCategory ? (
            <Input
              value={customType}
              onChange={(e) => setCustomType(e.target.value)}
              placeholder="Describe the change type"
              disabled={!category}
            />
          ) : (
            <Select value={changeType} onValueChange={setChangeType} disabled={!category}>
              <SelectTrigger><SelectValue placeholder={category ? "Select a type" : "Pick a category first"} /></SelectTrigger>
              <SelectContent>
                {typeOptions.map((t) => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <Label>Previous value</Label>
          <Input value={previousValue} onChange={(e) => setPreviousValue(e.target.value)} placeholder="e.g. ₹5,000/day" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>New value</Label>
          <Input value={newValue} onChange={(e) => setNewValue(e.target.value)} placeholder="e.g. ₹7,500/day" />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>Reason <span className="text-muted-foreground font-normal">— why was this change made?</span></Label>
        <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} placeholder="Minimum 10 characters" />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>Expected impact <span className="text-muted-foreground font-normal">(optional)</span></Label>
        <Textarea value={expectedImpact} onChange={(e) => setExpectedImpact(e.target.value)} rows={2} placeholder="What do you expect to happen, and by when?" />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <Label>Priority</Label>
          <div className="flex items-center gap-1 rounded-lg bg-accent/40 p-1 border border-border">
            {PRIORITIES.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPriority(p)}
                className={cn(
                  "flex-1 px-2 py-1.5 rounded-md text-xs font-medium transition-colors",
                  priority === p ? "bg-gold-gradient text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Notes <span className="text-muted-foreground font-normal">(optional)</span></Label>
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anything else worth recording" />
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="ghost" onClick={onCancel} disabled={saving}>Cancel</Button>
        <Button onClick={handleSubmit} disabled={!canSubmit}>
          {saving ? "Saving…" : "Save change record"}
        </Button>
      </div>
    </div>
  );
}
