# CreativeVisibility — Batched Implementation Plan

## Current Status

| Item | Status |
|---|---|
| `workflow.md` — Master specification (20 sections) | ✅ Complete |
| Frontend (Lovable build) — All components built | ✅ Cloned & audited |
| `agents/ads_agent.md` — Google Ads AI agent | ✅ Complete |
| Google Sheet — Data source | ❌ Not set up |
| Apps Script Web App — JSON API bridge | ❌ Not built |
| FastAPI Backend — Python API server | ❌ Not built |
| Frontend → Backend — API wiring | ❌ Not done (still on mockData.ts) |
| Google Ads Scheduled Report — Auto data feed | ❌ Not configured |
| Node.js version — Needs upgrade to ≥20.19.0 | ⚠️ Warning only (v20.16.0) |
| Login / Auth | 🔜 Future phase — not in scope yet |

---

## Open Questions (Confirm Before Starting)

> [!IMPORTANT]
> **Answer these before Batch 1 begins — they affect the Google Sheet structure and Apps Script design.**

1. **Google Sheet:** Do you have an existing Google Sheet for this project, or should we create a brand new one?
2. **Cities in production data:** The mockData uses Bangalore, Hyderabad, Noida, NCR. Are these the actual cities in your real Google Ads account? Or are there more/different cities?
3. **Apps Script URL security:** The Web App URL is a shared secret — only stored in the backend `.env` file. Are you OK with "Anyone with the link" access, or do you need it restricted to your Google account only?
4. **Google Ads Scheduled Report:** Have you set up the scheduled report in Google Ads before, or will you need step-by-step guidance for that as a separate task?
5. **Backend hosting:** For now, will FastAPI run locally on your machine (`localhost:8000`), or do you need it deployed to a server immediately?

---

## Batch 1 — Google Sheet + Apps Script Foundation
**Goal:** Working JSON API endpoint that returns creative metadata and performance data.
**You do:** Set up the Google Sheet. I write and guide you through the Apps Script deployment.
**Time estimate:** 1–2 hours (includes manual Google setup steps)

### Architectural Rules (Locked — Non-Negotiable)
> **Cities, campaign types, categories, age groups, funnels, and statuses are ALWAYS derived dynamically from the `creative_dimensions` Sheet tab.**
> They are NEVER hardcoded in the Apps Script, FastAPI backend, or React frontend.
> When the brand expands to a new city, adds a new campaign type, or changes a category — it appears automatically in all filter dropdowns the moment the Sheet row is saved.
> Violating this rule = hardcoding = manual code changes on every business expansion = unacceptable.

### What Gets Built
- [ ] Google Sheet — 4 tabs created with correct column headers:
  - `creative_dimensions` — Creative metadata (managed manually by team)
  - `daily_performance` — Performance data (auto-written by Google Ads nightly)
  - `summary_by_creative` — Pre-aggregated QUERY formula tab (the speed key)
  - `query_controls` — Start/end date trigger cells for the QUERY formula
- [ ] Apps Script `doGet()` — Complete function written, reads summary + dimensions, accepts `?start=&end=` params
  - **Includes `deriveFilterOptions()`** — extracts unique cities, campaign_types, categories, age_groups, funnels, statuses from dimension rows and returns them in `filter_options` response key
- [ ] Apps Script deployed as Web App — URL tested and working
- [ ] Manual test: Call the URL in browser, confirm JSON response with correct structure
- [ ] `backend/.env.template` — Created with `APPS_SCRIPT_URL` placeholder

### Deliverable
```
GET https://script.google.com/macros/s/[ID]/exec?start=2026-05-01&end=2026-05-28
→ Returns: {
    status: "ok",
    dimensions: [...],
    performance: [...],
    filter_options: {
      cities: ["Bangalore", "Hyderabad", "Noida", "NCR", ...],   ← auto-expands with new cities
      campaign_types: ["Display", "PMax", "Search", "Video"],
      categories: ["Bridal", "Everyday", "Fashion", ...],
      age_groups: ["18-24", "25-34", "35-50"],
      funnels: ["MOFU", "TOFU"],
      statuses: ["Enabled", "Paused"]
    }
  }
```

