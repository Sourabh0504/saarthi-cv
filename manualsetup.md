# CreativeVisibility — Manual Setup Guide
> Everything YOU need to do, in exact order.
> All code is already written. This is purely your action list.

---

## Overview

| Step | Task | Time |
|---|---|---|
| 1 | Verify `Daily_dump` tab + column headers | 5 min |
| 2 | Deploy Apps Script | 15 min |
| 3 | Fill in backend `.env` | 2 min |
| 4 | Start the backend server | 2 min |
| 5 | Start the frontend dev server | 2 min |
| 6 | Google Ads Scheduled Report | 15 min |

**Total: ~45 minutes**

---

## PART 1 — Google Sheet Setup

### 1.1 — Open your Google Sheet

Open the Google Sheet you are using for this project. It should already have your `Daily_dump` tab with data exported from Google Ads.

---

### 1.2 — Verify your `Daily_dump` tab exists and has the correct headers

Click into cell **A1** of the `Daily_dump` tab and confirm the header row matches **exactly** (case-sensitive):

```
Day	Asset_status	Asset	Asset_type	Campaign	Location	Funnel	Campaign_Type	Ad_group	Level	Status	Status_reason	Added_by	Currency_code	TrueView_avg_CPV	Avg_CPM	Impr	Interactions	Interaction_rate	Avg_cost	Cost	Clicks	Campaign_ID	TrueView_views	Conversions	All_conv	Store_visits
```

> ⚠️ The script reads these column names exactly. If any column is missing or spelled differently, the health check will tell you which ones.

**The key columns the script uses:**

| Column | Used For |
|---|---|
| `Day` | Date filter — rows outside the selected range are skipped |
| `Asset` | The image URL or YouTube video URL — this IS the creative |
| `Asset_type` | `IMAGE`, `VIDEO`, `YOUTUBE_VIDEO` → kept. Headline/description rows → skipped |
| `Asset_status` | Maps to `status` (Enabled / Paused) |
| `Campaign` | campaign_name |
| `Location` | city — drives the city filter dropdown dynamically |
| `Funnel` | TOFU / MOFU — drives the funnel filter dropdown dynamically |
| `Campaign_Type` | PMax / Dgen etc. — drives the campaign type filter dynamically |
| `Ad_group` | Asset group or ad group name |
| `Impr` | Impressions |
| `Interactions` | Clicks (Google Ads uses Interactions for PMax) |
| `Cost` | Cost in ₹ |
| `Conversions` | Conversions |

> ✅ That's it. No other tabs needed — **`Daily_dump` is the single source of truth** for everything.
> New cities, new campaign types, new funnels — they automatically appear in all portal filters the moment they exist in this sheet. Zero code changes ever needed.

---

## PART 2 — Apps Script Setup

### 2.1 — Open Apps Script

In your Google Sheet: **Extensions → Apps Script**

A new browser tab opens with the script editor.

---

### 2.2 — Paste the script

1. **Delete** all the default code (the empty `myFunction()` block)
2. Open this file in VS Code / your editor:
   ```
   d:\CreativeVisibility\backend\apps_script\doGet.js
   ```
3. **Copy the entire file contents**
4. **Paste** into the Apps Script editor
5. Click **💾 Save** (or Ctrl+S)
6. When prompted for a project name, enter: `CreativeVisibility API`

---

### 2.3 — Run the setup helper

1. In the function dropdown at the top, select **`setupQueryControls`**
2. Click the **▶ Run** button
3. A permissions dialog will appear → click **Review permissions → Allow**
4. A popup confirms the `query_controls` tab was created

> This tab is just a run-log for debugging. It shows the last date range queried and when. It is NOT used by any formula.

---

### 2.4 — Run the health check

1. In the function dropdown, select **`healthCheck`**
2. Click **▶ Run**
3. Click **View → Logs** (or Ctrl+Enter)

You should see:
```
=== CreativeVisibility Health Check ===
✅ Daily_dump: 1500 rows
✅ query_controls: 2 rows
✅ Daily_dump: all required column headers present
Daily_dump Asset_type breakdown: {"IMAGE":420,"VIDEO":180,"HEADLINE":900,...}
=== Health check complete ===
```

> ❌ If `Daily_dump` shows ❌ — check the tab name is exactly `Daily_dump` (case-sensitive).
> ❌ If column headers show ❌ — go back to Part 1 and fix the column name mismatch.

---

### 2.5 — Run the end-to-end test

1. Select **`runTestFetch`** from the dropdown
2. Click **▶ Run**
3. Click **View → Logs**

