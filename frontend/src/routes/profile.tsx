import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  ArrowLeft, Gem, LogOut, Shield, CheckCircle2, Settings,
  Bell, BellOff, Calendar, Palette, User, Mail, Clock,
  Trash2, ChevronRight, Save, Edit2, X,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { getProfilePrefs, saveProfilePrefs, clearProfilePrefs, type ProfilePrefs } from "@/lib/auth";
import { fetchHomeData, summarizeAccess } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export const Route = createFileRoute("/profile")({
  head: () => ({
    meta: [{ title: "Profile — CreativeVisibility" }],
    links: [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&family=Montserrat:wght@500;600;700;800&display=swap",
      },
    ],
  }),
  component: ProfilePage,
});

function ProfilePage() {
  const { isLoggedIn, isLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isLoading && !isLoggedIn) navigate({ to: "/login" });
  }, [isLoggedIn, isLoading, navigate]);

  if (isLoading || !isLoggedIn) return null;

  return (
    <div className="min-h-screen bg-background font-sans" style={{ fontFamily: "'Poppins', sans-serif" }}>
      <div className="aurora-bg" aria-hidden />
      <div className="aurora-grid" aria-hidden />

      <div className="relative z-10 max-w-2xl mx-auto px-4 py-8">
        {/* ── Back nav ── */}
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-8"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Home
        </Link>

        <ProfileContent />
      </div>
    </div>
  );
}

/**
 * The full profile card stack — hero (avatar/name/badges), Preferences,
 * Account, and Session (reset/sign-out). Reused as the full /profile page
 * and inside the profile modal on the Home page, so it's self-contained:
 * pulls its own auth state and access summary, no props required.
 */