---

## Batch 2 — FastAPI Backend
**Goal:** Python backend running locally, serving the frontend with real aggregated data.
**You do:** Run `pip install` and `uvicorn` commands when prompted.
**Time estimate:** 1 hour of building

### What Gets Built
```
backend/
├── main.py                    ← FastAPI app, all routes, lifespan, CORS
├── config.py                  ← Reads .env — APPS_SCRIPT_URL, CACHE_TTL, ALLOWED_ORIGINS
├── cache.py                   ← TTLCache (15-min TTL, 50 max slots)
├── apps_script_connector.py   ← Async httpx call to Apps Script, cache check
├── calculator.py              ← computeMetrics() — CTR, CPC, CPM, CR, CPA with safeDiv
├── requirements.txt           ← fastapi, uvicorn, httpx, cachetools, python-dotenv
└── .env                       ← APPS_SCRIPT_URL=<your url>, CACHE_TTL=900
```

### API Routes Built
| Method | Route | Purpose |
|---|---|---|
| `GET` | `/api/dimensions` | Returns creative metadata from Apps Script (cached) |
| `GET` | `/api/performance?start=&end=` | Returns aggregated metrics per creative for date range |
| `GET` | `/api/top-performers?start=&end=&metric=&city=` | Top 5 image + video creatives by metric |
| `POST` | `/api/sync` | Force-clears cache, triggers fresh Apps Script fetch |
| `GET` | `/health` | Server liveness check |

### Deliverable
```
uvicorn backend.main:app --reload
→ http://localhost:8000/api/performance?start=2026-05-01&end=2026-05-28
→ Returns aggregated JSON matching the shape the frontend expects
```

---

## Batch 3 — Frontend → Backend Wiring
**Goal:** Replace `mockData.ts` with real API calls. Portal shows real data end-to-end.
**You do:** Nothing — I make all code changes.
**Time estimate:** 30–45 minutes

### What Gets Built / Changed
```
frontend/src/lib/
└── api.ts                     ← NEW: fetchDimensions(), fetchPerformance(), fetchTopPerformers()

frontend/src/routes/
└── index.tsx                  ← MODIFIED: Replace mockData imports with useEffect API calls
                                  Add loading state, error state, retry button

frontend/.env.local            ← NEW: VITE_API_URL=http://localhost:8000
```

### Key Changes in `index.tsx`
- Remove: `import { creatives, dailyPerformance, cities } from "@/data/mockData"`
- Add: `useState` for `creatives`, `aggregated`, `loading`, `error`
- Add: `useEffect` to call `/api/dimensions` on mount
- Add: `useEffect` to call `/api/performance` whenever date range changes
- Add: Loading skeleton shown while API fetches
- Add: Toast error shown if API fails (with retry button)

### Deliverable
```
npm run dev  (in frontend/)
→ Portal loads with real data from Google Sheet
→ Changing date range triggers backend fetch
→ All filters, exports, saved views work on real data
```

---

## Batch 4 — Node.js Upgrade + Dev Environment Polish
**Goal:** Clean dev environment with no engine warnings. Run frontend properly.
**You do:** Approve the Node.js upgrade command.
**Time estimate:** 15–30 minutes

### What Gets Done
- [ ] Check if `nvm` (Node Version Manager) is installed on the machine
- [ ] If yes: `nvm install 22 && nvm use 22`
- [ ] If no: Download and install Node.js v22 LTS
- [ ] Verify `npm run dev` starts without EBADENGINE warnings
- [ ] Test the running portal in browser (localhost:5173)
- [ ] Verify dark/light theme toggle works
- [ ] Verify date range filter triggers API call
- [ ] Verify export PDF and CSV work

### Deliverable
```
node -v → v22.x.x (no warnings)
npm run dev → Vite dev server at http://localhost:5173
Portal → Fully functional with real data, zero console errors
```

---

