# Smart Automated Timetable Generator

A production-ready timetable platform with a Flask API backend and React frontend for managing academic resources and generating conflict-aware class timetables. The system uses PostgreSQL (Neon) and provides complete admin workflows for faculty, subjects, divisions, scheduling configuration, reporting, and publishing.

## Highlights

- Centralized admin dashboard with operational metrics
- End-to-end management modules for faculty, subjects, divisions, and infrastructure
- Smart timetable generation with practical scheduling constraints
- Conflict visibility and resolution support
- React SPA dashboard and modules served by Flask
- Theme-aware responsive interface for desktop and mobile
- PostgreSQL-backed persistence (Neon compatible)

## Scheduling Constraints

The generator enforces core institutional rules while allocating lectures:

- No faculty overlap in the same day/time slot
- No back-to-back overload pattern for the same faculty
- Faculty availability windows are respected
- Maximum lectures per faculty per day are enforced
- Semester and program filters are respected (Odd/Even, UG/PG)

## Tech Stack

- Python 3.10+
- Flask
- React + Vite + Tailwind CSS
- PostgreSQL (Neon)
- psycopg (binary distribution)
- Jinja templates retained for legacy fallback during cutover

## Project Structure

```text
SmartTimetable/
├── app.py
├── requirements.txt
├── models/
│   └── database.py
├── scheduler/
│   └── timetable_algorithm.py
├── static/
│   ├── css/
│   │   └── style.css
│   └── js/
│       └── script.js
├── templates/
│   ├── base.html
│   ├── dashboard.html
│   ├── faculty.html
│   ├── subjects.html
│   ├── divisions.html
│   ├── generate.html
│   ├── timetable.html
│   ├── infrastructure.html
│   ├── reports.html
│   ├── conflicts.html
│   ├── settings.html
│   ├── profile.html
│   ├── published.html
│   ├── search.html
│   └── share.html
└── README.md
```

## Quick Start

### 1. Clone and Enter Project

```bash
git clone <your-repository-url>
cd SmartTimetable
```
├── .env

├── frontend/
│   ├── package.json
│   ├── vite.config.js
│   └── src/
### 2. Create Virtual Environment

```bash
python -m venv .venv
```

Windows PowerShell:

```bash
│   └── react/
.venv\Scripts\Activate.ps1
```

macOS/Linux:

```bash
source .venv/bin/activate
```

### 3. Install Dependencies

```bash
pip install -r requirements.txt
```

Install frontend dependencies:

```bash
cd frontend
npm install
cd ..
```

### 4. Configure Environment

Create a `.env` file in the project root:

```env
DATABASE_URL=postgresql://<user>:<password>@<host>/<database>?sslmode=require
REACT_APP_PRIMARY=true
```

`REACT_APP_PRIMARY` is optional and defaults to `true`. Set it to `false` to make legacy Jinja pages the default root again.

### 5. Build Frontend Assets

```bash
cd frontend
npm run build
cd ..
```

This generates production assets under `static/react` that Flask serves at `/app`.

### 6. Run the Application

```bash
python app.py
```

Open: http://127.0.0.1:5000

Primary UI path:

- `GET /` redirects to React app by default
- `GET /app` serves React SPA
- `GET /legacy` opens legacy dashboard

## Core Workflows

1. Add faculty, subjects, and divisions.
2. Set semester type and program filters.
3. Generate timetable from the generator page.
4. Review conflicts and operational reports.
5. Publish and share finalized schedules.

## Faculty Availability Format

Use comma-separated time windows in 12-hour AM/PM format:

```text
9:00 AM-12:00 PM, 2:00 PM-5:00 PM
```

## Selected API Routes

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

All API responses follow:

```json
{
	"success": true,
	"message": "",
	"data": {}
}
```

## Deployment Notes

- Keep `.env` out of version control.
- Use a managed PostgreSQL connection string in `DATABASE_URL`.
- For production, run behind a WSGI server such as Gunicorn or Waitress and configure reverse proxy/TLS at the platform edge.
