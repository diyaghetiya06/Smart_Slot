# Smart Automated Timetable Generator

A full-stack timetable platform with a React frontend and Flask backend, designed for conflict-aware academic scheduling and operational management.

## Architecture

- Frontend: React + Vite + Tailwind CSS
- Backend: Flask API (Python)
- Database: PostgreSQL (Neon supported)

## Current Project Structure

```text
AUTOMATED TIMETABLE GENERATOR/
├── backend/
│   ├── app/
│   │   ├── config/
│   │   │   ├── settings.py
│   │   │   └── __init__.py
│   │   ├── models/
│   │   │   ├── database.py
│   │   │   └── __init__.py
│   │   ├── routes/
│   │   │   └── __init__.py
│   │   ├── schemas/
│   │   │   └── __init__.py
│   │   ├── services/
│   │   │   ├── timetable_algorithm.py
│   │   │   └── __init__.py
│   │   ├── utils/
│   │   │   └── __init__.py
│   │   └── __init__.py
│   ├── static/
│   │   └── react/
│   ├── main.py
│   ├── requirements.txt
│   ├── .env
│   └── README.md
├── frontend/
│   ├── public/
│   ├── src/
│   │   ├── api/
│   │   ├── components/
│   │   ├── hooks/
│   │   ├── pages/
│   │   ├── styles/
│   │   ├── App.jsx
│   │   └── main.jsx
│   ├── index.html
│   ├── package.json
│   ├── vite.config.js
│   ├── tailwind.config.js
│   └── postcss.config.js
└── README.md
```

## Features

- Faculty, subjects, divisions, and infrastructure management
- Constraint-aware timetable generation
- Conflict analysis and suggestion flow
- Reports, publication status, and share links
- REST-style API contracts with a consistent response format

## Scheduling Constraints Enforced

- No faculty overlap in the same day/time slot
- Faculty availability windows honored
- Maximum lectures per faculty per day honored
- Semester and program filtering (Odd/Even, UG/PG)

## Quick Start

### 1. Clone Repository

```bash
git clone <your-repository-url>
cd "AUTOMATED TIMETABLE GENERATOR"
```

### 2. Create and Activate Python Environment

```bash
python -m venv .venv
```

Windows PowerShell:

```bash
.venv\Scripts\Activate.ps1
```

macOS/Linux:

```bash
source .venv/bin/activate
```

### 3. Install Backend Dependencies

```bash
pip install -r backend/requirements.txt
```

### 4. Install Frontend Dependencies

```bash
cd frontend
npm install
cd ..
```

### 5. Configure Environment

Create file `backend/.env`:

```env
DATABASE_URL=postgresql://<user>:<password>@<host>/<database>?sslmode=require
```

### 6. Build Frontend for Backend Serving

```bash
cd frontend
npm run build
cd ..
```

This outputs assets to `backend/static/react`.

### 7. Run Backend

```bash
python backend/main.py
```

Open application at:

- `http://127.0.0.1:5000/`

## API Response Contract

All API responses use:

```json
{
  "success": true,
  "message": "",
  "data": {}
}
```

## Selected API Endpoints

- `GET /api/dashboard`
- `GET|POST|PUT|DELETE /api/faculty`
- `GET|POST|PUT|DELETE /api/subjects`
- `GET|POST|PUT|DELETE /api/divisions`
- `GET|PUT /api/settings`
- `GET|PUT /api/profile`
- `GET|POST /api/infrastructure`
- `GET /api/reports`
- `GET /api/conflicts`
- `POST /api/conflicts/apply-fix`
- `GET /api/published`
- `GET /api/timetable`
- `GET /api/generate/options`
- `POST /api/generate`
- `GET /api/search`
- `GET /api/share/<generation_id>`

## Deployment Notes

- Keep `backend/.env` out of version control.
- Build frontend before backend deployment (`npm run build`).
- Serve Flask using a production WSGI server (for example Gunicorn/Waitress) behind reverse proxy and TLS.
