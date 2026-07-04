# CreativeVisibility / Saarthi — Project Specification
> **READ THIS FIRST.** This document is the single source of truth for agents, developers, and collaborators working on this project.
> It captures the product vision, data architecture, API design, implementation status, and open work.
> Keep it updated whenever the architecture, data model, or product direction changes.

---

## 1. Product Vision

What started as **CreativeVisibility** — a performance marketing intelligence portal built for the Aukera Jewellery Google Ads account — is being expanded into **Saarthi**: a single multi-tenant portal serving an entire agency's accounts (target scale: hundreds of accounts), each with multiple ad-platform channels (Google Ads, Meta Ads today; more platforms later).

**Core principle:** one calculation codebase *per channel type* (one for Google Ads, one for Meta Ads, etc.), reused across every account that has that channel type — not one codebase per account, and not one shared codebase across genuinely different platforms (their data shapes and metrics differ too much).

For the original Aukera Jewellery Google Ads instance specifically, it answers two distinct but related questions:
1. **Creative Performance** — Which specific images and videos (creatives) are driving results? Where are they being served? What is the CTR / CPC / CPM per creative?
2. **Campaign Performance** — What is the TRUE spend across campaigns and ad groups, including inventory that has no creative attached (pull-based, Maps, Search)?

> **Key insight from the product owner:**
> Google Ads spend is NOT limited to creatives. A significant portion runs through:
> - **Pull-based inventory** (Smart Shopping, DSA, Search with auto-targeting)
> - **Google Maps ads** (local presence, no image creative required)
> - **Search campaigns** with only text ads
> These will NEVER appear in creative-level data. Campaign Performance is a separate, complete view of account spend.

---

## 2. Multi-Tenant Access Model (Saarthi layer)

Everything in this section sits *above* any single account's data pipeline — it decides who can see which account/channel at all, and routes them to the right per-channel dashboard.

### 2.1 Hierarchy
`Cluster → Team → Account → Channel`. Defined in `backend/org_data/org_structure.json` (committed, no secrets):
- **Cluster**: `{id, name}`
- **Team**: `{id, name, cluster_id}`
- **Account**: `{id, name, logo_url, team_id}` — e.g. "Aukera Jewellery"
- **Channel**: `{id, name, logo_url, account_id, platform}` — e.g. "Google Ads" / `platform: "google_ads"`. `platform` drives: which calculator (`calculator.py` vs `calculator_meta.py`) processes its data, which frontend icon renders, and which dashboard route (`/dashboard` vs `/dashboard-meta`) a click routes to.

### 2.2 Secrets
`backend/org_data/org_secrets.json` (**gitignored**, like `.env`) maps each `channel_id` → `{sheet_url, apps_script_url}`. `org_secrets.example.json` (committed) shows the shape for onboarding. This replaced the old single global `APPS_SCRIPT_URL` env var — there is no longer one Apps Script URL for the whole backend, only one per channel.

### 2.3 Access grants
`backend/org_data/access_grants.json` (committed) maps each email → a **list** of `{role, scope_type, scope_id}` grants:
- `super_admin` (`scope_type: "global"`) — sees every account/channel, no exceptions.
- `cluster_head` (`scope_type: "cluster"`) — sees every team/account/channel under that cluster.
- `team_head` (`scope_type: "team"`) — sees every account/channel under that team.
- `account_head` (`scope_type: "account"`) — sees every channel under that one account.

A person can hold **multiple grants across unrelated branches** (e.g. account_head for three accounts in three different teams) — this is why grants are a list, not a single role/scope per email. Resolution logic lives in `backend/org_access.py`.

### 2.4 Home page & routing
`frontend/src/routes/index.tsx` is the **Home page** (not the dashboard) — it calls `GET /api/home`, shows every account/channel the signed-in user can see (grouped by cluster/team, with a search box), and a profile section (avatar, role badges, opens the full profile as a modal rather than navigating away). Clicking an **account's** header navigates to `/account?account_id=...` (the Account Overview, §2.5). Clicking a **channel** chip navigates straight to `/dashboard?channel_id=...` (Google) or `/dashboard-meta?channel_id=...` (Meta) based on that channel's `platform`, bypassing the Overview — both entry points exist side by side.

