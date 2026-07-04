# Running the CreativeVisibility Portal

This document provides step-by-step instructions to get both the Python FastAPI backend and the React Vite frontend up and running locally.

## Prerequisites
- **Node.js**: v20.19.0 or higher (v22 LTS recommended)
- **Python**: v3.10 or higher
- **Git**: (Optional) for version control

---

## 1. Environment Setup

Before running the services, you must create `.env` files for both the frontend and backend, **and** configure the per-channel org data.

### Backend `.env`
Create a `.env` file inside the `backend` folder:
```ini
# backend/.env
CACHE_TTL=900
ALLOWED_ORIGINS=http://localhost:8080,http://localhost:3000
API_HOST=0.0.0.0
API_PORT=8000
GOOGLE_CLIENT_ID=YOUR_GOOGLE_OAUTH_CLIENT_ID
ALLOWED_EMAILS=you@example.com
JWT_SECRET=generate-with-python-secrets-token_hex-32
```
**Note:** there is no `APPS_SCRIPT_URL` here anymore — Apps Script URLs are per-channel now, configured in `backend/org_data/org_secrets.json` (see step below), not in `.env`.

### Backend `org_data` — accounts, channels, and who can see them
This portal is multi-tenant: it can serve many accounts, each with multiple ad-platform channels (Google Ads, Meta Ads, ...). Three files under `backend/org_data/` control this, and are all read fresh on every request (no restart needed after editing):
- **`org_structure.json`** (committed) — your Clusters → Teams → Accounts → Channels. Each channel needs a `platform` (`"google_ads"` or `"meta_ads"`).
- **`org_secrets.json`** (**gitignored** — copy `org_secrets.example.json` to get the shape) — for each `channel_id`, its real deployed Apps Script Web App URL (and optionally `sheet_url`).
- **`access_grants.json`** (committed) — maps each email to the role(s)/scope(s) they can see. A `super_admin` grant (`{"role": "super_admin", "scope_type": "global", "scope_id": "*"}`) is the fastest way to see everything while testing.

You won't see any accounts on the Home page, or be able to load any dashboard, until at least one channel exists in `org_structure.json` with a matching entry in `org_secrets.json`, and your signed-in email has a grant covering it in `access_grants.json`.

### Frontend `.env.local`
Create a `.env.local` file inside the `frontend` folder:
```ini
# frontend/.env.local
VITE_API_URL=http://localhost:8000
VITE_GOOGLE_CLIENT_ID=YOUR_GOOGLE_OAUTH_CLIENT_ID
```

---

## 2. Running the Backend (FastAPI)

Open a new terminal at the root of the project (`D:\Saarthi-CV`) and run the following commands:

**Step A: Create and activate a virtual environment**
```powershell
# Create the virtual environment
python -m venv .venv

# Activate it (Windows)
.\.venv\Scripts\activate

# Activate it (Mac/Linux - if applicable)
# source .venv/bin/activate
```

**Step B: Install dependencies**
```powershell
# Navigate to the backend directory
cd backend

# Install the required Python packages
pip install -r requirements.txt
```

**Step C: Start the server**
```powershell
uvicorn main:app --reload
```
*The backend will now be running at `http://localhost:8000`. You can check the health endpoint at `http://localhost:8000/health` or view the API docs at `http://localhost:8000/docs`.*

---

## 3. Running the Frontend (React / Vite)

Open a **second** terminal window at the root of the project (`D:\Saarthi-CV`) and run:

**Step A: Navigate and install dependencies**
```powershell
# Navigate to the frontend directory
cd frontend

# Install node modules using npm (or you can use bun install if preferred)
npm install
```

**Step B: Start the development server**
```powershell
npm run dev
```
*The frontend will now be running, typically at `http://localhost:8080`. Open this URL in your browser to view the portal.*

---

## Summary of Running Services
To have the full portal working, you need **both terminals** running simultaneously:
1. **Terminal 1 (Backend):** Running `uvicorn main:app --reload`
2. **Terminal 2 (Frontend):** Running `npm run dev`

Enjoy using the CreativeVisibility Portal!
