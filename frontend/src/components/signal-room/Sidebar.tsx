import { Link } from "@tanstack/react-router";
import {
  ArrowLeftRight, BarChart3, Bell, BookOpen, ClipboardList, FileText,
  History, Image, Images, LayoutDashboard, LayoutGrid, LineChart, Settings, Sparkles, type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { SaarthiMark } from "@/components/brand/SaarthiMark";

export interface SidebarModule {
  id: string;
  label: string;
  icon: LucideIcon;
  enabled: boolean;
  /** If set, this item is a REAL full navigation (new screen) instead of an in-place switch. */
  route?: string;
}

const MODULES: SidebarModule[] = [
  { id: "overview", label: "Overview", icon: LayoutGrid, enabled: true },
  { id: "media", label: "Media", icon: BarChart3, enabled: true },
  { id: "cv-google", label: "Creative Visibility — Google", icon: Image, enabled: true },
  { id: "cv-meta", label: "Creative Visibility — Meta", icon: Images, enabled: true },
  { id: "changelog", label: "Change Log", icon: History, enabled: true },
  // Creative is the one deliberate exception: a full-screen redirect to its
  // own route, not an in-place panel — see components/signal-room/CreativeModule.tsx.
  { id: "creative", label: "Creative", icon: Image, enabled: true, route: "/creative" },
  { id: "analytics", label: "Analytics", icon: LineChart, enabled: true },
  { id: "pinned", label: "Pinned Charts", icon: LayoutDashboard, enabled: true },
  { id: "recommendations", label: "Recommendations", icon: Sparkles, enabled: false },
  { id: "reporting", label: "Reports", icon: FileText, enabled: true },
  { id: "alerts", label: "Alerts", icon: Bell, enabled: false },
  { id: "ops", label: "Operations", icon: ClipboardList, enabled: false },
  { id: "brief", label: "Client Brief", icon: BookOpen, enabled: false },
  { id: "admin", label: "Admin", icon: Settings, enabled: false },
];

/**
 * Module switcher. Every item swaps the content area in-place (no route
 * change, sidebar/top bar never unmount) EXCEPT Creative, which is a real
 * full-screen navigation by explicit request — see the `route` field above.
 */
export function Sidebar({
  accountId,
  accountName,
  firstChannelId,
  activeModuleId,
  onSelect,
  onNavigate,
  onSwitchAccount,
  theme = "dark",
}: {
  accountId: string;
  accountName: string;
  firstChannelId: string;
  activeModuleId: string;
  onSelect: (id: string) => void;
  onNavigate?: () => void;
  onSwitchAccount: () => void;
  theme?: "dark" | "light";
}) {
  return (
    <aside className="flex h-full w-64 flex-col border-r border-sr-sidebar-border bg-sr-sidebar" aria-label="Primary">
      <div className="flex h-16 items-center gap-2.5 border-b border-sr-sidebar-border px-5">
        <div className="animate-sr-breathe flex h-9 w-9 items-center justify-center rounded-xl bg-sr-card/60">
          <SaarthiMark theme={theme} size={22} />
        </div>
        <div className="leading-tight">
          <span className="block text-lg font-bold tracking-tight text-sr-sidebar-foreground">Saarthi</span>
          <span className="block text-[10px] font-medium uppercase tracking-[0.18em] text-sr-muted-foreground">Intelligence</span>
        </div>
      </div>

      {accountName ? (
        <div className="mx-3 mt-3 rounded-xl border border-sr-sidebar-border bg-sr-background/40 p-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-sr-muted-foreground">Active account</p>
          <p className="mt-0.5 truncate text-sm font-semibold text-sr-sidebar-foreground">{accountName}</p>
          <button
            onClick={onSwitchAccount}
            className="mt-1.5 inline-flex items-center gap-1 rounded text-xs font-medium text-sr-primary transition-colors hover:text-sr-primary/80"
          >
            <ArrowLeftRight className="h-3 w-3" aria-hidden="true" /> Switch account
          </button>
        </div>
      ) : (
        <div className="mx-3 mt-3 rounded-xl border border-dashed border-sr-sidebar-border p-3">
          <p className="text-xs text-sr-muted-foreground">Select an account to scope every module.</p>
        </div>
      )}

      <nav className="flex flex-1 flex-col overflow-y-auto" aria-label="Workspace modules">
        <p className="px-5 pb-1 pt-5 text-[10px] font-semibold uppercase tracking-[0.16em] text-sr-muted-foreground">Workspace</p>
        <ul className="flex-1 space-y-0.5 px-3 pb-3">
          {MODULES.map((m) => {
            const isActive = m.id === activeModuleId;
            const content = (
              <>
                <span
                  aria-hidden="true"
                  className={cn(
                    "absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-sr-primary transition-all duration-200",
                    isActive ? "opacity-100" : "opacity-0 group-hover:opacity-40",
                  )}
                />
                <m.icon className={cn("h-[18px] w-[18px] shrink-0 transition-transform duration-200", isActive ? "text-sr-primary scale-110" : "group-hover:scale-105")} />
                {m.label}
                {!m.enabled && <span className="ml-auto text-[9px] uppercase tracking-wide text-sr-muted-foreground">Soon</span>}
              </>
            );
            const itemCls = cn(
              "group relative flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium transition-all duration-200 active:scale-[0.98]",
              isActive ? "bg-sr-sidebar-accent text-sr-sidebar-accent-foreground" : "text-sr-muted-foreground hover:bg-sr-sidebar-accent/50 hover:text-sr-sidebar-foreground",
            );
            return (
              <li key={m.id}>
                {!m.enabled ? (
                  <span className="group relative flex cursor-not-allowed items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-sr-muted-foreground/50">
                    {content}
                  </span>
                ) : m.route ? (
                  <Link
                    // Real navigation on purpose — this is the one sidebar item
                    // meant to open as its own complete screen.
                    to={m.route as never}
                    search={{ account_id: accountId, channel_id: firstChannelId } as never}
                    onClick={onNavigate}
                    aria-current={isActive ? "page" : undefined}
                    className={itemCls}
                  >
                    {content}
                  </Link>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      onSelect(m.id);
                      onNavigate?.();
                    }}
                    aria-current={isActive ? "page" : undefined}
                    className={itemCls}
                  >
                    {content}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="border-t border-sr-sidebar-border p-4">
        <div className="flex items-center gap-2 text-[11px] text-sr-muted-foreground">
          <span className="relative flex h-1.5 w-1.5" aria-hidden="true">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sr-success opacity-60" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-sr-success" />
          </span>
          Live data · Saarthi backend
        </div>
      </div>
    </aside>
  );
}
