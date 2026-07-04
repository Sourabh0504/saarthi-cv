import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useGoogleLogin } from "@react-oauth/google";
import { Gem, Lock, AlertCircle, Loader2, Chrome } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";

const GOOGLE_CLIENT_ID = (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined) ?? "";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Sign In — CreativeVisibility" },
      { name: "description", content: "Authorized access only." },
    ],
    links: [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&family=Montserrat:wght@500;600;700;800&display=swap",
      },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  if (!GOOGLE_CLIENT_ID) return <LoginConfigurationMissing />;

  return <GoogleLoginCard />;
}

function LoginConfigurationMissing() {
  return (
    <div className="relative min-h-screen flex items-center justify-center overflow-hidden bg-[oklch(0.12_0.005_260)] px-4 font-sans">
      <div className="aurora-bg" aria-hidden />
      <div className="aurora-grid" aria-hidden />
      <div className="relative z-10 max-w-md rounded-3xl border border-white/10 p-8 text-center shadow-2xl backdrop-blur-2xl">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-white/5">
          <Lock className="h-6 w-6 text-[oklch(0.78_0.15_85)]" />
        </div>
        <h1 className="text-xl font-bold text-white">Google login is not configured</h1>
        <p className="mt-3 text-sm leading-relaxed text-white/50">
          Add the Google Client ID to enable restricted Google sign-in for approved users.
        </p>
        <Link to="/" className="mt-6 inline-flex text-sm font-semibold text-[oklch(0.78_0.15_85)] hover:opacity-80">
          Back to home
        </Link>
      </div>
    </div>
  );
}

function GoogleLoginCard() {
  const { login, loginError, clearError, isLoggedIn, isLoading } = useAuth();
  const navigate = useNavigate();
  const [signing, setSigning] = useState(false);

  useEffect(() => {
    if (!isLoading && isLoggedIn) {
      navigate({ to: "/" });
    }
  }, [isLoggedIn, isLoading, navigate]);

  const googleLogin = useGoogleLogin({
    onSuccess: async (tokenResponse) => {
      setSigning(true);
      try {
        await login(tokenResponse.access_token);
        navigate({ to: "/" });
      } catch {
        // loginError is set in context
      } finally {
        setSigning(false);
      }
    },
    onError: () => {
      setSigning(false);
    },
  });

  const handleSignIn = () => {
    clearError();
    setSigning(true);
    googleLogin();
  };

  if (isLoading) return null;

  return (
    <div className="relative min-h-screen flex items-center justify-center overflow-hidden bg-[oklch(0.12_0.005_260)] font-sans">

      {/* ── Aurora background ── */}
      <div className="aurora-bg" aria-hidden />
      <div className="aurora-grid" aria-hidden />

      {/* ── Floating orbs ── */}
      <div
        className="pointer-events-none absolute -top-40 -left-40 w-[600px] h-[600px] rounded-full opacity-20 blur-3xl"
        style={{ background: "radial-gradient(circle, oklch(0.78 0.15 85) 0%, transparent 70%)" }}
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -bottom-40 -right-40 w-[500px] h-[500px] rounded-full opacity-10 blur-3xl"
        style={{ background: "radial-gradient(circle, oklch(0.6 0.18 280) 0%, transparent 70%)" }}
        aria-hidden
      />

      {/* ── Login card ── */}
      <div className="relative z-10 w-full max-w-md mx-4">

        {/* Card */}
        <div
          className="rounded-3xl border border-white/10 p-8 shadow-2xl backdrop-blur-2xl"
          style={{
            background: "linear-gradient(145deg, oklch(0.16 0.008 260 / 0.95) 0%, oklch(0.14 0.005 260 / 0.98) 100%)",
            boxShadow: "0 32px 64px -12px rgba(0,0,0,0.8), 0 0 0 1px rgba(255,255,255,0.06), inset 0 1px 0 rgba(255,255,255,0.08)",
          }}
        >
          {/* Logo */}
          <div className="flex flex-col items-center gap-4 mb-8">
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center shadow-lg"
              style={{ background: "linear-gradient(135deg, oklch(0.78 0.15 85) 0%, oklch(0.65 0.18 70) 100%)" }}
            >
              <Gem className="w-8 h-8 text-[oklch(0.12_0.005_260)]" />
            </div>
            <div className="text-center">
              <h1
                className="text-2xl font-bold tracking-tight text-white"
                style={{ fontFamily: "'Montserrat', sans-serif" }}
              >
                CreativeVisibility
              </h1>
              <p className="mt-1 text-xs uppercase tracking-[0.2em] text-[oklch(0.78_0.15_85)]">
                Aukera Jewellery · Performance Portal
              </p>
            </div>
          </div>

          {/* Divider */}
          <div className="flex items-center gap-3 mb-6">
            <div className="flex-1 h-px bg-white/10" />
            <div className="flex items-center gap-1.5 text-xs text-white/30">
              <Lock className="w-3 h-3" />
              <span>Authorized access only</span>
            </div>
            <div className="flex-1 h-px bg-white/10" />
          </div>

          {/* Sign-in copy */}
          <p className="text-center text-sm text-white/50 mb-6 leading-relaxed">
            This portal is restricted to the media buying team and brand stakeholders.
            Sign in with your authorized Google account to continue.
          </p>

          {/* Error */}
          {loginError && (
            <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <p className="text-sm text-red-300">{loginError}</p>
            </div>
          )}

          {/* Google Sign-In Button */}
          <button
            onClick={handleSignIn}
            disabled={signing}
            className={cn(
              "w-full flex items-center justify-center gap-3 rounded-xl px-6 py-3.5",
              "text-sm font-semibold transition-all duration-200",
              "border border-white/15 backdrop-blur",
              signing
                ? "opacity-60 cursor-not-allowed"
                : "hover:border-[oklch(0.78_0.15_85)/40%] hover:shadow-[0_0_24px_-4px_oklch(0.78_0.15_85/30%)] active:scale-[0.98]",
            )}
            style={{
              background: signing
                ? "oklch(0.20 0.006 260)"
                : "linear-gradient(135deg, oklch(0.22 0.008 260) 0%, oklch(0.18 0.006 260) 100%)",
              color: "white",
            }}
          >
            {signing ? (
              <Loader2 className="w-4 h-4 animate-spin text-[oklch(0.78_0.15_85)]" />
            ) : (
              <GoogleIcon />
            )}
            <span>{signing ? "Signing in…" : "Continue with Google"}</span>
          </button>

          {/* Footer */}
          <p className="mt-5 text-center text-[11px] text-white/20 leading-relaxed">
            Not authorised?{" "}
            <span className="text-[oklch(0.78_0.15_85)/60%]">
              Contact Sourabh Chaudhari to request access.
            </span>
          </p>
        </div>

        {/* Version tag */}
        <p className="mt-4 text-center text-[10px] text-white/20 tracking-widest uppercase">
          CreativeVisibility v1.0 · Restricted
        </p>
      </div>
    </div>
  );
}

/** Google logo SVG — used in the sign-in button */
function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  );
}
