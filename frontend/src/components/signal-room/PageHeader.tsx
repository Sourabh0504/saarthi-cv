import type { ReactNode } from "react";

export function PageHeader({ title, subtitle, actions, eyebrow }: { title: string; subtitle?: string; actions?: ReactNode; eyebrow?: string }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        {eyebrow && <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-sr-primary">{eyebrow}</p>}
        <h1 className="text-2xl font-bold tracking-tight text-sr-foreground sm:text-[1.75rem]">{title}</h1>
        {subtitle && <p className="mt-1 max-w-2xl text-sm text-sr-muted-foreground">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
