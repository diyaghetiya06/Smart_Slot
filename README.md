# Smart Slot — Automated Timetable Generator SaaS

Smart Slot is a multi-tenant, SaaS-ready academic scheduling platform. It uses a constraint-aware algorithm to automatically assign faculty and rooms to classes, avoiding collisions while honoring faculty availability and maximum workload constraints.

**Tech Stack**: React + Vite (Frontend), Flask (Backend API), PostgreSQL (Database), Redis + RQ (Background Async Jobs).

---

## Features

- **Multi-Tenancy**: Secure organization isolation (`org_id` based). Create multiple distinct universities/schools in the same database.
- **JWT Authentication**: Secure login, registration, and session management using PyJWT and bcrypt.
- **Smart Scheduling**: 
  - Conflict-free resolution (no faculty overlap in the same day/time).
  - Room assignment logic matching lecture types (Lab, Class, Tutorial) to appropriate room types.
  - Honors faculty availability (e.g., "9:00 AM-12:00 PM") and daily workload limits.
- **Async Job Queue**: Timetable generation runs in the background via Redis/RQ ensuring the UI stays responsive (with a seamless fallback to synchronous generation if Redis is unavailable).
- **Publish & Share**: Real-time status tracking (Draft → Reviewed → Published) and secure, token-based public shareable links for timetables.
- **Bulk Import**: Quickly onboard faculty by uploading CSV or JSON files.

---

## 🚀 Quick Start Guide

### 1. Prerequisites
- **Python 3.9+**
- **Node.js 18+**
- **PostgreSQL Database** (e.g., Neon serverless Postgres)
- *(Optional but Recommended)* **Redis Server** on port 6379 (for background generation jobs).

### 2. Configure Environment

Create a `.env` file in the `backend/` directory:

```env
# backend/.env

# Your PostgreSQL Connection String
DATABASE_URL=postgresql://user:password@host/dbname?sslmode=require

# Security Secrets (Must be random, unguessable strings)
JWT_SECRET=your-super-secret-jwt-key
SECRET_KEY=your-flask-session-secret

# Redis Job Queue (Defaults to localhost:6379 if omitted)
REDIS_URL=redis://localhost:6379
```
*(See `backend/.env.example` for a template).*

### 3. Start the Backend

Open a terminal and run:

```bash
cd backend
python -m venv .venv

# Windows:
.venv\Scripts\activate
# Mac/Linux:
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Start the Flask API
python main.py
```
*The backend will automatically run migrations (`init_db`) on first start.*

*(Optional)* Start a background job worker in another terminal:
```bash
cd backend
redis-server
```

### 4. Start the Frontend

Open a new terminal and run:

```bash
cd frontend
npm install
npm run dev
```

### 5. Access the App
Go to **http://localhost:5173/register** in your browser to create your first organisation and admin account!

---

## Project Structure

```text
AUTOMATED TIMETABLE GENERATOR/
├── backend/
│   ├── app/
│   │   ├── models/database.py          # Database schema, connection pool, and queries
│   │   ├── services/
│   │   │   ├── timetable_algorithm.py  # Core constraint-solver logic
│   │   │   └── jobs.py                 # RQ background worker jobs
│   ├── main.py                         # Flask routes, Auth decorators, API endpoints
│   ├── requirements.txt
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── api/                        # API client wrappers (fetch)
│   │   ├── components/                 # Reusable UI elements (cards, badges, modals)
│   │   ├── context/AuthContext.jsx     # JWT state management
│   │   ├── pages/                      # Dashboard, Timetable, Publish, Settings, etc.
│   │   └── App.jsx                     # Routing & ProtectedRoute logic
│   ├── package.json
│   └── tailwind.config.js
└── README.md
```