# How to Run the Project (Start to Finish)

This document contains the exact commands to get both the backend and frontend running from scratch. You will need two separate terminal windows open at the root of the project (`D:\Saarthi-CV`).

> **Before you start:** this is now a multi-tenant portal. Beyond the `.env` files, you also need at least one account/channel configured in `backend/org_data/` (`org_structure.json`, `org_secrets.json`, `access_grants.json`) — otherwise the Home page will show no accounts and there's nothing to load. See `README.md` §1 for details.

## Terminal 1: Start the Backend (Python FastAPI)

Run these commands one by one:

```powershell
# 1. Create a virtual environment (only needed the first time)
python -m venv .venv

# 2. Activate the virtual environment
.\.venv\Scripts\activate

# 3. Go into the backend folder
cd backend

# 4. Install the required Python packages
pip install -r requirements.txt

# 5. Start the FastAPI server
uvicorn main:app --reload
```
*Your backend is now running at `http://localhost:8000`.*

---

## Terminal 2: Start the Frontend (React / Vite)

Open a **new** terminal window at the root of the project (`D:\Saarthi-CV`), and run these commands:

```powershell
# 1. Go into the frontend folder
cd frontend

# 2. Install the required Node packages (only needed the first time)
npm install

# 3. Start the Vite development server
npm run dev
```
*Your frontend portal is now running at `http://localhost:8080`. Open this link in your browser to view it!*
