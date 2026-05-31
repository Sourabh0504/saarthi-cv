/**
 * frontend/src/contexts/AuthContext.tsx
 * ======================================
 * Global auth state — provides user, login, logout to the entire app.
 * Initialises from localStorage on mount so page refreshes stay logged in.
 */

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import {
  type AuthUser,
  saveSession,
  clearSession,
  getStoredToken,
  getStoredUser,
  isSessionValid,
  loginWithGoogle as apiLoginWithGoogle,
} from "@/lib/auth";

const GOOGLE_CLIENT_ID = (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined) ?? "";
const USE_DEV_PREVIEW_SESSION = import.meta.env.DEV && !GOOGLE_CLIENT_ID;

const DEV_PREVIEW_USER: AuthUser = {
  sub: "dev-preview",
  email: "sourabhchaudhari8830@gmail.com",
  name: "Sourabh Chaudhari",
  picture: "",
  email_verified: true,
};

// ── Context shape ─────────────────────────────────────────────────────────────

interface AuthContextValue {
  user:         AuthUser | null;
  token:        string | null;
  isLoading:    boolean;
  isLoggedIn:   boolean;
  loginError:   string | null;
  login:        (googleAccessToken: string) => Promise<void>;
  logout:       () => void;
  clearError:   () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// ── Provider ──────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user,      setUser]      = useState<AuthUser | null>(null);
  const [token,     setToken]     = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);   // true while reading localStorage
  const [loginError, setLoginError] = useState<string | null>(null);

  // ── Init from localStorage on mount ────────────────────────────────────────
  useEffect(() => {
    if (USE_DEV_PREVIEW_SESSION) {
      setToken("dev-preview-token");
      setUser(DEV_PREVIEW_USER);
      setIsLoading(false);
      return;
    }

    if (isSessionValid()) {
      setToken(getStoredToken());
      setUser(getStoredUser());
    }
    setIsLoading(false);
  }, []);

  // ── Login ───────────────────────────────────────────────────────────────────
  const login = useCallback(async (googleAccessToken: string) => {
    setLoginError(null);
    try {
      const { token: jwt, user: profile } = await apiLoginWithGoogle(googleAccessToken);
      saveSession(jwt, profile);
      setToken(jwt);
      setUser(profile);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Login failed. Please try again.";
      setLoginError(msg);
      throw err; // re-throw so login page can react
    }
  }, []);

  // ── Logout ──────────────────────────────────────────────────────────────────
  const logout = useCallback(() => {
    clearSession();
    setToken(null);
    setUser(null);
  }, []);

  const clearError = useCallback(() => setLoginError(null), []);

  return (
    <AuthContext.Provider value={{
      user,
      token,
      isLoading,
      isLoggedIn: !!user,
      loginError,
      login,
      logout,
      clearError,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
