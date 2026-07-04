/**
 * frontend/src/components/ChangeLogWidget.tsx
 * ===============================================
 * Left-sidebar panel on the Account Overview screen: recent documented
 * changes for this account, plus a "+ Log" button that opens the Change
 * Documentation Form in a modal. Degrades gracefully if the Change History
 * Apps Script hasn't been deployed yet (configured=false from the backend).
 */

import { useEffect, useState, useCallback } from "react";
import { Plus, History, Clock } from "lucide-react";
import { fetchRecentChanges, type ChangeRecord } from "@/lib/api";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { ChangeDocumentationForm } from "@/components/ChangeDocumentationForm";
import { cn } from "@/lib/utils";

const PRIORITY_STYLES: Record<string, string> = {
  Low:      "bg-muted text-muted-foreground",
  Medium:   "bg-blue-500/15 text-blue-400",
  High:     "bg-amber-500/15 text-amber-400",
  Critical: "bg-red-500/15 text-red-400",
};

const APPROVAL_STYLES: Record<string, string> = {
  "Not Required": "bg-muted text-muted-foreground",
  "Pending":      "bg-amber-500/15 text-amber-400",
  "Approved":     "bg-emerald-500/15 text-emerald-400",
  "Rejected":     "bg-red-500/15 text-red-400",
};

export function ChangeLogWidget({ accountId }: { accountId: string }) {
  const [changes, setChanges]     = useState<ChangeRecord[]>([]);
  const [configured, setConfigured] = useState(true);
  const [loading, setLoading]     = useState(true);
  const [formOpen, setFormOpen]   = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchRecentChanges(accountId, 10);
      setChanges(data.changes);
      setConfigured(data.configured);
    } catch {
      setConfigured(false);
    } finally {
      setLoading(false);
    }
  }, [accountId]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="rounded-2xl border border-border bg-card/60 backdrop-blur-2xl shadow-card p-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <History className="w-4 h-4 text-gold" />
          <h3 className="font-semibold text-foreground">Change Log</h3>
        </div>
        <button
          onClick={() => setFormOpen(true)}
          className="flex items-center gap-1 rounded-lg bg-gold-gradient px-2.5 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 transition-opacity"
        >
          <Plus className="w-3.5 h-3.5" /> Log
        </button>
      </div>

      <div className="mt-4 flex flex-col gap-3">
        {loading && (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-12 rounded-lg bg-muted/40 animate-pulse" />
            ))}
          </div>
        )}

        {!loading && !configured && (
          <p className="text-xs text-muted-foreground">
            Change History isn't connected yet. Once its Google Sheet is deployed, changes logged here will appear.
          </p>
        )}

        {!loading && configured && changes.length === 0 && (
          <p className="text-xs text-muted-foreground">No changes documented yet for this account.</p>
        )}

        {!loading && configured && changes.map((c) => (
          <div key={c.change_id} className="rounded-lg border border-border/60 px-3 py-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-foreground truncate">{c.change_type}</span>
              <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium", PRIORITY_STYLES[c.priority] ?? PRIORITY_STYLES.Medium)}>
                {c.priority}
              </span>
            </div>
            <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
              <Clock className="w-3 h-3" />
              {new Date(c.timestamp).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
              <span>·</span>
              <span className="truncate">{c.change_category}</span>
              {c.approval_status !== "Not Required" && (
                <span className={cn("rounded-full px-1.5 py-0.5 text-[10px]", APPROVAL_STYLES[c.approval_status] ?? "")}>
                  {c.approval_status}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-xl bg-transparent border-0 shadow-none p-0">
          <DialogTitle className="sr-only">Log a change</DialogTitle>
          <div className="max-h-[85vh] overflow-y-auto pr-1 rounded-2xl border border-border bg-card p-6 shadow-card">
            <ChangeDocumentationForm
              accountId={accountId}
              onCancel={() => setFormOpen(false)}
              onSaved={() => { setFormOpen(false); load(); }}
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