**Adding a new account/channel/person is pure data** — edit the three JSON files above, no restart needed (they're read fresh from disk on every request), *as long as the channel's platform already has code behind it*. Adding a genuinely new ad platform still requires real code: a calculator module, a dashboard route, and a routing rule in Home.

### 2.5 Account Overview (`frontend/src/routes/account.tsx`)
Sits between Home and the per-channel dashboards — combines every channel under one account into one KPI set, rather than showing one channel at a time. Backed by three routes:
- `GET /api/account-summary?account_id=&start=&end=` (`backend/account_aggregator.py`) — sums raw totals across every channel first, then computes blended rates (never averages per-channel rates, which would be wrong at differing channel volumes). Defaults to the current calendar month if no range is given (unlike channel routes' "auto" range — channels under one account can have different underlying data spans that wouldn't be comparable if each resolved its own "auto").
- `GET /api/account-targets?account_id=&month=` (`backend/targets.py`) — an account's monthly lead/spend target, from a dedicated Targets Google Sheet. Returns `found: false` (not an error) if no target is set or the sheet isn't deployed yet — the UI shows an empty state, not an error banner.
- `GET /api/changes` / `POST /api/changes` (`backend/change_history.py`) — the Change Log, §12.

The Creative Visibility sidebar widget needs no new backend route — it calls the existing per-channel `GET /api/performance` for each of the account's channels and merges/sorts the results client-side.

### 2.6 Shared secrets (`org_data/shared_secrets.json`)
Targets and Change History are agency-wide services, not tied to one channel, so their Apps Script URLs don't fit `org_secrets.json`'s per-`channel_id` shape. They live in a new `backend/org_data/shared_secrets.json` (**gitignored**, `.example.json` shows the shape), read via `org_access.get_shared_secret(key)`. As of this writing both URLs are empty placeholders — see §12.3 for what's needed to go live.

### 2.7 A real gotcha hit during the Meta build
TanStack Router's file-based routing treats a **dot** in a route filename as a parent/child separator. Naming the Meta route file `dashboard.meta.tsx` made the router treat it as *nested inside* `dashboard.tsx` — since `dashboard.tsx`'s component has no `<Outlet/>`, the Meta page's content silently never rendered (only the Google dashboard did, just with the Meta route's `<title>`, which comes from routing metadata separately from the page body — so it superficially looked like navigation worked). Caught only by loading the live page, not by the file existing or `tsc` passing clean. Fixed by renaming to `dashboard-meta.tsx` (hyphens don't trigger nesting) — never rename `dashboard.tsx` itself to work around this.

---

## 3. Data Architecture — Per-Channel Pipelines

Each channel (regardless of account) follows the same shape: `Ad platform → Google Sheet tab → Apps Script Web App → FastAPI (channel-scoped) → Frontend`. What differs per platform is the sheet schema, the metric formulas, and the hierarchy labels.

### 3.1 Google Ads — Pipeline A: Creative Performance (Aukera Jewellery, live)

```
Google Ads Scheduled Report
          ↓
   "Daily_dump" Sheet Tab
   (one row per asset per day)
          ↓
   Apps Script Web App
   (backend/apps_script/doGet.js)
   ?tab=raw_daily → all daily rows
          ↓
   FastAPI /api/raw-performance?channel_id=ch_aukera_google_ads
   (auth required, ETag + IndexedDB caching)
          ↓
   Frontend: aggregator.ts
   (client-side date aggregation, <10ms)
          ↓
   Creative Directory tab / Top Performers tab  (/dashboard)
```

**Source sheet:** Single Google Spreadsheet, tab `Daily_dump`
**Granularity:** One row per asset URL per location per campaign per day
**creative_id key:** `Asset_URL|Location|Campaign_Type|Campaign|Ad_Group|Funnel`
**Metrics:** ctr, cpc, cpm, **cr** (conversion rate), **cpa** (cost per acquisition)
**What it captures:** Only visual assets (images, videos) — text ads excluded

### 3.2 Google Ads — Pipeline B: Campaign Performance (Aukera Jewellery, in progress)

```
Google Ads Scheduled Report (campaign/ad group level, ALL inventory)
          ↓
  SEPARATE Google Spreadsheet, Tab: "CampaignPerf"
          ↓
  Apps Script Web App (backend/apps_script/campaignPerformanceDoGet.js)
          ↓
  FastAPI /api/campaign-raw-performance  ← TO BUILD
          ↓
  Frontend: campaignAggregator.ts       ← TO BUILD
          ↓
  Campaign Performance tab              ← PARTIALLY BUILT (see §7)
```

**Source sheet:** Separate Google Spreadsheet (NOT the same one as Daily_dump)
**Granularity:** One row per Ad Group per Day
**dim_id key:** `Campaign|Campaign_Type|Ad_Group|Network|Location|Funnel`
**What it captures:** ALL spend — pull-based, Maps, Search, Display, PMax, DGen

### 3.3 Meta Ads (Aukera Jewellery, live)

```
Meta Ads API → Supermetrics → "Daily_dump" Sheet Tab (separate sheet from Google's)
          ↓
   Apps Script Web App (source lives only in D:\CreativeVisibility-Meta right now —
   not yet copied into this repo; only its deployed URL is referenced)
          ↓
   FastAPI /api/raw-performance?channel_id=ch_aukera_meta_ads
   (same generic endpoint as Google — the envelope shape is identical,
   only the field VALUES differ)
          ↓
   Frontend: dashboard-meta.tsx + Meta-specific components
```

**Metrics:** ctr, cpc, cpm, **cvr** (not cr), **cpl** (not cpa)
**Extra fields:** `landing_page_views`, `thruplays`, `hook_rate`, `video_avg_watch_time` — aggregated server-side by the Apps Script (weighted averages for hook_rate/watch_time), passed through unchanged by the backend
**Hierarchy differences vs Google:** "Ad Set" not "Ad Group"; "Objective" (e.g. `OUTCOME_LEADS`) not "Campaign Type"; no `age_group`/`category` dims
**Composite creative_id:** `Creative_Id|Location|Objective|Campaign|AdSet|Funnel`
**What it does NOT have:** no Campaign Performance tab or Current-Structure mode — neither exists in the Meta reference project.

---

## 4. Google Sheet Schemas

### 4.1 Daily_dump — Google Ads Pipeline A (existing)

| Column | Type | Notes |
|---|---|---|
| Day | Date | YYYY-MM-DD or Google Date |
| Asset | URL | Image URL or YouTube URL |
| Asset_type | String | MARKETING_IMAGE, YOUTUBE_VIDEO, etc. |
| Asset_status | String | Enabled / Paused |
| Campaign | String | Campaign name |
| Location | String | City |
| Funnel | String | TOFU / MOFU |
| Campaign_Type | String | PMax / DGen / Search |
| Ad_group | String | Ad group / asset group |
| Impr | Number | Impressions |
| Clicks / Interactions | Number | |
| Cost | Number | ₹ |
| Conversions / All_conv | Number | |

### 4.2 CampaignPerf — Google Ads Pipeline B (new sheet to create)

| Column | Type | Notes |
|---|---|---|
| Date | Date | YYYY-MM-DD |
| Campaign | String | Campaign name |
| Campaign_Type | String | PMax / Search / DGen / Maps / Display |
| Ad_Group | String | Ad group or asset group |
| Network | String | Search / Maps / Display / YouTube / Cross-network |
| Location | String | City |
| Funnel | String | TOFU / MOFU |
| Impressions | Number | |
| Clicks | Number | |
| Cost | Number | ₹ (no currency symbol) |
| Conversions | Number | |
| All_Conv | Number | Fallback for Conversions |

> **Important:** Only columns Date, Campaign, Impressions, Clicks, Cost are required. All other columns are optional — the Apps Script handles missing columns gracefully.

### 4.3 Daily_dump — Meta Ads (existing, different spreadsheet from Google's)

Populated by Supermetrics' Meta Ads connector. Key columns: Date, Campaign name, Ad name, Ad id, AdSet name, Ad creative url/image, Creative Object type, Creative Id, Objective, Total Cost, Impressions, Clicks, **Link clicks** (used as `clicks`, raw "Clicks" deliberately excluded), Landing page views, ThruPlay actions, Hook Rate, **On Facebook Leads** (used as `conversions`), Video average watch time, Funnel, Location.

---

## 5. Apps Script Files

| File | Purpose | Status |
|---|---|---|
| `backend/apps_script/doGet.js` | Google Ads Pipeline A — creative raw daily rows | ✅ Live |
| `backend/apps_script/campaignPerformanceDoGet.js` | Google Ads Pipeline B — campaign/ad group raw daily rows | ✅ Written, needs deployment |
| Meta Ads `doGet.js` | Meta creative raw daily rows | ✅ Live, but source only exists in `D:\CreativeVisibility-Meta\backend\apps_script\doGet.js` — not copied into this repo yet |

### Deploying campaignPerformanceDoGet.js

1. Open the **new CampaignPerf Google Spreadsheet** (separate from the creative one)
2. `Extensions → Apps Script`
3. Paste the entire contents of `campaignPerformanceDoGet.js`
4. `Deploy → New deployment → Web app`
   - Execute as: **Me**
   - Who has access: **Anyone**
5. Copy the deployment URL
6. Add it to `backend/org_data/org_secrets.json` under the account/channel's entry (not `.env` — that pattern is gone; see §2.2)
7. Run `healthCheck()` from the Apps Script editor to verify

---

## 6. Backend API

Every data route below now requires **both**: a `channel_id` query param, and `Authorization: Bearer <jwt>` — the backend checks the signed-in user's grants actually cover that channel before serving anything (`require_channel_access` in `main.py`). This was NOT true originally; it became necessary once `channel_id` became a client-supplied parameter that could address any account. `/api/home` and `/auth/*` are the only routes with their own separate (also auth-required, but no channel check) shape.

| Method | Path | Description |
|---|---|---|
| GET | `/health` | Liveness check (no auth) |
| GET | `/api/home` | Accounts/channels the signed-in user can see, grouped, with their access summary |
| GET | `/api/raw-performance?channel_id=` | All daily rows for one channel (ETag+IDB) |
| GET | `/api/performance?channel_id=&start=&end=` | Aggregated creatives for date range, one channel |
| GET | `/api/current-structure?channel_id=` | Live campaign structure (Google Ads only — no Meta equivalent) |
| GET | `/api/top-performers?channel_id=&start=&end=&metric=&type=&city=&n=` | Top N creatives by metric, dispatched to the right platform's ranking rules |
| POST | `/api/sync?channel_id=` | Force-clear **one channel's** cache (not everyone's) and pre-warm it |
| GET | `/api/account-summary?account_id=&start=&end=` | Combined KPIs across an account's channels (auth + account-level access check, not channel-level) |
| GET | `/api/account-targets?account_id=&month=` | An account's target for a month; `found: false` if unset — not an error |
| GET | `/api/changes?account_id=&limit=` | Recent Change Log entries for an account |
| POST | `/api/changes` | Document a new change (body-validated; `performed_by` always the authenticated session, never client-supplied) |
| POST | `/auth/google` | Exchange a Google access token for a session JWT |
| GET | `/auth/me` | Verify the current session |