export function ProfileContent() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [prefs, setPrefs]   = useState<ProfilePrefs>(getProfilePrefs());
  const [editingName, setEditingName] = useState(false);
  const [nameInput,   setNameInput]   = useState("");
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [accessLabel, setAccessLabel] = useState<string | null>(null);

  // Load theme
  useEffect(() => {
    const stored = localStorage.getItem("cv-theme") as "dark" | "light" | null;
    if (stored) setTheme(stored);
  }, []);

  // Apply theme
  useEffect(() => {
    document.documentElement.classList.toggle("light", theme === "light");
    localStorage.setItem("cv-theme", theme);
  }, [theme]);

  // Real access-level label (role + scope), falls back to a static label if it fails/hasn't loaded.
  useEffect(() => {
    fetchHomeData()
      .then(data => setAccessLabel(summarizeAccess(data.user)))
      .catch(() => {});
  }, []);

  if (!user) return null;

  const displayName = prefs.displayName || user.name || user.email.split("@")[0];
  const initials    = displayName.split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase();

  // Member since derived from JWT iat (issued-at)
  const memberSince = user.iat
    ? new Date(user.iat * 1000).toLocaleDateString("en-IN", { month: "long", year: "numeric" })
    : "N/A";

  const handleSavePrefs = (updated: Partial<ProfilePrefs>) => {
    const next = { ...prefs, ...updated };
    setPrefs(next);
    saveProfilePrefs(next);
    toast.success("Preferences saved");
  };

  const handleSaveName = () => {
    if (nameInput.trim()) {
      handleSavePrefs({ displayName: nameInput.trim() });
    }
    setEditingName(false);
  };

  const handleClearPrefs = () => {
    clearProfilePrefs();
    setPrefs(getProfilePrefs());
    toast.success("Preferences reset to defaults");
  };

  const handleLogout = () => {
    logout();
    navigate({ to: "/login" });
  };

  return (
    <>
      {/* ── Profile hero card ── */}
      <div
        className="rounded-3xl border border-white/10 p-8 mb-5 relative overflow-hidden"
        style={{
          background: "linear-gradient(145deg, oklch(0.16 0.008 260 / 0.95) 0%, oklch(0.14 0.005 260 / 0.98) 100%)",
          boxShadow: "0 24px 48px -8px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.06)",
        }}
      >
        {/* Gold glow behind avatar */}
        <div
          className="pointer-events-none absolute -top-12 left-1/2 -translate-x-1/2 w-64 h-32 rounded-full opacity-20 blur-3xl"
          style={{ background: "radial-gradient(circle, oklch(0.78 0.15 85) 0%, transparent 70%)" }}
          aria-hidden
        />

        <div className="relative flex flex-col items-center text-center gap-4">
          {/* Avatar */}
          <div className="relative">
            <div
              className="w-24 h-24 rounded-full p-0.5"
              style={{ background: "linear-gradient(135deg, oklch(0.78 0.15 85) 0%, oklch(0.65 0.18 70) 100%)" }}
            >
              {user.picture ? (
                <img
                  src={user.picture}
                  alt={displayName}
                  className="w-full h-full rounded-full object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="w-full h-full rounded-full bg-[oklch(0.20_0.008_260)] flex items-center justify-center">
                  <span className="text-2xl font-bold text-gold" style={{ color: "oklch(0.78 0.15 85)" }}>
                    {initials}
                  </span>
                </div>
              )}
            </div>

            {/* Online dot */}
            <span className="absolute bottom-1 right-1 w-4 h-4 rounded-full bg-emerald-400 border-2 border-background shadow" />
          </div>

          {/* Name */}
          <div>
            {editingName ? (
              <div className="flex items-center gap-2 mt-1">
                <input
                  autoFocus
                  value={nameInput}
                  onChange={e => setNameInput(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") handleSaveName(); if (e.key === "Escape") setEditingName(false); }}
                  className="bg-white/5 border border-white/15 rounded-lg px-3 py-1.5 text-sm text-foreground text-center outline-none focus:border-[oklch(0.78_0.15_85)/50%] w-48"
                  placeholder={displayName}
                />
                <button onClick={handleSaveName} className="text-emerald-400 hover:text-emerald-300">
                  <Save className="w-4 h-4" />
                </button>
                <button onClick={() => setEditingName(false)} className="text-white/30 hover:text-white/60">
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2 justify-center">
                <h1
                  className="text-xl font-bold tracking-tight text-foreground"
                  style={{ fontFamily: "'Montserrat', sans-serif" }}
                >
                  {displayName}
                </h1>
                <button
                  onClick={() => { setNameInput(displayName); setEditingName(true); }}
                  className="text-white/20 hover:text-white/60 transition-colors"
                  title="Edit display name"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
            <p className="mt-1 text-sm text-muted-foreground">{user.email}</p>
          </div>

          {/* Badges */}
          <div className="flex items-center gap-2 flex-wrap justify-center">
            <span
              className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border"
              style={{
                background: "oklch(0.78 0.15 85 / 0.12)",
                borderColor: "oklch(0.78 0.15 85 / 0.3)",
                color:       "oklch(0.78 0.15 85)",
              }}
            >
              <Gem className="w-3 h-3" />
              Authorized User
            </span>
            {user.email_verified && (
              <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                <CheckCircle2 className="w-3 h-3" />
                Verified
              </span>
            )}
          </div>

          {/* Meta */}
          <div className="flex items-center gap-6 text-xs text-muted-foreground mt-1">
            <span className="flex items-center gap-1.5">
              <Clock className="w-3 h-3" />
              Member since {memberSince}
            </span>
          </div>
        </div>
      </div>

      {/* ── Preferences ── */}
      <ProfileSection title="Preferences" icon={<Settings className="w-4 h-4" />}>

        {/* Theme toggle */}
        <PrefRow
          icon={<Palette className="w-4 h-4 text-[oklch(0.78_0.15_85)]" />}
          label="Interface Theme"
          description="Choose between dark Onyx or light mode"
        >
          <div className="flex items-center gap-1 rounded-lg bg-white/[0.04] p-1 border border-white/10">
            {(["dark", "light"] as const).map(t => (
              <button
                key={t}
                onClick={() => setTheme(t)}
                className={cn(
                  "px-3 py-1.5 rounded-md text-xs font-medium capitalize transition-all",
                  theme === t
                    ? "bg-[oklch(0.78_0.15_85)] text-[oklch(0.12_0.005_260)] shadow"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t}
              </button>
            ))}
          </div>
        </PrefRow>

        {/* Default date range */}
        <PrefRow
          icon={<Calendar className="w-4 h-4 text-blue-400" />}
          label="Default Date Range"
          description="Applied when you open the portal"
        >
          <select
            value={prefs.defaultDateRange}
            onChange={e => handleSavePrefs({ defaultDateRange: e.target.value as ProfilePrefs["defaultDateRange"] })}
            className="bg-white/[0.04] border border-white/10 rounded-lg px-3 py-1.5 text-sm text-foreground outline-none focus:border-[oklch(0.78_0.15_85)/40%] cursor-pointer"
          >
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
            <option value="60d">Last 60 days</option>
            <option value="90d">Last 90 days</option>
            <option value="all">All dates</option>
          </select>
        </PrefRow>

        {/* Notifications */}
        <PrefRow
          icon={prefs.notifications
            ? <Bell className="w-4 h-4 text-yellow-400" />
            : <BellOff className="w-4 h-4 text-muted-foreground" />
          }
          label="Sync Notifications"
          description="Show toast when cache is refreshed"
        >
          <button
            onClick={() => handleSavePrefs({ notifications: !prefs.notifications })}
            className={cn(
              "relative w-11 h-6 rounded-full border transition-all duration-200",
              prefs.notifications
                ? "bg-[oklch(0.78_0.15_85)] border-[oklch(0.78_0.15_85)/50%]"
                : "bg-white/10 border-white/15",
            )}
            role="switch"
            aria-checked={prefs.notifications}
          >
            <span
              className={cn(
                "absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all duration-200",
                prefs.notifications ? "left-[22px]" : "left-0.5",
              )}
            />
          </button>
        </PrefRow>
      </ProfileSection>

      {/* ── Account Info ── */}
      <ProfileSection title="Account" icon={<User className="w-4 h-4" />}>
        <InfoRow icon={<Mail className="w-4 h-4 text-muted-foreground" />} label="Google Account" value={user.email} />
        <InfoRow icon={<Shield className="w-4 h-4 text-[oklch(0.78_0.15_85)]" />} label="Access Level" value={accessLabel ?? "Whitelisted User"} highlight />
        <InfoRow
          icon={<CheckCircle2 className="w-4 h-4 text-emerald-400" />}
          label="Email Verification"
          value={user.email_verified ? "Verified by Google" : "Unverified"}
        />
      </ProfileSection>

      {/* ── Danger Zone ── */}
      <ProfileSection title="Session" icon={<LogOut className="w-4 h-4" />}>
        {/* Clear prefs */}
        <button
          onClick={handleClearPrefs}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm text-muted-foreground hover:text-foreground hover:bg-white/[0.04] transition-all group"
        >
          <Trash2 className="w-4 h-4 text-muted-foreground group-hover:text-red-400 transition-colors" />
          <div className="flex-1 text-left">
            <div className="font-medium">Reset Preferences</div>
            <div className="text-xs text-muted-foreground">Clear all local settings and saved views</div>
          </div>
          <ChevronRight className="w-4 h-4 opacity-30 group-hover:opacity-60" />
        </button>

        {/* Sign out */}
        {showLogoutConfirm ? (
          <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4">
            <p className="text-sm text-red-300 mb-3">Sign out of CreativeVisibility?</p>
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={handleLogout}
                className="bg-red-500 hover:bg-red-600 text-white border-0 text-xs"
              >
                Yes, sign out
              </Button>
              <Button
                size="sm" variant="ghost"
                onClick={() => setShowLogoutConfirm(false)}
                className="text-xs"
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowLogoutConfirm(true)}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm hover:bg-red-500/10 text-red-400 hover:text-red-300 transition-all group"
          >
            <LogOut className="w-4 h-4" />
            <div className="flex-1 text-left">
              <div className="font-medium">Sign Out</div>
              <div className="text-xs opacity-60">You will be redirected to the login page</div>
            </div>
            <ChevronRight className="w-4 h-4 opacity-30 group-hover:opacity-60" />
          </button>
        )}
      </ProfileSection>
    </>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function ProfileSection({
  title, icon, children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div
      className="rounded-2xl border border-white/8 mb-4 overflow-hidden"
      style={{
        background: "linear-gradient(145deg, oklch(0.16 0.008 260 / 0.8) 0%, oklch(0.14 0.005 260 / 0.9) 100%)",
        boxShadow: "0 4px 24px -8px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.04)",
      }}
    >
      {/* Section header */}
      <div className="flex items-center gap-2 px-5 py-3.5 border-b border-white/[0.06]">
        <span className="text-muted-foreground">{icon}</span>
        <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          {title}
        </h2>
      </div>
      <div className="p-2">
        {children}
      </div>
    </div>
  );
}

function PrefRow({
  icon, label, description, children,
}: {
  icon: React.ReactNode;
  label: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 px-3 py-3 rounded-xl">
      <div className="shrink-0">{icon}</div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-foreground">{label}</div>
        <div className="text-xs text-muted-foreground mt-0.5">{description}</div>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function InfoRow({
  icon, label, value, highlight,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="flex items-center gap-3 px-3 py-3 rounded-xl">
      <div className="shrink-0">{icon}</div>
      <div className="flex-1 min-w-0">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div
          className={cn("text-sm font-medium mt-0.5 truncate", highlight && "text-[oklch(0.78_0.15_85)]")}
        >
          {value}
        </div>
      </div>
    </div>
  );
}
