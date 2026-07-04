# CreativeVisibility — Project Specification
> **READ THIS FIRST.** This document is the single source of truth for agents, developers, and collaborators working on this project.
> It captures the product vision, data architecture, API design, implementation status, and open work.
> Keep it updated whenever the architecture, data model, or product direction changes.

---

## 1. Product Vision

CreativeVisibility is a **performance marketing intelligence portal** built for the Aukera Jewellery Google Ads account.

It answers two distinct but related questions:
1. **Creative Performance** — Which specific images and videos (creatives) are driving results? Where are they being served? What is the CTR / CPC / CPM per creative?
2. **Campaign Performance** — What is the TRUE spend across campaigns and ad groups, including inventory that has no creative attached (pull-based, Maps, Search)?

> **Key insight from the product owner:**
> Google Ads spend is NOT limited to creatives. A significant portion runs through:
> - **Pull-based inventory** (Smart Shopping, DSA, Search with auto-targeting)
> - **Google Maps ads** (local presence, no image creative required)
> - **Search campaigns** with only text ads
> These will NEVER appear in creative-level data. Campaign Performance is a separate, complete view of account spend.

---

## 2. Data Architecture (Two Independent Pipelines)

### Pipeline A — Creative Performance (existing, live)

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
   FastAPI /api/raw-performance
   (ETag + IndexedDB caching)
          ↓
   Frontend: aggregator.ts
   (client-side date aggregation, <10ms)
          ↓
   Creative Directory tab
   Top Performers tab
```

**Source sheet:** Single Google Spreadsheet, tab `Daily_dump`
**Granularity:** One row per asset URL per location per campaign per day
**creative_id key:** `Asset_URL|Location|Campaign_Type|Campaign|Ad_Group|Funnel`
**What it captures:** Only visual assets (images, videos) — text ads excluded

---

### Pipeline B — Campaign Performance (NEW, in progress)

```
Google Ads Scheduled Report
(campaign/ad group level, ALL inventory)
          ↓
  SEPARATE Google Spreadsheet
  Tab: "CampaignPerf"
  (one row per ad group per day)
          ↓
  Apps Script Web App
  (backend/apps_script/campaignPerformanceDoGet.js)
  → returns ALL raw daily rows
          ↓
  FastAPI /api/campaign-raw-performance  ← TO BUILD
  (ETag + IndexedDB caching)
          ↓
  Frontend: campaignAggregator.ts       ← TO BUILD
  (client-side date aggregation)
          ↓
  Campaign Performance tab              ← PARTIALLY BUILT
  (currently reads from creative data — wrong, see §5)
