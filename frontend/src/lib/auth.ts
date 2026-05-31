/**
 * frontend/src/lib/auth.ts
 * ========================
 * Auth utilities — token storage, user model, API calls.
 *
 * Storage layout (localStorage):
 *   cv-auth-token  → signed JWT from our backend
 *   cv-auth-user   → JSON user profile (email, name, picture, exp)
 */

const BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? "http://localhost:8000";

const TOKEN_KEY = "cv-auth-token";
const USER_KEY  = "cv-auth-user";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AuthUser {
  sub:            string;
  email:          string;
  name:           string;
  picture:        string;
  email_verified: boolean;
  exp?:           number;   // JWT expiry (unix seconds)
  iat?:           number;   // JWT issued-at
}

// ── Token storage ─────────────────────────────────────────────────────────────

export function saveSession(token: string, user: AuthUser): void {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearSession(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function getStoredUser(): AuthUser | null {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

/** Returns true if a stored JWT exists and has not expired. */
export function isSessionValid(): boolean {
  const token = getStoredToken();
  const user  = getStoredUser();
  if (!token || !user) return false;

  // Check JWT expiry from stored user (exp is unix seconds)
  if (user.exp) {
    const nowSec = Math.floor(Date.now() / 1000);
    if (nowSec >= user.exp) {
      clearSession();
      return false;
    }
  }
  return true;
}

// ── API calls ─────────────────────────────────────────────────────────────────

export interface LoginResponse {
  token: string;
  user:  AuthUser;
}

/**
 * Exchange a Google access token for our session JWT.
 * Calls POST /auth/google on the backend.
 */
export async function loginWithGoogle(accessToken: string): Promise<LoginResponse> {
  const res = await fetch(`${BASE}/auth/google`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ access_token: accessToken }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const msg  = body?.detail ?? `Login failed (${res.status})`;
    throw new Error(msg);
  }

  return res.json() as Promise<LoginResponse>;
}

// ── Profile preferences (stored locally, not on server) ───────────────────────

const PREFS_KEY = "cv-profile-prefs";

export interface ProfilePrefs {
  displayName?:     string;   // override shown name
  defaultDateRange: "7d" | "30d" | "60d" | "90d" | "all";
  notifications:    boolean;
}

const DEFAULT_PREFS: ProfilePrefs = {
  defaultDateRange: "30d",
  notifications:    true,
};

export function getProfilePrefs(): ProfilePrefs {
  const raw = localStorage.getItem(PREFS_KEY);
  if (!raw) return { ...DEFAULT_PREFS };
  try {
    return { ...DEFAULT_PREFS, ...(JSON.parse(raw) as Partial<ProfilePrefs>) };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export function saveProfilePrefs(prefs: ProfilePrefs): void {
  localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
}

export function clearProfilePrefs(): void {
  localStorage.removeItem(PREFS_KEY);
}
