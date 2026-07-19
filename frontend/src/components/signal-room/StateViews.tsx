import { AlertTriangle, Inbox, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function ErrorState({ message = "Something went wrong loading this data.", className }: { message?: string; className?: string }) {
  return (
    <div role="alert" className={cn("flex items-center gap-3 rounded-xl border border-sr-destructive/30 bg-sr-destructive/10 p-4 text-sm text-sr-destructive", className)}>
      <AlertTriangle className="h-5 w-5 shrink-0" aria-hidden="true" />
      <span>{message}</span>
    </div>
  );
}

export function EmptyState({ title, hint, icon: Icon = Inbox, action, className }: { title: string; hint?: string; icon?: LucideIcon; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-sr-border bg-sr-card/50 p-10 text-center", className)}>
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-sr-muted text-sr-muted-foreground">
        <Icon className="h-6 w-6" aria-hidden="true" />
      </div>
      <div className="space-y-1">
        <p className="font-medium text-sr-foreground">{title}</p>
        {hint && <p className="mx-auto max-w-sm text-sm text-sr-muted-foreground">{hint}</p>}
      </div>
      {action}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-sr-muted", className)} aria-hidden="true" />;
}