You should see something like:
```
=== runTestFetch ===
Date range: 2026-04-29 → 2026-05-28
Creatives found (IMAGE+VIDEO): 47
Cities: Bangalore, Hyderabad, Mumbai, NCR
Campaign types: Dgen, PMax
Funnels: MOFU, TOFU
Sample creative: { "creative_id": "...", "city": "Mumbai", ... }
=== Test complete ===
```

> ℹ️ `Creatives found` = 0 means no IMAGE or VIDEO rows exist in the date range. Check your `Daily_dump` has data and that `Asset_type` column contains `IMAGE` or `VIDEO` (not just headlines).

---

### 2.6 — Deploy as Web App

1. Click **Deploy → New deployment**
2. Click the ⚙️ gear icon next to "Select type" → choose **Web app**
3. Fill in:
   - **Description:** `CreativeVisibility JSON API v1`
   - **Execute as:** `Me` (your Google account)
   - **Who has access:** `Anyone`
4. Click **Deploy**
5. Copy the URL that appears — it looks like:
   ```
   https://script.google.com/macros/s/AKfycbxABC123.../exec
   ```

> 🔑 **Save this URL** — you'll need it in the next step. Keep it private (it's your API gateway).

---

### 2.7 — Test the URL

Open a new browser tab and visit your deployment URL. You should get a JSON response like:

```json
{
  "status": "ok",
  "date_range": { "start": "2026-04-29", "end": "2026-05-28" },
  "dimensions_count": 47,
  "performance_count": 47,
  "creatives": [...],
  "filter_options": {
    "cities": ["Bangalore", "Hyderabad", "Mumbai", "NCR"],
    "campaign_types": ["Dgen", "PMax"],
    "funnels": ["MOFU", "TOFU"],
    ...
  }
}
```

`"status": "ok"` with real cities in `filter_options` → ✅ working end-to-end.

---

## PART 3 — Backend Configuration

### 3.1 — Create the `.env` file

1. In File Explorer, go to: `d:\CreativeVisibility\backend\`
2. Copy the file `.env.template`
3. Rename the copy to `.env` (remove the `.template` extension)
4. Open `.env` in a text editor
5. Replace the placeholder with your actual deployment URL from Step 2.6

Your `.env` should look like:
```
APPS_SCRIPT_URL=https://script.google.com/macros/s/AKfycbxABC123.../exec
CACHE_TTL=900
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000
API_HOST=0.0.0.0
API_PORT=8000
```

> ⚠️ Never commit `.env` to Git. The `.gitignore` already excludes it.

---

## PART 4 — Run the Servers

### 4.1 — Install Python dependencies (first time only)

Open a **PowerShell / terminal window** and run:
```powershell
cd d:\CreativeVisibility\backend
pip install -r requirements.txt
```

---

### 4.2 — Start the FastAPI backend

In the same terminal:
```powershell
uvicorn main:app --reload --port 8000
```

You should see:
```
INFO:     Started server process
INFO:     Waiting for application startup.
[startup] Cache pre-warmed: 2026-04-29 → 2026-05-28
INFO:     Application startup complete.
INFO:     Uvicorn running on http://0.0.0.0:8000
```

**Leave this terminal open.**

---

### 4.3 — Verify the backend is working

Open a browser and go to:
```
http://localhost:8000/health
```

You should see:
```json
{ "status": "ok", "cache": { "current_size": 1 } }
```

Also visit:
```
http://localhost:8000/docs
```

This opens the interactive Swagger UI — you can test every API route here.

---

### 4.4 — Start the frontend dev server

Open a **second PowerShell / terminal window** and run:
```powershell
cd d:\CreativeVisibility\frontend
npm run dev
```

You should see:
```
  VITE v6.x.x  ready in 800ms
  ➜  Local:   http://localhost:5173/
