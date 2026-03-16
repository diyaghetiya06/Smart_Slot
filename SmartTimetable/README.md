# Smart Automated Timetable Generator

A production-ready Flask web application for managing academic resources and generating conflict-aware class timetables. The system uses PostgreSQL (Neon) and provides a modern UI for administrators to manage faculty, subjects, divisions, scheduling configuration, and publishing workflows.

## Highlights

- Centralized admin dashboard with operational metrics
- End-to-end management modules for faculty, subjects, divisions, and infrastructure
- Smart timetable generation with practical scheduling constraints
- Conflict visibility and resolution support
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
- PostgreSQL (Neon)
- psycopg (binary distribution)
- Jinja2 templates + custom CSS/JS

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

### 2. Create Virtual Environment

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

### 3. Install Dependencies

```bash
pip install -r requirements.txt
```

### 4. Configure Environment

Create a `.env` file in the project root:

```env
DATABASE_URL=postgresql://<user>:<password>@<host>/<database>?sslmode=require
```

### 5. Run the Application

```bash
python app.py
```

Open: http://127.0.0.1:5000

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

## Selected Routes

- `GET /`
- `GET /faculty`
- `POST /add_faculty`
- `GET /subjects`
- `POST /add_subject`
- `GET /divisions`
- `POST /add_division`
- `GET /generate`
- `POST /generate_timetable`
- `GET /view_timetable`

## Deployment Notes

- Keep `.env` out of version control.
- Use a managed PostgreSQL connection string in `DATABASE_URL`.
- For production, run behind a WSGI server such as Gunicorn or Waitress and configure reverse proxy/TLS at the platform edge.
