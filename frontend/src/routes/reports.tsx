import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { Gem, ArrowLeft, AlertCircle, RefreshCw, Printer, Download, Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { fetchAccountReport, type DeckResponse } from "@/lib/api";
import { DeckPreview } from "@/components/DeckPreview";

export const Route = createFileRoute("/reports")({
  validateSearch: (search: Record<string, unknown>) => ({
    account_id: typeof search.account_id === "string" ? search.account_id : "",
  }),
  head: () => ({
    meta: [{ title: "CreativeVisibility — Business Review" }],
  }),
  component: Reports,
});

function Reports() {
  const { isLoggedIn, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { account_id: accountId } = Route.useSearch();

  const [deck, setDeck]     = useState<DeckResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !isLoggedIn) navigate({ to: "/login" });
  }, [isLoggedIn, authLoading, navigate]);

  const load = useCallback(async () => {
    if (!accountId) {
      setError("No account selected. Go back and pick an account.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setDeck(await fetchAccountReport(accountId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to build report.");
    } finally {
      setLoading(false);
    }
  }, [accountId]);

  useEffect(() => { if (isLoggedIn) load(); }, [isLoggedIn, load]);

  const downloadJson = () => {
    if (!deck) return;
    const blob = new Blob([JSON.stringify(deck, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${deck.meta.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (authLoading || !isLoggedIn) return null;

  return (
    <div className="relative min-h-screen overflow-hidden bg-background text-foreground font-sans">
      <div className="aurora-bg" aria-hidden />
      <div className="aurora-grid" aria-hidden />

      {/* ── Header (hidden when printing) ── */}
      <header className="relative z-10 flex items-center gap-3 px-6 py-5 border-b border-border/60 backdrop-blur-xl bg-background/70 sticky top-0 no-print">
        <Link
          to="/account"
          search={{ account_id: accountId }}
          className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
          title="Back to account"
        >
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div className="w-9 h-9 rounded-lg bg-gold-gradient flex items-center justify-center">
          <Gem className="w-5 h-5 text-primary-foreground" />
        </div>
        <div>
          <div className="font-display font-bold tracking-tight">{deck?.meta.title ?? "Business Review"}</div>
          {deck?.meta.subtitle && (
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{deck.meta.subtitle}</div>
          )}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={downloadJson}
            disabled={!deck}
            className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm text-foreground/80 hover:bg-accent/50 transition-colors disabled:opacity-40"
          >
            <Download className="w-4 h-4" /> JSON
          </button>
          <button
            onClick={() => window.print()}
            disabled={!deck}
            className="flex items-center gap-1.5 rounded-lg bg-gold-gradient px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-40"
          >
            <Printer className="w-4 h-4" /> Print / PDF
          </button>
        </div>
      </header>

      {/* ── Body ── */}
      <main className="relative z-10 mx-auto max-w-3xl px-6 pb-16 pt-8">
        {loading && (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin text-gold" /> Building report…
          </div>
        )}

        {!loading && error && (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-destructive/20 bg-destructive/10 px-6 py-10 text-center">
            <AlertCircle className="w-6 h-6 text-destructive" />
            <p className="text-sm text-destructive max-w-sm">{error}</p>
            <button
              onClick={load}
              className="flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground/80 hover:bg-accent/50 transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Try again
            </button>
          </div>
        )}

        {!loading && !error && deck && <DeckPreview deck={deck} />}
      </main>
    </div>
  );
}