### New endpoint to build (Google Ads Pipeline B)

| Method | Path | Description | Status |
|---|---|---|---|
| GET | `/api/campaign-raw-performance?channel_id=` | All campaign/ad group daily rows (ETag+IDB) | ❌ TODO |

**Response shape for `/api/campaign-raw-performance`:**
```json
{
  "status": "ok",
  "served_from_cache": false,
  "data_fetched_at": "ISO timestamp",
  "available_date_range": { "min": "2026-05-01", "max": "2026-06-30" },
  "dimensions_count": 42,
  "daily_rows_count": 1260,
  "dimensions": {
    "Aukera PMax Mumbai|PMax|Mumbai TOFU Rings|Search|Mumbai|TOFU": {
      "campaign": "Aukera PMax Mumbai",
      "campaign_type": "PMax",
      "ad_group": "Mumbai TOFU Rings",
      "network": "Search",
      "city": "Mumbai",
      "funnel": "TOFU"
    }
  },
  "daily_rows": [
    {
      "dim_id": "Aukera PMax Mumbai|PMax|Mumbai TOFU Rings|Search|Mumbai|TOFU",
      "date": "2026-06-15",
      "impressions": 12400,
      "clicks": 340,
      "cost": 4520.50,
      "conversions": 12.0
    }
  ],
  "filter_options": {
    "campaigns": [], "campaign_types": [], "ad_groups": [],
    "networks": [], "cities": [], "funnels": []
  }
}
```

