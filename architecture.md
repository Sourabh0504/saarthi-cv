# CreativeVisibility / Saarthi - System Architecture & Tech Stack

> **Note:** This document serves as the live architectural reference for the project. If any change is made to the architecture or tech stack, it MUST be updated instantly here.

## 1. High-Level Architecture

This started as a single-account, single-channel (Google Ads) reporting portal called **CreativeVisibility**. It is now being expanded into **Saarthi** — a multi-tenant portal serving many agency accounts, each with multiple ad-platform channels (Google Ads, Meta Ads, and more later).

- **Frontend Layer:** A Single Page Application (SPA) — a **Home page** listing every account/channel the signed-in user has access to, an **Account Overview page** (`/account`) sitting between Home and the dashboards showing combined KPIs/targets/change log for one account, and a **per-platform dashboard route** (`/dashboard` for Google Ads, `/dashboard-meta` for Meta Ads) for visualization, tabular data interaction, and PDF export.
- **Backend Layer:** A RESTful FastAPI API. Every channel-level data route is **channel-aware**: it takes a `channel_id`, checks the signed-in user's access grants for that specific channel, resolves that channel's own Apps Script URL, and serves/caches that channel's data independently of every other channel. Account-level routes (`/api/account-summary`, `/api/account-targets`, `/api/changes`) are **account-aware** instead — they check access to the account as a whole and aggregate/scope across all of that account's channels.
- **Access Layer:** A small JSON-based org model (`backend/org_data/`) defines Clusters → Teams → Accounts → Channels, and a separate grants file maps each user's email to the roles/scopes they hold. One person can hold several grants across unrelated branches (e.g. account_head for accounts under different teams).
- **Data Source Layer:** Each channel has its own Google Sheet + Apps Script Web App deployment (its URL lives in `org_data/org_secrets.json`, not in `.env` — `.env`'s old single global `APPS_SCRIPT_URL` is gone). Google Ads channels read a `Daily_dump` tab; Meta Ads channels read their own `Daily_dump` tab (populated via Supermetrics) with a different metric/field set. Two more account/agency-wide sheets (Targets, Change History) live outside the per-channel model entirely — their Apps Script URLs are in `org_data/shared_secrets.json` (see §2.3).

### 1.1 Account Overview (`/account`)

Sits between Home and the per-channel dashboards — answers "how is this account doing," not "how is this one channel doing." Aggregates across every channel an account has (`backend/account_aggregator.py`: sum raw totals first, then compute blended rates — never average per-channel rates), shows a monthly target-vs-achieved hero card (`backend/targets.py`, optional — degrades to an empty state if no Targets sheet is configured), a Creative Visibility widget (client-side merge of each channel's existing performance data, no new backend surface), and a Change Log (`backend/change_history.py`) — an append-only audit ledger for documented optimizations, currently **account-scoped, not campaign-scoped**, since there's no Campaign Master data source yet (see `PROJECT_SPEC.md` §13 and `Changelogfeature.md` for the full design and the upgrade path).

## 2. Technology Stack

### 2.1 Frontend
- **Core Framework:** React 19 + TypeScript
- **Build Tool:** Vite (via TanStack Start)
- **Routing:** TanStack Router (`@tanstack/react-router`) — file-based. **Caution:** a dot in a route filename (`dashboard.meta.tsx`) creates a *nested child route* under the file before the dot, not a sibling — this actually broke the first attempt at the Meta dashboard route (it rendered inside `dashboard.tsx`'s shell, which has no `<Outlet/>`, so nothing appeared). Use a hyphen (`dashboard-meta.tsx`) for a new top-level route that happens to share a name prefix.
- **State Management & Data Fetching:** TanStack Query (`@tanstack/react-query`) — present but most data fetching is hand-rolled (fetch + local state), not driven through Query hooks yet.
- **Styling:** TailwindCSS v4, theme tokens defined in `frontend/src/styles.css` as CSS custom properties (`--background`, `--card`, `--gold`, etc.), registered into Tailwind via `@theme inline`. Prefer `bg-background`/`text-foreground`/`bg-gold-gradient`/etc. over hardcoded `oklch(...)` colors — hardcoding breaks the palette switcher (gold/indigo/mint/rose) and the light/dark toggle, both stored in `localStorage` (`cv-theme`, `cv-palette`) and applied as classes on `<html>`.
- **UI Components:** Radix UI primitives (`@radix-ui/react-*`, wrapped as shadcn/ui components), Lucide React (icons)
- **Data Visualization:** Recharts
- **PDF Export Engine:** jsPDF, html2canvas, svg2pdf.js
- **Form Handling:** react-hook-form + Zod + @hookform/resolvers

### 2.2 Backend
- **Core Framework:** Python (FastAPI)
- **Server:** Uvicorn
- **Database:** SQLite (via standard library `sqlite3` in `db.py`) — persistent cache tier, keys are now prefixed `"{channel_id}:..."` so many channels share one table without colliding
- **HTTP Client:** HTTPX (async, one shared client, per-channel `asyncio.Lock` to prevent thundering-herd on cache miss)
- **Caching:** Two-tier — in-memory `cachetools.TTLCache` (fast) + SQLite (durable across restarts). **Lazy, not eager**: nothing is pre-warmed on startup or on a timer; a channel's data is fetched only when first requested, then cached. This was a deliberate change from the original single-channel design (which did eager pre-warm-on-startup + periodic re-warm) — that doesn't scale once there are hundreds of channels.
- **Authentication:** Google OAuth2 → signed JWT (`pyjwt`, HS256, 7-day TTL), email whitelist (`ALLOWED_EMAILS`). **Every data route now requires a valid JWT** — this was not true originally (routes were open, safe only because there was one hardcoded dataset); it became necessary once `channel_id` became a client-supplied parameter that could address any account.
- **Access control:** `backend/org_access.py` resolves whether a user's grants (`org_data/access_grants.json`) cover a requested `channel_id` or `account_id`; shared FastAPI dependencies (`require_channel_access`, `require_account_access` in `main.py`) enforce this + auth on every data route, 403ing otherwise.
- **Metric calculation:** platform-specific — `calculator.py` (Google: ctr/cpc/cpm/cr/cpa) and `calculator_meta.py` (Meta: ctr/cpc/cpm/**cvr**/**cpl**, plus optional extras like `hook_rate`/`thruplays`). Dispatched by each channel's `platform` field. `account_aggregator.py` sits one level above these — sums each channel's raw totals, then computes blended rates from the sums (never averages per-channel rates).

### 2.3 Data & Integrations
- **Google Apps Script Connectors:** One per channel, each a custom Web App reading that channel's own Google Sheet. Source lives in `backend/apps_script/` for the two Google Ads pipelines (`doGet.js`, `campaignPerformanceDoGet.js`); the Meta Ads pipeline's script currently lives only in the separate `D:\CreativeVisibility-Meta` project (not yet copied into this repo — only its deployed Web App URL is referenced, from `org_data/org_secrets.json`). Two more scripts (`targetsDoGet.js`, `changeHistoryDoGet.js`) are written and ready but **not yet deployed** — see §1.1.
- **Org data model:** `backend/org_data/org_structure.json` (clusters/teams/accounts/channels, committed, no secrets), `org_data/org_secrets.json` (per-channel `sheet_url`/`apps_script_url`, **gitignored** like `.env` — `org_secrets.example.json` shows the shape), `org_data/access_grants.json` (email → list of `{role, scope_type, scope_id}` grants, committed), `org_data/shared_secrets.json` (**gitignored**, `.example.json` shows the shape) — agency-wide service URLs (Targets, Change History) that don't fit the per-`channel_id` shape, read via `org_access.get_shared_secret(key)`.
- **Database Architecture:** Local SQLite storing a flat cache-entry table (`key, payload, row_count, checksum, fetched_at, expires_at`) — not per-metric fact tables; the actual creative/campaign data is never persisted server-side beyond this TTL cache, it's re-derived from the Apps Script response each time the cache expires. Change History is the one exception — it's genuinely persistent, immutable, append-only data living in its own Google Sheet, not a cache of anything.

## 3. Directory Structure Map
- `/frontend/` — React/TanStack Start SPA.
  - `routes/index.tsx` — **Home** (accounts/channels list + profile modal), not the dashboard.
  - `routes/account.tsx` — **Account Overview** (`/account`) — combined KPIs, target-vs-achieved, Creative Visibility, Change Log. Sits between Home and the dashboards.
  - `routes/dashboard.tsx` — Google Ads dashboard (`/dashboard`).
  - `routes/dashboard-meta.tsx` — Meta Ads dashboard (`/dashboard-meta`).
  - `routes/profile.tsx` — exports `ProfileContent`, reused both as the standalone `/profile` page and inside Home's/Account Overview's profile modal.
  - `components/CreativeVisibilityWidget.tsx`, `ChangeLogWidget.tsx`, `ChangeDocumentationForm.tsx` — Account Overview's sidebar widgets and the change-logging form.
  - `lib/channelIcons.tsx` — brand icon per channel `platform` (not name-guessing).
  - `lib/changeTaxonomy.ts` — the standardized Change Category → Change Type taxonomy (from `Changelogfeature.md` §6), shared by the form and any future reporting/viewer UI.
  - Files suffixed `Meta`/`.meta` (e.g. `TopPerformersMeta.tsx`, `hierarchy.meta.ts`) are Meta-specific forks of the Google originals, made where the platforms' data genuinely differ.
- `/backend/` — FastAPI app, org access/data model, Apps Script connector, calculators.
  - `org_access.py` — hierarchy/grants resolution (who can see what).
  - `org_data/` — the JSON files described above.
  - `apps_script_connector.py` — channel-aware fetch + cache.
  - `account_aggregator.py` — cross-channel aggregation for Account Overview.
  - `targets.py` / `change_history.py` — connectors for the two agency-wide sheets (both currently awaiting deployment — see §1.1).
  - `calculator.py` / `calculator_meta.py` — platform-specific metric formulas.
- `/agents/` — custom agent definitions and prompt configurations (e.g. Google Ads Agent).
- `workflow.md` — the original master specification (deeply detailed, written for the single-account/single-pipeline era — treat its "5-Layer Speed Strategy" eager-pre-warm section as historical, not current behavior).
- `PROJECT_SPEC.md` — living data-model/API reference; read this first for current state.
- `changes.md` — session-by-session changelog.
- `Conversation.md` — brief per-session discussion notes (separate from the changelog).
- `architecture.md` — this file.

## 4. Maintenance Rule
As mandated by the project's rules, any addition, upgrade, or replacement of libraries or architectural patterns MUST be immediately reflected in this document.
