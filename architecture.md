# CreativeVisibility - System Architecture & Tech Stack

> **Note:** This document serves as the live architectural reference for the CreativeVisibility project. If any change is made to the architecture or tech stack, it MUST be updated instantly here.

## 1. High-Level Architecture
CreativeVisibility is a full-stack, performance marketing reporting dashboard. It follows a decoupled architecture, separating the client-side presentation layer from the data ingestion and caching APIs on the backend.
- **Frontend Layer:** A Single Page Application (SPA) responsible for visualization, complex tabular data interactions, and dashboard export (PDF).
- **Backend Layer:** A RESTful API that serves cached performance metrics, interfaces with Google Apps Script for live Google Sheets data, and reads bulk metrics from a local database.
- **Data Source Layer:** Data originates from Google Ads CSV dumps (loaded into SQLite) and Google Sheets metadata.

## 2. Technology Stack

### 2.1 Frontend
- **Core Framework:** React 19 + TypeScript
- **Build Tool:** Vite
- **Routing:** TanStack Router (`@tanstack/react-router`)
- **State Management & Data Fetching:** TanStack Query (`@tanstack/react-query`)
- **Styling:** TailwindCSS v4
- **UI Components:** Radix UI primitives (`@radix-ui/react-*`), Lucide React (icons)
- **Data Visualization:** Recharts
- **PDF Export Engine:** jsPDF, html2canvas, svg2pdf.js
- **Form Handling:** react-hook-form + Zod + @hookform/resolvers

### 2.2 Backend
- **Core Framework:** Python (FastAPI)
- **Server:** Uvicorn
- **Database:** SQLite (via standard library `sqlite3` in `db.py`)
- **HTTP Client:** HTTPX (for fetching external data from Google Apps Script)
- **Caching:** `cachetools` (for optimizing repeated metric calculations)
- **Authentication:** JWT (`pyjwt`)

### 2.3 Data & Integrations
- **Google Apps Script Connector:** Custom Apps Script web app providing read-only access to campaign metadata and structure from Google Sheets.
- **Database Architecture:** Local SQLite databases storing flat fact tables representing daily creative performance metrics.

## 3. Directory Structure Map
- `/frontend/` - Contains the React Vite SPA.
- `/backend/` - Contains the FastAPI application, database scripts, and Apps Script connectors.
- `/agents/` - Dedicated directory for custom agent definitions and prompt configurations (e.g., Google Ads Agent).
- `workflow.md` - The master specification and workflow log.
- `changes.md` - The historical session log and changelog tracker.
- `architecture.md` - This file.

## 4. Maintenance Rule
As mandated by the project's rules, any addition, upgrade, or replacement of libraries or architectural patterns MUST be immediately reflected in this document.