---

## 7. Frontend Components

### Routes

| Route | File | Purpose |
|---|---|---|
| `/` | `routes/index.tsx` | **Home** — accounts/channels list, search, profile modal |
| `/dashboard` | `routes/dashboard.tsx` | Google Ads dashboard |
| `/dashboard-meta` | `routes/dashboard-meta.tsx` | Meta Ads dashboard |
| `/login` | `routes/login.tsx` | Google OAuth sign-in |
| `/profile` | `routes/profile.tsx` | Full profile page (exports `ProfileContent`, reused inside Home's modal too) |

### Key components (Google) and their Meta forks

| Google component | Meta fork | Data source |
|---|---|---|
| `DirectoryTree.tsx` | `DirectoryTreeMeta.tsx` | `/api/raw-performance` |
| `TopPerformers.tsx` | `TopPerformersMeta.tsx` | Same raw data |
| `FilterPanel.tsx` | `FilterPanelMeta.tsx` | — |
| `GroupingSidebar.tsx` | `GroupingSidebarMeta.tsx` | — |
| `ExportModal.tsx` / `exportPdf.ts` | `ExportModalMeta.tsx` / `exportPdfMeta.ts` | — |
| `CreativeDetailModal.tsx` | `CreativeDetailModalMeta.tsx` | — |
| `CampaignPerformance.tsx` | *(none — no Meta equivalent)* | **WRONG** — currently uses creative data, see §7.1 below |

`DateRangePicker.tsx`, `SavedViewsMenu.tsx`/`savedViews.ts` are shared as-is between both platforms — they're already generic. `hierarchy.ts`/`hierarchy.meta.ts` and `metrics.ts` (single shared file, `cr`/`cpa` and `cvr`/`cpl` both always computed from the same inputs) define the platform-specific labels/dims. `lib/channelIcons.tsx` picks the brand icon by a channel's `platform` field (not by guessing from its name string).

### 7.1 What still needs to change for Campaign Performance (Google Ads Pipeline B)

The `CampaignPerformance.tsx` component was initially scaffolded to aggregate `filteredCreatives[]` client-side. **This is wrong.** Campaign performance data is fundamentally different — it includes spend that has NO creative.

**Required changes:**
1. **Build** `frontend/src/lib/campaignAggregator.ts` — mirrors `aggregator.ts` but uses `dim_id` instead of `creative_id`
2. **Update** `frontend/src/lib/api.ts` — add `fetchRawCampaignPerformance(channelId)` function
3. **Rewrite** `frontend/src/components/CampaignPerformance.tsx` — fetch from new API, aggregate client-side
4. **Build** the backend endpoint from §6

---

## 8. Implementation Status

### ✅ Done

- [x] Creative Directory with full hierarchy (Location → Funnel → Type → Campaign → AdGroup → Creative)
- [x] Top Performers tab (CTR / CPC / CPA / Conversions ranking)
- [x] Date range picker with client-side aggregation (no re-fetch on date change)
- [x] Compare period feature (current vs previous period)
- [x] Filters: Status, City, Funnel, Campaign Type, Campaign Name, Search
- [x] Creative Detail Modal with daily trend charts
- [x] Export (CSV + PDF)
- [x] Saved Views (URL hash sharing)
- [x] Threshold filter (hide low-volume creatives per group)
- [x] Auth (Google OAuth → JWT), now **required** on every data route, not just gating the frontend
- [x] ETag + IndexedDB caching (zero transfer on revisit), now per-channel-scoped
- [x] Campaign Performance tab (UI scaffolded — data wrong, see §7.1)
- [x] Apps Script for Campaign Performance sheet (`campaignPerformanceDoGet.js`)
- [x] **Multi-tenant org model** — Cluster → Team → Account → Channel, role-based access, multi-grant-per-user (§2)
- [x] **Home page** — replaces the old single-dashboard landing experience
- [x] **Backend made channel-aware** — every route takes `channel_id`, per-channel cache namespacing, lazy fetch (no eager pre-warm), access-checked
- [x] **Meta Ads integration** — real channel, own calculator (`cvr`/`cpl`), own dashboard (`/dashboard-meta`), forked components where the platforms genuinely differ
- [x] Theme system on Home — palette (gold/indigo/mint/rose) + light/dark, shared with the dashboard's existing switcher via the same `localStorage` keys
- [x] **Account Overview** (`/account`) — combined KPIs across an account's channels, Creative Visibility widget, Change Log widget + logging form. Backend + frontend fully built and verified live (§12).
- [x] **Change Log** — account-scoped v1, built end-to-end (Apps Script + connector + routes + form UI); **not yet deployed** (§12.3)
- [x] **Targets** — built end-to-end; **not yet deployed** (§12.3)

### 🔧 In Progress / TODO

- [ ] FastAPI endpoint `/api/campaign-raw-performance` (Google Ads Pipeline B)
- [ ] Frontend `campaignAggregator.ts` for Pipeline B
- [ ] Rewrite `CampaignPerformance.tsx` to use Pipeline B data
- [ ] Deploy `campaignPerformanceDoGet.js` to the separate Google Spreadsheet
- [ ] Copy Meta's `doGet.js` source into this repo (`backend/apps_script/`) — currently only its deployed URL is referenced, not its source
- [ ] **Deploy Targets and Change History Google Sheets** (§12.3) — everything downstream is built and waiting on this
- [ ] Upgrade Change Log from account-scoped to campaign-scoped once a real Campaign Master source is decided (§12.1)
- [ ] Admin UI for managing `org_data/*.json` — currently hand-edited (fine for a handful of accounts, will need a UI before "hundreds of accounts" is comfortable)
- [ ] A third ad platform would need: a new calculator module, a new dashboard route, and a routing rule added to Home — none of that is automatic yet

---

## 9. File Map (Key Files)

```
d:\Saarthi-CV\
├── backend\
│   ├── .env                             ← Cache TTL, CORS, JWT secret, allowed emails (NO per-channel URLs anymore)
│   ├── main.py                          ← FastAPI routes, require_channel_access dependency
│   ├── org_access.py                    ← Hierarchy + grants resolution
│   ├── org_data\
│   │   ├── org_structure.json           ← Clusters/Teams/Accounts/Channels (committed)
│   │   ├── org_secrets.json             ← Per-channel sheet/apps-script URLs (gitignored)
│   │   ├── org_secrets.example.json     ← Shape template (committed)
│   │   ├── access_grants.json           ← email -> [{role, scope_type, scope_id}] (committed)
│   │   ├── shared_secrets.json          ← Agency-wide Apps Script URLs — Targets, Change History (gitignored)
│   │   └── shared_secrets.example.json  ← Shape template (committed)
│   ├── apps_script_connector.py         ← Channel-aware httpx connector + cache logic
│   ├── account_aggregator.py            ← Cross-channel aggregation for Account Overview
│   ├── targets.py                       ← Account monthly target lookup (degrades gracefully if unset)
│   ├── change_history.py                ← Change Log read/append connector (degrades gracefully if undeployed)
│   ├── config.py                        ← env var loader (no more get_apps_script_url)
│   ├── cache.py                         ← TTLCache + SQLite cache, invalidate_prefix()
│   ├── calculator.py                    ← Google: CTR/CPC/CPM/CR/CPA
│   ├── calculator_meta.py               ← Meta: CTR/CPC/CPM/CVR/CPL + extras
│   ├── auth.py                          ← JWT + Google OAuth verify
│   └── apps_script\
│       ├── doGet.js                     ← Google Ads Pipeline A: creative data
│       ├── campaignPerformanceDoGet.js  ← Google Ads Pipeline B: campaign data (deploy this)
│       ├── targetsDoGet.js              ← Account Targets (written, not yet deployed)
│       └── changeHistoryDoGet.js        ← Change Log read/append (written, not yet deployed)
│
├── frontend\src\
│   ├── routes\
│   │   ├── index.tsx                    ← Home (accounts/channels, NOT the dashboard)
│   │   ├── account.tsx                  ← Account Overview (combined KPIs, targets, change log)
│   │   ├── dashboard.tsx                ← Google Ads dashboard (Portal component)
│   │   ├── dashboard-meta.tsx           ← Meta Ads dashboard
│   │   ├── login.tsx / profile.tsx
│   ├── components\
│   │   ├── DirectoryTree.tsx / DirectoryTreeMeta.tsx
│   │   ├── TopPerformers.tsx / TopPerformersMeta.tsx
│   │   ├── FilterPanel.tsx / FilterPanelMeta.tsx
│   │   ├── GroupingSidebar.tsx / GroupingSidebarMeta.tsx
│   │   ├── CreativeDetailModal.tsx / CreativeDetailModalMeta.tsx
│   │   ├── ExportModal.tsx / ExportModalMeta.tsx
│   │   ├── CampaignPerformance.tsx      ← Campaign/AdGroup table (needs rework, Google-only)
│   │   ├── CreativeVisibilityWidget.tsx ← Account Overview sidebar: top creatives across channels
│   │   ├── ChangeLogWidget.tsx / ChangeDocumentationForm.tsx  ← Account Overview sidebar: change log + logging form
│   │   └── DateRangePicker.tsx / SavedViewsMenu.tsx  ← shared, platform-agnostic
│   └── lib\
│       ├── api.ts                       ← All HTTP calls (never use fetch() directly); auth header + channel_id baked in
│       ├── aggregator.ts                ← Client-side date aggregation, both platforms
│       ├── metrics.ts                   ← ctr/cpc/cpm/cr/cpa/cvr/cpl + Meta extras
│       ├── hierarchy.ts / hierarchy.meta.ts  ← Dimension hierarchy config, per platform
│       ├── channelIcons.tsx             ← Brand icon by channel.platform
│       └── changeTaxonomy.ts            ← Change Category → Change Type taxonomy (Changelogfeature.md §6)
│
├── PROJECT_SPEC.md                      ← THIS FILE
├── architecture.md                      ← Tech stack reference
├── changes.md                          ← Session-by-session changelog
└── Conversation.md                      ← Brief per-session discussion notes
```

---

## 10. Coding Conventions

### Never Do
- ❌ Use `fetch()` directly in components — always go through `frontend/src/lib/api.ts`
- ❌ Hardcode cities, campaign types, funnels — always derive dynamically from data
- ❌ Touch `backend/.env` or `org_data/org_secrets.json` without the user's explicit instruction
- ❌ Filter zero-impression rows on the Apps Script side for Campaign Performance (Maps ads can have 0 impressions but real spend)
- ❌ Hardcode `oklch(...)` colors in new frontend UI — use the theme tokens in `styles.css` (`bg-background`, `text-gold`, etc.) so the palette/light-dark switcher keeps working
- ❌ Name a new route file with a dot that shares a prefix with an existing route (`dashboard.<x>.tsx`) — TanStack Router treats that as nesting under the existing route. Use a hyphen instead.
- ❌ Add a new data route without both `channel_id` and the `require_channel_access` auth dependency
- ❌ Assume a "done" report from a subagent is correct without loading the actual page/running the actual code — the Meta dashboard route nesting bug and the DirectoryTree.tsx type regression were both invisible in the report and only caught by hands-on verification

### Always Do
- ✅ Use `computeMetrics()` from `metrics.ts` for all CTR/CPC/CPM/CR/CPA/CVR/CPL calculations
- ✅ Use `sortDailyRows()` once after fetch, then binary search for date filtering
- ✅ Client-side aggregation for date range changes (no re-fetch)
- ✅ Document every session's changes in `changes.md`, brief notes in `Conversation.md` — newest entries on top in both
- ✅ Update `architecture.md` and this file if the tech stack or data model changes
- ✅ New channels should be lazily fetched and cached per-channel — never add eager pre-warm-everything behavior back in; it doesn't scale to hundreds of accounts

---

## 11. Environment Variables

### `backend/.env`

```env
CACHE_TTL=1800
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000,http://localhost:8080
API_HOST=0.0.0.0
API_PORT=8000
GOOGLE_CLIENT_ID=591635882093-...
ALLOWED_EMAILS=sourabhchaudhari8830@gmail.com,sourabh.chaudhari@dentsu.com
JWT_SECRET=dev-secret-change-me
DB_PATH=cv_cache.db
```
**No per-channel Apps Script URLs here anymore** — those live in `backend/org_data/org_secrets.json` (gitignored), one entry per `channel_id`.

### `frontend/.env.local`

```env
VITE_API_URL=http://localhost:8000
VITE_GOOGLE_CLIENT_ID=591635882093-...
```

---

## 12. Account Overview, Targets & Change Log

Built end-to-end (backend + frontend), but **Targets and Change Log need manual setup before they show real data** — see the checklist at the end of this section.

### 12.1 Change Log — v1 scope (account, not campaign)
`Changelogfeature.md` designs a full Campaign-ID-keyed audit ledger. Saarthi has no Campaign Master data source yet, so v1 is deliberately **account-scoped**: `backend/apps_script/changeHistoryDoGet.js` reads/appends `Account_ID`/`Account_Name` instead of `Campaign_ID`/`Campaign_Name`. Upgrading to per-campaign granularity later means adding those columns + a campaign lookup to the same sheet — additive, not a rewrite. Immutability is enforced the same way the design doc specifies: the script exposes only `doGet` (list) and `doPost` (append) — no update/delete action exists at any layer.

### 12.2 Targets — v1 scope
A single `Targets` Google Sheet tab (`Account_ID | Month | Target_Leads | Target_Spend`), one row per account per month, hand-edited. Read-only from the app's side — no UI to set targets yet (flagged as a future enhancement in `Changelogfeature.md` §18, same as it says there).

### 12.3 What's needed to go live
1. Create a Google Sheet for Targets, paste `backend/apps_script/targetsDoGet.js`, run `setupTargetsSheet()` once from the Apps Script editor (creates the header row), deploy as a Web App (`Execute as: Me`, `Who has access: Anyone`), copy the URL.
2. Create a Google Sheet for Change History, paste `backend/apps_script/changeHistoryDoGet.js`, run `setupChangeHistorySheet()` once, deploy the same way, copy the URL.
3. Add both URLs to `backend/org_data/shared_secrets.json` (`targets_apps_script_url`, `change_history_apps_script_url`). No restart needed — read fresh from disk like the rest of `org_data`.

---

## 13. Open Questions / Decisions

| # | Question | Status |
|---|---|---|
| 1 | Will the CampaignPerf sheet be populated manually or via a Google Ads scheduled report? | ❓ Open |
| 2 | Should Pipeline B data also support Compare Period (current vs previous)? | ❓ Open |
| 3 | Should campaign-level data show a bar chart (spend by campaign) or just the table? | ❓ Open |
| 4 | Network column — is "Maps" a value from Google Ads export or does the user label it manually? | ❓ Open |
| 5 | When does hand-editing `org_data/*.json` stop being workable and need an admin UI? | ❓ Open — flagged, not yet needed |
| 6 | Should Meta's `doGet.js` source be copied into this repo for consistency with the two Google pipelines? | ❓ Open — asked, not yet done |
| 7 | Where/how will the real Campaign Master data source be decided? (User: "plan for both, decide later" — pluggable design deferred; v1 Change Log ships account-scoped instead, §12.1) | ❓ Open |
| 8 | Targets/Change History Google Sheets — not yet created/deployed by the user | ❓ Open — blocking, see §12.3 |
