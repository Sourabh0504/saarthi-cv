/**
 * frontend/src/lib/channelIcons.tsx
 * ===================================
 * Maps a channel's `platform` field (e.g. "google_ads", "meta_ads" — set in
 * backend/org_data/org_structure.json) to a brand icon. Falls back to a
 * generic megaphone icon for platforms not yet mapped — add a new case here
 * when the next platform (LinkedIn, TikTok, etc.) is needed.
 */

import { Megaphone } from "lucide-react";

export function ChannelIcon({ platform, className }: { platform: string; className?: string }) {
  if (platform === "google_ads") return <GoogleAdsIcon className={className} />;
  if (platform === "meta_ads") return <MetaIcon className={className} />;
  return <Megaphone className={className} />;
}

/** Google's official 4-color "G" mark. */
function GoogleAdsIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
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

/** Simplified Meta "infinity" mark in Meta blue. */
function MetaIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 36 24" className={className} aria-hidden>
      <path
        d="M6.6 2.4C3.4 2.4.9 6.1.9 12s2.5 9.6 5.7 9.6c2 0 3.5-1.2 6-4.6 0 0 1.1-1.5 1.9-2.6l1.6-2.2c1.9-2.7 3.9-5.1 6.2-5.1 1.8 0 3.2 1.7 3.2 5.2 0 4.3-2 7.1-4.6 7.1-.9 0-1.8-.2-2.7-.7l-.9 2.7c1.3.7 2.7 1 4 1 5 0 8.2-3.9 8.2-10.2 0-6-3.1-9.8-7.2-9.8-2.9 0-5.1 1.9-7.7 5.5l-1.9 2.7c-.4-.9-.9-1.8-1.5-2.7C10.4 4.2 8.6 2.4 6.6 2.4zm-.2 3c1.2 0 2.3 1.1 3.9 3.5.6.9 1.1 1.8 1.6 2.6l-.6.9c-2.6 3.9-3.7 4.7-4.9 4.7-1.5 0-2.6-2.4-2.6-6.3 0-3.5 1-5.4 2.6-5.4z"
        fill="#0081FB"
      />
    </svg>
  );
}
