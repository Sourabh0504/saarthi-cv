import { useEffect, useState, type ReactNode } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { ProfileContent } from "@/routes/profile";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";

/**
 * Full app-shell replication of the Lovable dashboard: persistent sidebar +
 * top bar wrapping the page content. Scoped entirely under `.sr-theme` (see
 * styles/signal-room.css, imported globally via styles.css so Tailwind's
 * `@theme inline` tokens in it actually compile) so it never touches the
 * rest of the app's look — only rendered by /account and /media.
 */
export function SignalRoomLayout({
  accountId,
  accountName,
  firstChannelId,
  activeModuleId,
  onSelectModule,
  children,
}: {
  accountId: string;
  accountName: string;
  firstChannelId: string;
  activeModuleId: string;
  onSelectModule: (id: string) => void;
  children: ReactNode;
}) {
  const { user } = useAuth();
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [profileOpen, setProfileOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("cv-theme") as "dark" | "light" | null;
    if (stored) setTheme(stored);
  }, []);
  useEffect(() => {
    document.documentElement.classList.toggle("light", theme === "light");
    localStorage.setItem("cv-theme", theme);
  }, [theme]);

  // Close the mobile drawer on Escape and lock background scroll while open.
  useEffect(() => {
    if (!mobileNavOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileNavOpen(false);
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [mobileNavOpen]);

  // Every module switch is a search-param change on the same route, so the
  // drawer never auto-closes on its own — close it whenever the active
  // module changes (covers both in-place switches and the Creative route nav).
  useEffect(() => {
    setMobileNavOpen(false);
  }, [activeModuleId]);

  return (
    <div className="sr-theme flex h-dvh w-full overflow-hidden bg-sr-background text-sr-foreground">
      <div className="hidden lg:block">
        <Sidebar
          accountId={accountId}
          accountName={accountName}
          firstChannelId={firstChannelId}
          activeModuleId={activeModuleId}
          onSelect={onSelectModule}
          onSwitchAccount={() => (window.location.href = "/")}
          theme={theme}
        />
      </div>

      {mobileNavOpen && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <div
            className="animate-sr-fade absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setMobileNavOpen(false)}
            aria-hidden="true"
          />
          <div className="animate-sr-slide-in absolute inset-y-0 left-0 shadow-[var(--sr-shadow-md)]">
            <Sidebar
              accountId={accountId}
              accountName={accountName}
              firstChannelId={firstChannelId}
              activeModuleId={activeModuleId}
              onSelect={onSelectModule}
              onNavigate={() => setMobileNavOpen(false)}
              onSwitchAccount={() => (window.location.href = "/")}
              theme={theme}
            />
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar
          accountId={accountId}
          accountName={accountName}
          theme={theme}
          onToggleTheme={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
          onOpenProfile={() => setProfileOpen(true)}
          onMenu={() => setMobileNavOpen(true)}
        />
        <main id="sr-main-content" className="bg-sr-grid relative flex-1 overflow-y-auto focus:outline-none">
          <div className="bg-sr-gradient-surface pointer-events-none absolute inset-x-0 top-0 h-40" aria-hidden="true" />
          <div className="relative mx-auto max-w-[1500px] p-4 sm:p-6 lg:p-8">{children}</div>
        </main>
      </div>

      <Dialog open={profileOpen} onOpenChange={setProfileOpen}>
        <DialogContent className="max-w-xl bg-transparent border-0 shadow-none p-0">
          <DialogTitle className="sr-only">Profile</DialogTitle>
          <div className="max-h-[85vh] overflow-y-auto pr-1">
            <ProfileContent />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
