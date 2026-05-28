# How to Run the Project (Start to Finish)

This document contains the exact commands to get both the backend and frontend running from scratch. You will need two separate terminal windows open at the root of the project (`d:\CreativeVisibility`).

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

Open a **new** terminal window at the root of the project (`d:\CreativeVisibility`), and run these commands:

```powershell
# 1. Go into the frontend folder
cd frontend

# 2. Install the required Node packages (only needed the first time)
npm install

# 3. Start the Vite development server
npm run dev
```
*Your frontend portal is now running at `http://localhost:5173`. Open this link in your browser to view it!*