```

**Leave this terminal open too.**

---

### 4.5 — Open the portal

Go to: **http://localhost:5173**

What you should see:
- Loading skeleton (pulsing glass cards) for ~1.5 seconds
- KPI tiles populate with real data from your Google Sheet
- City filter dropdown shows your actual cities (pulled live from `Daily_dump → Location`)
- Campaign type, funnel filters auto-populated from real data
- Creative cards render with real image thumbnails and YouTube video previews

> ℹ️ If the portal shows an error banner → check that the backend terminal has no errors and that your `.env` URL is correct.

---

## PART 5 — Google Ads Scheduled Report (One-Time Setup)

> This makes the pipeline fully automatic. After this, no manual steps ever again.

### 5.1 — Create the report in Google Ads

1. In Google Ads → **Reports → Predefined reports → Extensions → Ad performance** (or any asset-level report)
2. Make sure the report includes **at minimum** these columns:
   - `Day`
   - `Asset_status`
   - `Asset`
   - `Asset_type`
   - `Campaign`
   - `Location`
   - `Funnel`
   - `Campaign_Type`
   - `Ad_group`
   - `Impr`
   - `Interactions`
   - `Cost`
   - `Conversions`

> ⚠️ Column names in the report output must match the headers in your `Daily_dump` tab **exactly**. The script reads them by name.

---

### 5.2 — Schedule the report

1. Click **Schedule** (calendar icon)
2. Settings:
   - **Frequency:** Daily
   - **Time:** 12:30 AM IST
   - **Format:** Google Sheets
   - **Destination:** Your Google Sheet → **`Daily_dump`** tab
3. Click **Save**

---

### 5.3 — Verify after first run (next morning at 12:30 AM)

1. Open `Daily_dump` tab — new rows should be appended at the bottom
2. Run `healthCheck()` in Apps Script → confirm row count increased
3. Run `runTestFetch()` → confirm new data appears in the test log
4. Click 🔃 in the portal header to force-refresh the cache
5. Portal should show updated metrics

> ✅ After this point the pipeline is fully live. Every night Google Ads appends new rows to `Daily_dump`. Next morning the portal automatically shows fresh data when the cache expires (15 min TTL).

---

## PART 6 — Verify the Pipeline End-to-End

Run this quick sanity check in Apps Script (**Run → `runTestFetch`**):

```
Creatives found (IMAGE+VIDEO): 47     ← should be > 0
Cities: [Bangalore, Hyderabad, ...]   ← should match your real cities
Campaign types: [PMax, Dgen]          ← should match your real campaign types
Sample creative: { creative_id, creative_url, city, ... }  ← should have real values
```

Then open the portal and verify:
- [ ] KPI tiles show real numbers (not 0)
- [ ] City filter dropdown shows your actual cities
- [ ] Funnel filter shows TOFU / MOFU
- [ ] Creative cards show actual image thumbnails and video previews
- [ ] Changing date range updates the KPI tiles

---

## Final Checklist

### Google Sheet
- [ ] `Daily_dump` tab exists with correct column headers in row 1
- [ ] `Daily_dump` has at least some IMAGE or VIDEO rows (check Asset_type column)
- [ ] `query_controls` tab created (via `setupQueryControls()` helper)

### Apps Script
- [ ] Code pasted from `d:\CreativeVisibility\backend\apps_script\doGet.js`
- [ ] `setupQueryControls()` run — `query_controls` tab created
- [ ] `healthCheck()` run — `Daily_dump` and `query_controls` show ✅
- [ ] `runTestFetch()` — shows creatives > 0 with real cities
- [ ] Deployed as Web App (Execute as: Me / Anyone)
- [ ] URL tested in browser — returns `{ "status": "ok" }` with real data

### Backend
- [ ] `pip install -r requirements.txt` done
- [ ] `.env` created from `.env.template`
- [ ] `APPS_SCRIPT_URL` filled in with real deployment URL
- [ ] `uvicorn main:app --reload --port 8000` running
- [ ] `http://localhost:8000/health` returns `{ "status": "ok" }`

### Frontend
- [ ] `npm run dev` running in `frontend/`
- [ ] `http://localhost:5173` opens and shows portal
- [ ] KPI tiles show real numbers
- [ ] City filter dropdown shows your actual cities (not hardcoded values)

### Google Ads Scheduled Report
- [ ] Report created with all required columns
- [ ] Schedule: Daily at 12:30 AM IST → `Daily_dump` tab
- [ ] First run verified next morning — row count increased in `Daily_dump`
- [ ] `runTestFetch()` shows new data

---

## Quick Reference — Keep This Open While Setting Up

| What | Command / URL |
|---|---|
| Install deps | `cd d:\CreativeVisibility\backend` then `pip install -r requirements.txt` |
| Start backend | `cd d:\CreativeVisibility\backend` then `uvicorn main:app --reload --port 8000` |
| Start frontend | `cd d:\CreativeVisibility\frontend` then `npm run dev` |
| Backend health | http://localhost:8000/health |
| Backend API docs | http://localhost:8000/docs |
| Portal | http://localhost:5173 |
| Force sync | Click 🔃 in portal header — or POST http://localhost:8000/api/sync |
