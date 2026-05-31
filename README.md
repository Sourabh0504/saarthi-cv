# Running the CreativeVisibility Portal

This document provides step-by-step instructions to get both the Python FastAPI backend and the React Vite frontend up and running locally.

## Prerequisites
- **Node.js**: v20.19.0 or higher (v22 LTS recommended)
- **Python**: v3.10 or higher
- **Git**: (Optional) for version control.

---

## 1. Environment Setup

Before running the services, you must create `.env` files for both the frontend and backend.

### Backend `.env`
Create a `.env` file inside the `backend` folder:
```ini
# backend/.env
APPS_SCRIPT_URL=https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec
CACHE_TTL=900
```
*(Note: You will need to replace the URL with your actual deployed Apps Script Web App URL from the Google Sheet.)*

### Frontend `.env.local`
Create a `.env.local` file inside the `frontend` folder:
```ini
# frontend/.env.local
VITE_API_URL=http://localhost:8000
```

---

## 2. Running the Backend (FastAPI)

Open a new terminal at the root of the project (`d:\CreativeVisibility`) and run the following commands:

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

Open a **second** terminal window at the root of the project (`d:\CreativeVisibility`) and run:

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
*The frontend will now be running, typically at `http://localhost:5173`. Open this URL in your browser to view the portal.*

---

## Summary of Running Services
To have the full portal working, you need **both terminals** running simultaneously:
1. **Terminal 1 (Backend):** Running `uvicorn main:app --reload`
2. **Terminal 2 (Frontend):** Running `npm run dev`

Enjoy using the CreativeVisibility Portal!