## Batch 5 — Google Ads Scheduled Report Setup
**Goal:** Fully automatic nightly data pipeline — zero manual work after setup.
**You do:** Configure in Google Ads UI (I give exact step-by-step).
**Time estimate:** 15–20 minutes (one-time setup)

### What Gets Done
- [ ] Step-by-step guide for creating a scheduled Google Ads report
- [ ] Correct columns selected (Date, Ad name/Creative ID, Impressions, Clicks, Cost, Conversions)
- [ ] Schedule set to daily at 12:30 AM IST
- [ ] Delivery set to the Google Sheet (`daily_performance` tab)
- [ ] Verify first automatic run works the next morning
- [ ] Verify `summary_by_creative` tab auto-updates after new rows arrive

### Deliverable
```
Every morning at 12:30 AM:
Google Ads → writes rows to daily_performance tab
→ summary_by_creative tab auto-recalculates
→ FastAPI cache expires
→ Next portal open fetches fresh data automatically
```

---

## Batch 6 — QA & End-to-End Testing
**Goal:** Every feature tested with real data. Zero bugs before client demo.
**You do:** Test in browser and confirm each item.
**Time estimate:** 1–2 hours

### Test Checklist
#### Filters
- [ ] Date range change → API called → KPI tiles update
- [ ] Status filter (Enabled/Paused) → Directory tree updates
- [ ] City filter → Only selected city creatives shown
- [ ] Funnel filter (TOFU/MOFU) → Correct creatives shown
- [ ] Search text → Filters across campaign name, city, category, headline, description

#### Creative Directory
- [ ] All hierarchy preset combinations work
- [ ] Custom hierarchy drag reorder works
- [ ] Group expand/collapse works
- [ ] Thumbnail hover preview appears (Image + Video + Text)
- [ ] Row height slider changes thumbnail size
- [ ] Clicking a creative opens the detail modal

#### Creative Detail Modal
- [ ] Back / Forward buttons work
- [ ] ← → keyboard navigation works
- [ ] Breadcrumb clicking cycles sibling creatives
- [ ] All 4 charts render with real data
- [ ] CTR delta vs. dataset average is correct
- [ ] CPA delta vs. dataset average is correct

#### Top Performers Tab
- [ ] Top Image creatives ranked correctly by CTR / Conversions / CPC / CPA
- [ ] Top Video creatives ranked separately
- [ ] Medal badges correct (1st/2nd/3rd)
- [ ] City filter on main page affects Top Performers

#### Export
- [ ] CSV export downloads with all metrics calculated
- [ ] PDF export — light theme renders correctly
- [ ] PDF export — dark theme renders correctly
- [ ] Image URLs remain clickable in the PDF

#### Saved Views
- [ ] Save a named view — appears in list
- [ ] Load saved view — all state restored correctly
- [ ] Share link — URL hash encodes the view
- [ ] Open shared URL — view auto-applied with toast
- [ ] Export views as JSON — file downloaded
- [ ] Import views from JSON — views restored

#### Theme
- [ ] Dark mode — all components look correct
- [ ] Light mode — all components look correct
- [ ] Theme persists after page refresh

---

## Batch Order & Dependencies

```
Batch 1 (Google Sheet + Apps Script)
    ↓ required before
Batch 2 (FastAPI Backend)
    ↓ required before
Batch 3 (Frontend Wiring)
    ↓ can run in parallel with
Batch 4 (Node.js + Dev Environment)
    ↓ all complete before
Batch 5 (Google Ads Scheduled Report) ← one-time manual setup
    ↓ everything working before
Batch 6 (QA & Testing)
```

---

## What Is NOT In This Plan (Future Phases)
| Feature | Why Deferred |
|---|---|
| Login / Authentication | Explicitly out of scope for Phase 1 |
| BigQuery migration | Only needed when Google Sheets hits 1.6M row limit |
| Production server deployment | Localhost first, deploy after QA passes |
| Multi-user access control | Deferred to Phase 2 with Auth |
| Mobile responsive polish | Desktop-first for now (primary use case) |