```

**Source sheet:** Separate Google Spreadsheet (NOT the same one as Daily_dump)
**Granularity:** One row per Ad Group per Day
**dim_id key:** `Campaign|Campaign_Type|Ad_Group|Network|Location|Funnel`
**What it captures:** ALL spend — pull-based, Maps, Search, Display, PMax, DGen

---

## 3. Google Sheet Schemas

### 3.1 Daily_dump (Pipeline A — existing)

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

### 3.2 CampaignPerf (Pipeline B — new sheet to create)

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

> **Important:** Only columns Date, Campaign, Impressions, Clicks, Cost are required.
> All other columns are optional — the Apps Script handles missing columns gracefully.

---

## 4. Apps Script Files

| File | Purpose | Status |
|---|---|---|
| `backend/apps_script/doGet.js` | Pipeline A — creative raw daily rows | ✅ Live |
| `backend/apps_script/campaignPerformanceDoGet.js` | Pipeline B — campaign/ad group raw daily rows | ✅ Written, needs deployment |

### Deploying campaignPerformanceDoGet.js

1. Open the **new CampaignPerf Google Spreadsheet** (separate from the creative one)
2. `Extensions → Apps Script`
3. Paste the entire contents of `campaignPerformanceDoGet.js`
4. `Deploy → New deployment → Web app`
   - Execute as: **Me**
   - Who has access: **Anyone**
5. Copy the deployment URL
6. Add to `backend/.env`:
   ```
   CAMPAIGN_PERF_SCRIPT_URL=https://script.google.com/macros/s/[YOUR_ID]/exec
   ```
7. Run `healthCheck()` from the Apps Script editor to verify

---

## 5. Backend API

### Existing endpoints (FastAPI)

| Method | Path | Description |
|---|---|---|
| GET | `/health` | Liveness check |
| GET | `/api/raw-performance` | All creative daily rows (ETag+IDB) |
| GET | `/api/performance` | Aggregated creatives for date range |
| GET | `/api/current-structure` | Live campaign structure (PMax+DGen sheets) |
| GET | `/api/top-performers` | Top N creatives by metric |
| POST | `/api/sync` | Force-clear all caches |

### New endpoints to build (Pipeline B)

| Method | Path | Description | Status |
|---|---|---|---|
| GET | `/api/campaign-raw-performance` | All campaign/ad group daily rows (ETag+IDB) | ❌ TODO |

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

## 6. Frontend Components

### Existing (live)

| Component | Tab | Data source |
|---|---|---|
| `DirectoryTree.tsx` | Creative Directory | `/api/raw-performance` |
| `TopPerformers.tsx` | Top Performers | Same raw data |
| `CampaignPerformance.tsx` | Campaign Performance | **WRONG** — currently uses creative data |

### What needs to change for Campaign Performance

The `CampaignPerformance.tsx` component was initially scaffolded to aggregate `filteredCreatives[]` client-side. **This is wrong.** Campaign performance data is fundamentally different — it includes spend that has NO creative.

**Required changes:**
1. **Build** `frontend/src/lib/campaignAggregator.ts` — mirrors `aggregator.ts` but uses `dim_id` instead of `creative_id`
2. **Update** `frontend/src/lib/api.ts` — add `fetchRawCampaignPerformance()` function
3. **Rewrite** `frontend/src/components/CampaignPerformance.tsx` — fetch from new API, aggregate client-side
4. **Add** `VITE_CAMPAIGN_SCRIPT_URL` or let the frontend talk to the Python backend at `/api/campaign-raw-performance`

---

## 7. Implementation Status

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
- [x] Auth (Google OAuth → JWT)
- [x] ETag + IndexedDB caching (zero transfer on revisit)
- [x] Campaign Performance tab (UI scaffolded — data wrong, see §5)
- [x] Apps Script for Campaign Performance sheet (`campaignPerformanceDoGet.js`)

### 🔧 In Progress / TODO

- [ ] FastAPI endpoint `/api/campaign-raw-performance`
- [ ] Frontend `campaignAggregator.ts` for Pipeline B
- [ ] Rewrite `CampaignPerformance.tsx` to use Pipeline B data
- [ ] Add `CAMPAIGN_PERF_SCRIPT_URL` to `backend/.env`
- [ ] Deploy `campaignPerformanceDoGet.js` to the separate Google Spreadsheet

---

## 8. File Map (Key Files)

```
d:\Saarthi-CV\
├── backend\
│   ├── .env                             ← API keys + URLs (never commit)
│   ├── main.py                          ← FastAPI routes
│   ├── apps_script_connector.py         ← httpx connector + cache logic
│   ├── config.py                        ← env var loader
│   ├── cache.py                         ← TTLCache + SQLite cache
│   ├── calculator.py                    ← CTR/CPC/CPM/CPA enrichment
│   ├── auth.py                          ← JWT + Google OAuth verify
│   └── apps_script\
│       ├── doGet.js                     ← Pipeline A: creative data
│       └── campaignPerformanceDoGet.js  ← Pipeline B: campaign data (deploy this)
│
├── frontend\src\
│   ├── routes\
│   │   └── index.tsx                    ← Main dashboard (Portal component)
│   ├── components\
│   │   ├── DirectoryTree.tsx            ← Creative directory table
│   │   ├── TopPerformers.tsx            ← Top performers panel
│   │   ├── CampaignPerformance.tsx      ← Campaign/AdGroup table (needs rework)
│   │   ├── FilterPanel.tsx              ← Filter bar
│   │   ├── CreativeDetailModal.tsx      ← Creative drilldown modal
│   │   └── DateRangePicker.tsx
│   └── lib\
│       ├── api.ts                       ← All HTTP calls (never use fetch() directly)
│       ├── aggregator.ts                ← Pipeline A client-side aggregation
│       ├── metrics.ts                   ← CTR/CPC/CPM/CPA formatters
│       └── hierarchy.ts                 ← Dimension hierarchy config
│
├── PROJECT_SPEC.md                      ← THIS FILE
├── architecture.md                      ← Tech stack reference
└── changes.md                          ← Session-by-session changelog
```

---

## 9. Coding Conventions

### Never Do
- ❌ Use `fetch()` directly in components — always go through `frontend/src/lib/api.ts`
- ❌ Hardcode cities, campaign types, funnels — always derive dynamically from data
- ❌ Touch `backend/.env` without the user's explicit instruction
- ❌ Filter zero-impression rows on the Apps Script side for Campaign Performance (Maps ads can have 0 impressions but real spend)

### Always Do
- ✅ Use `computeMetrics()` from `metrics.ts` for all CTR/CPC/CPM/CPA calculations
- ✅ Use `sortDailyRows()` once after fetch, then binary search for date filtering
- ✅ Client-side aggregation for date range changes (no re-fetch)
- ✅ Document every session's changes in `changes.md`
- ✅ Update `architecture.md` if the tech stack changes

---

## 10. Environment Variables

### `backend/.env`

```env
APPS_SCRIPT_URL=https://script.google.com/macros/s/[ID]/exec   # Pipeline A (creative data)
CAMPAIGN_PERF_SCRIPT_URL=https://script.google.com/macros/s/[ID]/exec  # Pipeline B (campaign data) — TO ADD
CACHE_TTL=1800
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000,http://localhost:8080
API_HOST=0.0.0.0
API_PORT=8000
ALLOWED_EMAILS=sourabhchaudhari8830@gmail.com,sourabh.chaudhari@dentsu.com
JWT_SECRET=dev-secret-change-me
```

### `frontend/.env.local`

```env
VITE_API_URL=http://localhost:8000
VITE_GOOGLE_CLIENT_ID=591635882093-...
```

---

## 11. Open Questions / Decisions

| # | Question | Status |
|---|---|---|
| 1 | Will the CampaignPerf sheet be populated manually or via a Google Ads scheduled report? | ❓ Open |
| 2 | Should Pipeline B data also support Compare Period (current vs previous)? | ❓ Open |
| 3 | Should campaign-level data show a bar chart (spend by campaign) or just the table? | ❓ Open |
| 4 | Network column — is "Maps" a value from Google Ads export or does the user label it manually? | ❓ Open |
