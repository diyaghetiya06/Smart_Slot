from __future__ import annotations

import logging
import os
import re
import secrets
import uuid
from collections import Counter
from datetime import datetime, timezone, timedelta
from functools import wraps
from pathlib import Path

from flask import Flask, g, jsonify, redirect, request, send_from_directory, url_for

try:
    from dotenv import load_dotenv
except ModuleNotFoundError:
    def load_dotenv(*_args, **_kwargs):
        return False

try:
    import jwt as _jwt  # PyJWT
    _HAS_JWT = True
except ImportError:
    _HAS_JWT = False
    logging.warning("PyJWT not installed — auth will be disabled.")

try:
    import bcrypt as _bcrypt
    _HAS_BCRYPT = True
except ImportError:
    _HAS_BCRYPT = False
    logging.warning("bcrypt not installed — password hashing will be disabled.")

try:
    import redis as _redis_lib
    from rq import Queue as _RQQueue
    _HAS_RQ = True
except Exception:
    _HAS_RQ = False
    _redis_lib = None  # type: ignore
    _RQQueue = None  # type: ignore

from app.models.database import (
    add_division,
    add_faculty,
    add_room,
    add_subject,
    count_subjects_for_faculty,
    create_organisation,
    create_share_token,
    create_user,
    delete_division,
    delete_faculty,
    delete_generation,
    delete_room,
    delete_subject,
    division_has_timetable,
    faculty_exists,
    get_all_generation_ids,
    get_conflict_data,
    get_connection,
    get_dashboard_stats,
    get_divisions,
    get_division_by_id,
    get_equipment_filters,
    get_faculty,
    get_faculty_by_id,
    get_generation_summaries,
    get_latest_generation_id,
    get_profile,
    get_report_data,
    get_rooms,
    get_settings,
    get_share_token_row,
    get_subjects,
    get_subject_by_id,
    get_timetable_for_generation,
    get_user_by_email,
    get_user_by_id,
    init_db,
    migrate_db,
    org_slug_exists,
    save_timetable_records,
    search_entities,
    update_division,
    update_faculty,
    update_generation_status,
    update_profile,
    update_settings,
    update_room,
    update_subject,
)
from app.services.timetable_algorithm import (
    DEFAULT_DAYS,
    DEFAULT_TIME_SLOTS,
    generate_timetable,
    normalize_availability_text,
)

# ---------------------------------------------------------------------------
# App setup
# ---------------------------------------------------------------------------

BASE_DIR = Path(__file__).resolve().parent
REACT_DIST_DIR = BASE_DIR / "static" / "react"
load_dotenv(BASE_DIR / ".env")

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

app = Flask(__name__)
app.config["SECRET_KEY"] = os.environ.get("SECRET_KEY", "dev-only-secret-change-in-production")

JWT_SECRET = os.environ.get("JWT_SECRET", "change-me-in-production")
JWT_ALGORITHM = "HS256"
JWT_ACCESS_EXPIRY = timedelta(hours=24)
JWT_REFRESH_EXPIRY = timedelta(days=30)

# ---------------------------------------------------------------------------
# RQ / Redis setup (optional)
# ---------------------------------------------------------------------------
_rq_queue: "_RQQueue | None" = None  # type: ignore
_job_results: dict = {}  # in-process job result store for sync fallback

if _HAS_RQ:
    try:
        _redis_url = os.environ.get("REDIS_URL", "redis://localhost:6379")
        _redis_conn = _redis_lib.from_url(_redis_url)  # type: ignore
        _redis_conn.ping()
        _rq_queue = _RQQueue(connection=_redis_conn)  # type: ignore
        logger.info("RQ connected to Redis at %s", _redis_url)
    except Exception as exc:
        logger.warning("Redis unavailable (%s) — falling back to sync generation.", exc)
        _rq_queue = None

init_db()
migrate_db()

# ---------------------------------------------------------------------------
# Security headers (added to every response)
# ---------------------------------------------------------------------------

@app.after_request
def add_security_headers(response):
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "SAMEORIGIN"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=()"
    # Only send HSTS in production (not on localhost)
    if not app.debug:
        response.headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains"
    return response

# ---------------------------------------------------------------------------
# Global JSON error handlers
# ---------------------------------------------------------------------------

@app.route("/api/health")
def api_health():
    from app.models.database import get_connection
    try:
        with get_connection() as conn:
            conn.execute("SELECT 1")
    except Exception as e:
        logger.error(f"Health check failed DB ping: {e}")
        return _api_error("Database connection failed", 503)
        
    return jsonify({
        "status": "ok", 
        "database": "connected",
        "message": "Backend is running"
    })

def _json_error(status: int, message: str):
    return jsonify({"ok": False, "error": message}), status

@app.errorhandler(400)
def bad_request(e):
    return _json_error(400, str(e.description) if hasattr(e, "description") else "Bad request")

@app.errorhandler(401)
def unauthorized(e):
    return _json_error(401, "Authentication required")

@app.errorhandler(403)
def forbidden(e):
    return _json_error(403, "You do not have permission to access this resource")

@app.errorhandler(404)
def not_found(e):
    if request.path.startswith('/api/'):
        return _json_error(404, "Resource not found")
    # For non-API routes, let the frontend (React Router) handle the 404 view
    return send_from_directory(app.static_folder, "index.html")

@app.errorhandler(405)
def method_not_allowed(e):
    return _json_error(405, "Method not allowed")

@app.errorhandler(429)
def too_many_requests(e):
    return _json_error(429, "Too many requests — please slow down")

@app.errorhandler(500)
def internal_error(e):
    logger.exception("Unhandled 500 error: %s", e)
    return _json_error(500, "An unexpected server error occurred")

# ---------------------------------------------------------------------------

def _hash_password(plain: str) -> str:
    if not _HAS_BCRYPT:
        raise RuntimeError("bcrypt not installed")
    return _bcrypt.hashpw(plain.encode(), _bcrypt.gensalt()).decode()

def _check_password(plain: str, hashed: str) -> bool:
    if not _HAS_BCRYPT:
        return False
    return _bcrypt.checkpw(plain.encode(), hashed.encode())

def _make_token(payload: dict, expiry: timedelta) -> str:
    if not _HAS_JWT:
        raise RuntimeError("PyJWT not installed")
    data = {
        **payload,
        "exp": datetime.now(tz=timezone.utc) + expiry,
        "iat": datetime.now(tz=timezone.utc),
    }
    return _jwt.encode(data, JWT_SECRET, algorithm=JWT_ALGORITHM)

def _decode_token(token: str) -> dict:
    if not _HAS_JWT:
        raise RuntimeError("PyJWT not installed")
    return _jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])

def _slugify(text: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    base = slug[:40]
    candidate = base
    while org_slug_exists(candidate):
        candidate = f"{base}-{secrets.token_hex(3)}"
    return candidate

# ---------------------------------------------------------------------------
# Auth decorators
# ---------------------------------------------------------------------------

def _api_success(data=None, message: str = ""):
    return jsonify({"success": True, "message": message, "data": data})

def _api_error(message: str, status_code: int = 400):
    return jsonify({"success": False, "message": message}), status_code

def handle_route_errors(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        try:
            return f(*args, **kwargs)
        except ValueError as exc:
            return _api_error(str(exc), 400)
        except Exception as exc:
            logger.error("Unhandled error in %s: %s", request.path, exc, exc_info=True)
            return _api_error("An unexpected error occurred. Please try again.", 500)
    return decorated

def require_auth(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if not _HAS_JWT or not _HAS_BCRYPT:
            g.org_id = 1
            g.current_user = {"id": 0, "org_id": 1, "role": "admin", "email": ""}
            return f(*args, **kwargs)

        auth_header = request.headers.get("Authorization", "")
        if not auth_header.startswith("Bearer "):
            return _api_error("Missing or invalid Authorization header.", 401)
        token = auth_header[7:]
        try:
            payload = _decode_token(token)
        except _jwt.ExpiredSignatureError:
            return _api_error("Access token has expired.", 401)
        except _jwt.InvalidTokenError:
            return _api_error("Invalid access token.", 401)

        user = get_user_by_id(int(payload.get("sub", 0)))
        if not user:
            return _api_error("User not found or deactivated.", 401)

        g.current_user = user
        g.org_id = int(user["org_id"])
        return f(*args, **kwargs)

    return decorated

def require_role(*roles: str):
    def decorator(f):
        @wraps(f)
        @require_auth
        def decorated(*args, **kwargs):
            user_role = getattr(g, "current_user", {}).get("role", "")
            if user_role not in roles:
                return _api_error(f"Requires one of roles: {', '.join(roles)}.", 403)
            return f(*args, **kwargs)
        return decorated
    return decorator

# ---------------------------------------------------------------------------
# Utility
# ---------------------------------------------------------------------------

def _semester_matches_type(semester: int, semester_type: str) -> bool:
    if semester_type == "odd":
        return semester % 2 == 1
    return semester % 2 == 0

def _is_teaching_slot(slot_label: str) -> bool:
    label = slot_label.lower()
    return "lunch" not in label and "break" not in label

def _get_schedule_settings() -> tuple[dict, list[str], list[str]]:
    settings_data = get_settings() or {}
    days = settings_data.get("working_days") or DEFAULT_DAYS
    time_slots = settings_data.get("time_slots") or DEFAULT_TIME_SLOTS
    return settings_data, list(days), list(time_slots)

def _teaching_slot_count(time_slots: list[str]) -> int:
    return sum(1 for slot in time_slots if _is_teaching_slot(slot))

def _serialize_value(value):
    if isinstance(value, datetime):
        return value.isoformat()
    return value

def _serialize_rows(rows) -> list[dict]:
    return [{k: _serialize_value(v) for k, v in dict(row).items()} for row in rows]

def _to_bool(value) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.strip().lower() in {"1", "true", "yes", "on"}
    return bool(value)



def _get_reports_context(
    org_id: int, generation_id: str | None, days: list[str], time_slots: list[str]
) -> dict:
    day_counts: dict[str, int] = {day: 0 for day in days}
    total_lectures = 0
    utilized_faculty = 0
    student_free_slots = 0
    conflict_alerts: list[str] = []

    if generation_id:
        with get_connection() as conn:
            rows = conn.execute(
                """
                SELECT day, faculty_id
                FROM timetable
                WHERE generation_id = %s AND org_id = %s
                """,
                (generation_id, org_id),
            ).fetchall()
            divisions_count = conn.execute(
                """
                SELECT COUNT(DISTINCT division_id) AS c
                FROM timetable
                WHERE generation_id = %s AND org_id = %s
                """,
                (generation_id, org_id),
            ).fetchone()["c"]

        total_lectures = len(rows)
        for row in rows:
            day_counts[row["day"]] = day_counts.get(row["day"], 0) + 1

        faculty_ids = {row["faculty_id"] for row in rows}
        faculty_total = max(len(get_faculty(org_id)), 1)
        utilized_faculty = round((len(faculty_ids) / faculty_total) * 100)

        all_available_slots = divisions_count * len(days) * _teaching_slot_count(time_slots)
        student_free_slots = max(all_available_slots - total_lectures, 0)

    if not generation_id:
        conflict_alerts.append(
            "No generation found yet. Generate a timetable to analyze conflicts."
        )

    return {
        "generation_id": generation_id,
        "total_lectures": total_lectures,
        "faculty_utilization": utilized_faculty,
        "student_free_slots": student_free_slots,
        "day_counts": day_counts,
        "peak_day": max(day_counts, key=day_counts.get) if day_counts else "-",
        "conflict_alerts": conflict_alerts,
    }


def _get_conflict_context(
    org_id: int, generation_id: str | None, days: list[str], time_slots: list[str]
) -> dict:
    if not generation_id:
        return {
            "generation_id": None,
            "has_conflict": False,
            "message": "No generation selected yet.",
            "left_item": None,
            "right_item": None,
            "suggestions": [],
            "timeline": [],
        }

    with get_connection() as conn:
        rows = conn.execute(
            """
            SELECT t.id, t.day, t.time_slot, t.slot_index,
                   t.subject_name, t.faculty_name, t.faculty_id,
                   t.division_id, d.name AS division_name
            FROM timetable t
            JOIN divisions d ON d.id = t.division_id
            WHERE t.generation_id = %s AND t.org_id = %s
            ORDER BY t.day, t.slot_index
            """,
            (generation_id, org_id),
        ).fetchall()

    slot_counts = Counter(
        (row["day"], row["time_slot"], row["faculty_id"]) for row in rows
    )
    collision = next((key for key, count in slot_counts.items() if count > 1), None)

    if not collision:
        timeline = [
            {"label": slot, "is_conflict": False}
            for slot in time_slots
            if _is_teaching_slot(slot)
        ]
        return {
            "generation_id": generation_id,
            "has_conflict": False,
            "message": "No direct slot conflicts found in the latest generated timetable.",
            "left_item": None,
            "right_item": None,
            "suggestions": [],
            "timeline": timeline,
        }

    clashing_rows = [
        r for r in rows if (r["day"], r["time_slot"], r["faculty_id"]) == collision
    ][:2]
    left_item = clashing_rows[0] if clashing_rows else None
    right_item = clashing_rows[1] if len(clashing_rows) > 1 else None

    conflict_day, _, conflict_faculty = collision
    teaching_indexes = [i for i, slot in enumerate(time_slots) if _is_teaching_slot(slot)]
    busy_slots = {
        row["slot_index"]
        for row in rows
        if row["day"] == conflict_day and row["faculty_id"] == conflict_faculty
    }
    available_slots = [i for i in teaching_indexes if i not in busy_slots]

    suggestions = []
    if available_slots:
        base_probability = min(96, 84 + (len(available_slots) * 3))
        for index, slot in enumerate(available_slots[:3]):
            suggestions.append(
                {
                    "slot": time_slots[slot],
                    "score": "Low" if index else "None",
                    "probability": f"{max(base_probability - (index * 4), 72)}%",
                }
            )

    timeline = [
        {"label": slot, "is_conflict": slot == collision[1]}
        for slot in time_slots
        if _is_teaching_slot(slot)
    ]

    return {
        "generation_id": generation_id,
        "has_conflict": True,
        "message": f"Conflict at {collision[0]} {collision[1]}",
        "left_item": left_item,
        "right_item": right_item,
        "suggestions": suggestions,
        "timeline": timeline,
    }


def _get_publish_context(org_id: int, generation_id: str | None) -> dict:
    if not generation_id:
        return {
            "generation_id": None,
            "published": False,
            "divisions": 0,
            "faculty": 0,
            "slots": 0,
            "status": "draft",
            "timeline": ["Generated", "Validated", "Conflicts Resolved", "Published"],
        }

    with get_connection() as conn:
        stats = conn.execute(
            """
            SELECT
                COUNT(*) AS slots,
                COUNT(DISTINCT division_id) AS divisions,
                COUNT(DISTINCT faculty_id) AS faculty,
                MAX(status) AS status
            FROM timetable
            WHERE generation_id = %s AND org_id = %s
            """,
            (generation_id, org_id),
        ).fetchone()

    status = stats["status"] if stats and stats.get("status") else "draft"
    return {
        "generation_id": generation_id,
        "published": status == "published",
        "divisions": int(stats["divisions"] if stats and stats.get("divisions") else 0),
        "faculty": int(stats["faculty"] if stats and stats.get("faculty") else 0),
        "slots": int(stats["slots"] if stats and stats.get("slots") else 0),
        "status": status or "draft",
        "timeline": ["Generated", "Validated", "Conflicts Resolved", "Published"],
    }


# ===========================================================================
# AUTH ROUTES  (public — no @require_auth)
# ===========================================================================

@app.post("/api/auth/register")
@handle_route_errors
def api_auth_register():
    if not _HAS_JWT or not _HAS_BCRYPT:
        return _api_error("Auth libraries (PyJWT, bcrypt) are not installed.", 501)

    payload = request.get_json(silent=True) or {}
    org_name = str(payload.get("org_name", "")).strip()
    email = str(payload.get("email", "")).strip().lower()
    password = str(payload.get("password", "")).strip()
    full_name = str(payload.get("full_name", "")).strip()

    if not org_name or not email or not password:
        return _api_error("org_name, email, and password are required.")
    if len(password) < 6:
        return _api_error("Password must be at least 6 characters.")
    if get_user_by_email(email):
        return _api_error("A user with that email already exists.")

    slug = _slugify(org_name)
    org_id = create_organisation(org_name, slug)
    pw_hash = _hash_password(password)
    user_id = create_user(org_id, email, pw_hash, full_name or email, role="admin")

    access_token = _make_token(
        {"sub": str(user_id), "org_id": org_id, "role": "admin"},
        JWT_ACCESS_EXPIRY,
    )
    refresh_token = _make_token(
        {"sub": str(user_id), "org_id": org_id, "type": "refresh"},
        JWT_REFRESH_EXPIRY,
    )

    logger.info("New org registered: %s (id=%d)", org_name, org_id)
    return _api_success(
        {
            "access_token": access_token,
            "refresh_token": refresh_token,
            "user": {"id": user_id, "email": email, "org_id": org_id, "role": "admin", "full_name": full_name},
        },
        "Registration successful.",
    )


@app.post("/api/auth/login")
@handle_route_errors
def api_auth_login():
    if not _HAS_JWT or not _HAS_BCRYPT:
        return _api_error("Auth libraries (PyJWT, bcrypt) are not installed.", 501)

    payload = request.get_json(silent=True) or {}
    email = str(payload.get("email", "")).strip().lower()
    password = str(payload.get("password", "")).strip()

    if not email or not password:
        return _api_error("email and password are required.")

    user = get_user_by_email(email)
    if not user or not _check_password(password, user["password_hash"]):
        return _api_error("Invalid email or password.", 401)

    access_token = _make_token(
        {"sub": str(user["id"]), "org_id": user["org_id"], "role": user["role"]},
        JWT_ACCESS_EXPIRY,
    )
    refresh_token = _make_token(
        {"sub": str(user["id"]), "org_id": user["org_id"], "type": "refresh"},
        JWT_REFRESH_EXPIRY,
    )

    logger.info("User logged in: %s", email)
    return _api_success(
        {
            "access_token": access_token,
            "refresh_token": refresh_token,
            "user": {
                "id": user["id"],
                "email": user["email"],
                "org_id": user["org_id"],
                "role": user["role"],
                "full_name": user.get("full_name"),
            },
        },
        "Login successful.",
    )


@app.post("/api/auth/refresh")
@handle_route_errors
def api_auth_refresh():
    if not _HAS_JWT:
        return _api_error("PyJWT not installed.", 501)

    payload = request.get_json(silent=True) or {}
    token = str(payload.get("refresh_token", "")).strip()
    if not token:
        return _api_error("refresh_token is required.")

    try:
        data = _decode_token(token)
    except _jwt.ExpiredSignatureError:
        return _api_error("Refresh token has expired. Please log in again.", 401)
    except _jwt.InvalidTokenError:
        return _api_error("Invalid refresh token.", 401)

    if data.get("type") != "refresh":
        return _api_error("Not a refresh token.", 401)

    user = get_user_by_id(int(data.get("sub", 0)))
    if not user:
        return _api_error("User not found.", 401)

    access_token = _make_token(
        {"sub": str(user["id"]), "org_id": user["org_id"], "role": user["role"]},
        JWT_ACCESS_EXPIRY,
    )
    return _api_success({"access_token": access_token})


@app.get("/api/auth/me")
@handle_route_errors
@require_auth
def api_auth_me():
    u = g.current_user
    return _api_success(
        {
            "id": u["id"],
            "email": u["email"],
            "org_id": u["org_id"],
            "role": u["role"],
            "full_name": u.get("full_name"),
        }
    )


# ===========================================================================
# DASHBOARD
# ===========================================================================

@app.get("/api/dashboard")
@handle_route_errors
@require_auth
def api_dashboard():
    org_id = g.org_id
    stats = get_dashboard_stats(org_id)
    latest_generation_id = get_latest_generation_id(org_id)
    recent = _serialize_rows(get_generation_summaries(org_id, limit=5))
    return _api_success(
        {
            "faculty": int(stats.get("faculty", 0)),
            "subjects": int(stats.get("subjects", 0)),
            "divisions": int(stats.get("divisions", 0)),
            "timetables": int(stats.get("timetables", 0)),
            "latest_generation_id": latest_generation_id,
            "recent_generations": recent,
        }
    )


# ===========================================================================
# FACULTY
# ===========================================================================

@app.get("/api/faculty")
@handle_route_errors
@require_auth
def api_get_faculty():
    faculty_rows = _serialize_rows(get_faculty(g.org_id))
    return _api_success(faculty_rows)


@app.post("/api/faculty")
@handle_route_errors
@require_role("admin")
def api_create_faculty():
    org_id = g.org_id
    payload = request.get_json(silent=True) or {}
    name = str(payload.get("name", "")).strip()
    subject = str(payload.get("subject", "")).strip()
    available_time = str(payload.get("available_time", "")).strip()
    max_lectures_per_day = payload.get("max_lectures_per_day", "")

    if not all([name, subject, available_time, str(max_lectures_per_day).strip()]):
        return _api_error("Please fill all required faculty fields.")

    try:
        max_count = int(max_lectures_per_day)
        if max_count < 1:
            raise ValueError
    except ValueError:
        return _api_error("Max lectures per day must be a number greater than or equal to 1.")

    try:
        normalized_time = normalize_availability_text(available_time)
    except ValueError:
        return _api_error(
            "Please use availability format like 9:00 AM-12:00 PM, 2:00 PM-5:00 PM."
        )

    add_faculty(org_id, name, subject, normalized_time, max_count)
    return _api_success(_serialize_rows(get_faculty(org_id)), "Faculty added successfully.")


@app.put("/api/faculty/<int:faculty_id>")
@handle_route_errors
@require_role("admin")
def api_update_faculty(faculty_id: int):
    org_id = g.org_id
    payload = request.get_json(silent=True) or {}
    name = str(payload.get("name", "")).strip()
    subject = str(payload.get("subject", "")).strip()
    available_time = str(payload.get("available_time", "")).strip()
    max_lectures_per_day = payload.get("max_lectures_per_day", "")

    if not all([name, subject, available_time, str(max_lectures_per_day).strip()]):
        return _api_error("Please fill all required faculty fields.")

    try:
        max_count = int(max_lectures_per_day)
        if max_count < 1:
            raise ValueError
    except ValueError:
        return _api_error("Max lectures per day must be a number greater than or equal to 1.")

    try:
        normalized_time = normalize_availability_text(available_time)
    except ValueError:
        return _api_error(
            "Please use availability format like 9:00 AM-12:00 PM, 2:00 PM-5:00 PM."
        )

    from app.models.database import faculty_exists
    if not faculty_exists(org_id, faculty_id):
        return _api_error("Faculty not found.", 404)

    update_faculty(org_id, faculty_id, name, subject, normalized_time, max_count)
    return _api_success(_serialize_rows(get_faculty(org_id)), "Faculty updated successfully.")


@app.delete("/api/faculty/<int:faculty_id>")
@handle_route_errors
@require_role("admin")
def api_delete_faculty(faculty_id: int):
    org_id = g.org_id
    if not faculty_exists(org_id, faculty_id):
        return _api_error("Faculty not found.", 404)
    if count_subjects_for_faculty(org_id, faculty_id) > 0:
        return _api_error("Cannot delete faculty assigned to subjects. Reassign subjects first.", 400)
    delete_faculty(org_id, faculty_id)
    return _api_success(_serialize_rows(get_faculty(org_id)), "Faculty deleted successfully.")


# ===========================================================================
# SUBJECTS
# ===========================================================================

@app.get("/api/subjects")
@handle_route_errors
@require_auth
def api_get_subjects():
    return _api_success(_serialize_rows(get_subjects(g.org_id)))


@app.post("/api/subjects")
@handle_route_errors
@require_role("admin")
def api_create_subject():
    org_id = g.org_id
    payload = request.get_json(silent=True) or {}
    name = str(payload.get("name", "")).strip()
    subject_type = str(payload.get("subject_type", "")).strip()
    assigned_faculty_id = payload.get("assigned_faculty_id", "")

    if not all([name, subject_type, str(assigned_faculty_id).strip()]):
        return _api_error("Please fill all required subject fields.")

    if subject_type not in {"Class", "Lab", "Tutorial"}:
        return _api_error("Subject type must be Class, Lab, or Tutorial.", 400)

    try:
        faculty_id = int(assigned_faculty_id)
    except ValueError:
        return _api_error("Please select a valid faculty member.")

    if not faculty_exists(org_id, faculty_id):
        return _api_error("Selected faculty was not found. Please choose another one.")

    add_subject(org_id, name, subject_type, faculty_id)
    return _api_success(_serialize_rows(get_subjects(org_id)), "Subject added successfully.")


@app.put("/api/subjects/<int:subject_id>")
@handle_route_errors
@require_role("admin")
def api_update_subject(subject_id: int):
    org_id = g.org_id
    payload = request.get_json(silent=True) or {}
    name = str(payload.get("name", "")).strip()
    subject_type = str(payload.get("subject_type", "")).strip()
    assigned_faculty_id = payload.get("assigned_faculty_id", "")

    if not all([name, subject_type, str(assigned_faculty_id).strip()]):
        return _api_error("Please fill all required subject fields.")

    if subject_type not in {"Class", "Lab", "Tutorial"}:
        return _api_error("Subject type must be Class, Lab, or Tutorial.", 400)

    try:
        faculty_id = int(assigned_faculty_id)
    except ValueError:
        return _api_error("Please select a valid faculty member.")

    if not faculty_exists(org_id, faculty_id):
        return _api_error("Selected faculty was not found. Please choose another one.")

    from app.models.database import subject_exists
    if not subject_exists(org_id, subject_id):
        return _api_error("Subject not found.", 404)

    update_subject(org_id, subject_id, name, subject_type, faculty_id)
    return _api_success(_serialize_rows(get_subjects(org_id)), "Subject updated successfully.")


@app.delete("/api/subjects/<int:subject_id>")
@handle_route_errors
@require_role("admin")
def api_delete_subject(subject_id: int):
    org_id = g.org_id
    from app.models.database import subject_exists
    if not subject_exists(org_id, subject_id):
        return _api_error("Subject not found.", 404)
    delete_subject(org_id, subject_id)
    return _api_success(_serialize_rows(get_subjects(org_id)), "Subject deleted successfully.")


# ===========================================================================
# DIVISIONS
# ===========================================================================

@app.get("/api/divisions")
@handle_route_errors
@require_auth
def api_get_divisions():
    return _api_success(_serialize_rows(get_divisions(g.org_id)))


@app.post("/api/divisions")
@handle_route_errors
@require_role("admin")
def api_create_division():
    org_id = g.org_id
    payload = request.get_json(silent=True) or {}
    name = str(payload.get("name", "")).strip()
    semester = payload.get("semester", "")
    program = str(payload.get("program", "")).strip().upper()

    if not all([name, str(semester).strip(), program]):
        return _api_error("Please fill all required division fields.")

    if program not in {"UG", "PG"}:
        return _api_error("Program must be UG or PG.", 400)

    try:
        semester_int = int(semester)
    except ValueError:
        return _api_error("Semester must be a valid number.")

    add_division(org_id, name, semester_int, program)
    return _api_success(_serialize_rows(get_divisions(org_id)), "Division added successfully.")


@app.put("/api/divisions/<int:division_id>")
@handle_route_errors
@require_role("admin")
def api_update_division(division_id: int):
    org_id = g.org_id
    payload = request.get_json(silent=True) or {}
    name = str(payload.get("name", "")).strip()
    semester = payload.get("semester", "")
    program = str(payload.get("program", "")).strip().upper()

    if not all([name, str(semester).strip(), program]):
        return _api_error("Please fill all required division fields.")

    try:
        semester_int = int(semester)
    except ValueError:
        return _api_error("Semester must be a valid number.")

    if program not in {"UG", "PG"}:
        return _api_error("Program must be UG or PG.")

    from app.models.database import division_exists
    if not division_exists(org_id, division_id):
        return _api_error("Division not found.", 404)

    update_division(org_id, division_id, name, semester_int, program)
    return _api_success(_serialize_rows(get_divisions(org_id)), "Division updated successfully.")


@app.delete("/api/divisions/<int:division_id>")
@handle_route_errors
@require_role("admin")
def api_delete_division(division_id: int):
    org_id = g.org_id
    from app.models.database import division_exists
    if not division_exists(org_id, division_id):
        return _api_error("Division not found.", 404)
    if division_has_timetable(org_id, division_id):
        return _api_error("Cannot delete division with generated timetable data.", 400)
    delete_division(org_id, division_id)
    return _api_success(_serialize_rows(get_divisions(org_id)), "Division deleted successfully.")


# ===========================================================================
# SETTINGS
# ===========================================================================

@app.get("/api/settings")
@handle_route_errors
@require_auth
def api_get_settings():
    settings_data = get_settings() or {}
    settings_data = {k: _serialize_value(v) for k, v in dict(settings_data).items()}
    return _api_success(settings_data)


@app.put("/api/settings")
@handle_route_errors
@require_role("admin")
def api_update_settings_json():
    payload = request.get_json(silent=True) or {}
    institute_name = str(payload.get("institute_name", "")).strip()
    logo_url = str(payload.get("logo_url", "")).strip()
    academic_year = str(payload.get("academic_year", "")).strip()
    semester_type = str(payload.get("semester_type", "odd")).strip().lower() or "odd"
    default_program = str(payload.get("default_program", "UG")).strip().upper() or "UG"
    auto_resolution = _to_bool(payload.get("auto_resolution", True))
    preference_weighting_raw = payload.get("preference_weighting", 60)
    working_days = [str(d).strip() for d in (payload.get("working_days") or []) if str(d).strip()]
    time_slots = [str(s).strip() for s in (payload.get("time_slots") or []) if str(s).strip()]

    if semester_type not in {"odd", "even"}:
        return _api_error("Semester type must be odd or even.")
    if default_program not in {"UG", "PG"}:
        return _api_error("Default program must be UG or PG.")

    try:
        preference_weighting = int(preference_weighting_raw)
        if preference_weighting < 1 or preference_weighting > 100:
            raise ValueError
    except ValueError:
        return _api_error("Preference weighting must be between 1 and 100.")

    if not working_days or not time_slots:
        return _api_error("Working days and time slots cannot be empty.")

    update_settings(
        {
            "institute_name": institute_name,
            "logo_url": logo_url,
            "academic_year": academic_year,
            "semester_type": semester_type,
            "default_program": default_program,
            "auto_resolution": auto_resolution,
            "preference_weighting": preference_weighting,
            "working_days": working_days,
            "time_slots": time_slots,
        }
    )
    settings_data = {k: _serialize_value(v) for k, v in dict(get_settings() or {}).items()}
    return _api_success(settings_data, "Settings saved successfully.")


# ===========================================================================
# PROFILE
# ===========================================================================

@app.get("/api/profile")
@handle_route_errors
@require_auth
def api_get_profile():
    profile_data = {k: _serialize_value(v) for k, v in dict(get_profile() or {}).items()}
    return _api_success(profile_data)


@app.put("/api/profile")
@handle_route_errors
@require_auth
def api_update_profile_json():
    payload = request.get_json(silent=True) or {}
    update_profile(
        {
            "full_name": str(payload.get("full_name", "")).strip(),
            "role_title": str(payload.get("role_title", "")).strip(),
            "institute": str(payload.get("institute", "")).strip(),
            "email": str(payload.get("email", "")).strip(),
            "phone": str(payload.get("phone", "")).strip(),
            "theme": str(payload.get("theme", "dark")).strip() or "dark",
            "contrast": str(payload.get("contrast", "standard")).strip() or "standard",
            "landing": str(payload.get("landing", "dashboard")).strip() or "dashboard",
            "email_notifications": _to_bool(payload.get("email_notifications", True)),
            "auto_save": _to_bool(payload.get("auto_save", True)),
            "compact_view": _to_bool(payload.get("compact_view", False)),
            "slack_integration": _to_bool(payload.get("slack_integration", False)),
            "two_factor": _to_bool(payload.get("two_factor", True)),
        }
    )
    profile_data = {k: _serialize_value(v) for k, v in dict(get_profile() or {}).items()}
    return _api_success(profile_data, "Profile preferences saved successfully.")


# ===========================================================================
# INFRASTRUCTURE
# ===========================================================================

@app.get("/api/infrastructure")
@handle_route_errors
@require_auth
def api_get_infrastructure():
    org_id = g.org_id
    rooms = _serialize_rows(get_rooms(org_id))
    equipment_filters = sorted(
        {equip for room in rooms for equip in (room.get("equipment") or [])}
    )
    selected_filters = request.args.getlist("equipment")
    
    if selected_filters and selected_filters[0]:
        filters_list = [eq.strip() for eq in selected_filters[0].split(",") if eq.strip()]
        if filters_list:
            rooms = _serialize_rows(get_rooms(org_id, filters_list))

    return _api_success({"rooms": rooms, "equipment_filters": equipment_filters})


@app.post("/api/infrastructure")
@handle_route_errors
@require_role("admin")
def api_add_room():
    org_id = g.org_id
    payload = request.get_json(silent=True) or {}

    name = str(payload.get("name", "")).strip()
    capacity = payload.get("capacity", 0)
    room_type = str(payload.get("room_type", "")).strip()
    status = str(payload.get("status", "Available")).strip()
    equipment_raw = str(payload.get("equipment", "")).strip()

    if not name:
        return _api_error("Room name is required.")
    
    try:
        capacity = int(capacity)
        if capacity < 1:
            raise ValueError
    except ValueError:
        return _api_error("Capacity must be a positive integer.")

    equipment = [eq.strip() for eq in equipment_raw.split(",") if eq.strip()]

    add_room(org_id, name, capacity, room_type, status, equipment)
    
    current_rooms = _serialize_rows(get_rooms(org_id))
    eq_filters = sorted({equip for room in current_rooms for equip in (room.get("equipment") or [])})
    
    return _api_success({"rooms": current_rooms, "equipment_filters": eq_filters}, "Room added successfully.")


@app.put("/api/infrastructure/<int:room_id>")
@handle_route_errors
@require_role("admin")
def api_update_room(room_id: int):
    org_id = g.org_id
    payload = request.get_json(silent=True) or {}

    name = str(payload.get("name", "")).strip()
    capacity = payload.get("capacity", 0)
    room_type = str(payload.get("room_type", "")).strip()
    status = str(payload.get("status", "Available")).strip()
    equipment_raw = str(payload.get("equipment", "")).strip()

    if not name:
        return _api_error("Room name is required.")
    
    try:
        capacity = int(capacity)
        if capacity < 1:
            raise ValueError
    except ValueError:
        return _api_error("Capacity must be a positive integer.")

    equipment = [eq.strip() for eq in equipment_raw.split(",") if eq.strip()]

    updated_room = update_room(org_id, room_id, name, capacity, room_type, status, equipment)
    if not updated_room:
        return _api_error("Room not found.", 404)

    return _api_success(updated_room, "Room updated successfully.")


@app.delete("/api/infrastructure/<int:room_id>")
@handle_route_errors
@require_role("admin")
def api_delete_room(room_id: int):
    org_id = g.org_id
    if not delete_room(org_id, room_id):
        return _api_error("Room not found.", 404)
        
    return _api_success({"deleted_id": room_id}, "Room deleted successfully.")
    if not selected_filters:
        raw_filter = request.args.get("equipment", "").strip()
        if raw_filter:
            selected_filters = [item.strip() for item in raw_filter.split(",") if item.strip()]
    if selected_filters:
        rooms = [
            room
            for room in rooms
            if all(f in (room.get("equipment") or []) for f in selected_filters)
        ]
    return _api_success(
        {"rooms": rooms, "equipment_filters": equipment_filters, "selected_filters": selected_filters}
    )


@app.post("/api/infrastructure")
@handle_route_errors
@require_role("admin")
def api_add_infrastructure_room():
    org_id = g.org_id
    payload = request.get_json(silent=True) or {}
    room_name = str(payload.get("name", "")).strip()
    capacity_raw = payload.get("capacity", "")
    room_type = str(payload.get("room_type", "Lecture Hall")).strip() or "Lecture Hall"
    status = str(payload.get("status", "Available")).strip() or "Available"
    equipment = payload.get("equipment") or []

    if isinstance(equipment, str):
        equipment = [item.strip() for item in equipment.split(",") if item.strip()]
    else:
        equipment = [str(item).strip() for item in equipment if str(item).strip()]

    if not room_name or str(capacity_raw).strip() == "":
        return _api_error("Room name and capacity are required.")

    try:
        capacity = int(capacity_raw)
        if capacity < 1:
            raise ValueError
    except ValueError:
        return _api_error("Capacity must be a positive number.")

    add_room(org_id, room_name, capacity, room_type, status, equipment)
    rooms = _serialize_rows(get_rooms(org_id))
    equipment_filters = sorted(
        {equip for room in rooms for equip in (room.get("equipment") or [])}
    )
    return _api_success(
        {"rooms": rooms, "equipment_filters": equipment_filters, "selected_filters": []},
        "Room added successfully.",
    )


# ===========================================================================
# REPORTS
# ===========================================================================

@app.get("/api/reports")
@handle_route_errors
@require_auth
def api_get_reports():
    org_id = g.org_id
    generation_id = request.args.get("generation_id") or get_latest_generation_id(org_id)
    _, days, time_slots = _get_schedule_settings()
    return _api_success(_get_reports_context(org_id, generation_id, days, time_slots))


# ===========================================================================
# CONFLICTS
# ===========================================================================

@app.get("/api/conflicts")
@handle_route_errors
@require_auth
def api_get_conflicts():
    org_id = g.org_id
    generation_id = request.args.get("generation_id") or get_latest_generation_id(org_id)
    _, days, time_slots = _get_schedule_settings()
    return _api_success(_get_conflict_context(org_id, generation_id, days, time_slots))


@app.post("/api/conflicts/apply-fix")
@handle_route_errors
@require_role("admin")
def api_apply_conflict_fix():
    org_id = g.org_id
    payload = request.get_json(silent=True) or {}
    generation_id = str(payload.get("generation_id", "")).strip() or get_latest_generation_id(org_id)
    if not generation_id:
        return _api_error("No generation found to apply fix.", 404)

    _, days, time_slots = _get_schedule_settings()

    with get_connection() as conn:
        rows = conn.execute(
            """
            SELECT id, day, time_slot, slot_index, faculty_id, division_id
            FROM timetable
            WHERE generation_id = %s AND org_id = %s
            ORDER BY day, slot_index
            """,
            (generation_id, org_id),
        ).fetchall()

    slot_counts = Counter((r["day"], r["time_slot"], r["faculty_id"]) for r in rows)
    collision = next((k for k, c in slot_counts.items() if c > 1), None)

    if not collision:
        conflict_data = _get_conflict_context(org_id, generation_id, days, time_slots)
        return _api_success(conflict_data, "No conflicts found — timetable is clean.")

    conflict_day, conflict_time, conflict_faculty = collision
    clashing = [
        r for r in rows
        if r["day"] == conflict_day
        and r["time_slot"] == conflict_time
        and r["faculty_id"] == conflict_faculty
    ]
    to_move = clashing[1] if len(clashing) > 1 else clashing[0]

    faculty_busy: set[tuple[str, int]] = {
        (r["day"], r["slot_index"]) for r in rows if r["faculty_id"] == conflict_faculty
    }
    division_busy: set[tuple[str, int]] = {
        (r["day"], r["slot_index"])
        for r in rows
        if r["division_id"] == to_move["division_id"]
    }

    teaching_indexes = [i for i, s in enumerate(time_slots) if _is_teaching_slot(s)]
    moved = False
    for alt_day in days:
        for alt_slot in teaching_indexes:
            if (alt_day, alt_slot) in faculty_busy:
                continue
            if (alt_day, alt_slot) in division_busy:
                continue
            with get_connection() as conn:
                conn.execute(
                    """
                    UPDATE timetable
                    SET day = %s, slot_index = %s, time_slot = %s
                    WHERE id = %s AND org_id = %s
                    """,
                    (alt_day, alt_slot, time_slots[alt_slot], to_move["id"], org_id),
                )
                conn.commit()
            moved = True
            logger.info("Moved timetable row %d to %s slot %d", to_move["id"], alt_day, alt_slot)
            break
        if moved:
            break

    conflict_data = _get_conflict_context(org_id, generation_id, days, time_slots)
    message = "Conflict resolved — timetable re-optimised." if moved else "Could not find a free slot to move the conflict; timetable unchanged."
    return _api_success(conflict_data, message)


# ===========================================================================
# PUBLISHED / STATUS
# ===========================================================================

@app.get("/api/published")
@handle_route_errors
@require_auth
def api_get_published():
    org_id = g.org_id
    generation_id = request.args.get("generation_id") or get_latest_generation_id(org_id)
    summaries = _serialize_rows(get_generation_summaries(org_id))
    publish_data = _get_publish_context(org_id, generation_id)
    publish_data["all_generations"] = summaries
    return _api_success(publish_data)


@app.put("/api/timetable/<string:generation_id>/status")
@handle_route_errors
@require_role("admin")
def api_update_timetable_status(generation_id: str):
    org_id = g.org_id
    payload = request.get_json(silent=True) or {}
    status = str(payload.get("status", "")).strip().lower()

    if status not in {"draft", "reviewed", "published"}:
        return _api_error("status must be one of: draft, reviewed, published.")

    update_generation_status(org_id, generation_id, status)
    logger.info("Generation %s set to status '%s' by org %d", generation_id, status, org_id)
    return _api_success(
        {"generation_id": generation_id, "status": status},
        f"Status updated to '{status}'.",
    )


# ===========================================================================
# SEARCH
# ===========================================================================

@app.get("/api/search")
@handle_route_errors
@require_auth
def api_search():
    org_id = g.org_id
    query = request.args.get("q", "").strip()
    raw_results = (
        search_entities(org_id, query)
        if query
        else {"faculty": [], "subjects": [], "divisions": []}
    )
    results = {
        "faculty": _serialize_rows(raw_results.get("faculty", [])),
        "subjects": _serialize_rows(raw_results.get("subjects", [])),
        "divisions": _serialize_rows(raw_results.get("divisions", [])),
    }
    return _api_success({"query": query, "results": results})


# ===========================================================================
# TIMETABLE VIEW
# ===========================================================================

@app.get("/api/timetable")
@handle_route_errors
@require_auth
def api_get_timetable():
    org_id = g.org_id
    generation_id = request.args.get("generation_id") or get_latest_generation_id(org_id)
    timetable_data = get_timetable_for_generation(org_id, generation_id) if generation_id else {}
    if generation_id and not timetable_data:
        return _api_error("Timetable generation not found.", 404)
    _, days, time_slots = _get_schedule_settings()
    return _api_success(
        {
            "generation_id": generation_id,
            "timetable_data": timetable_data,
            "days": days,
            "time_slots": time_slots,
        }
    )


# ===========================================================================
# GENERATE
# ===========================================================================

@app.get("/api/generate/options")
@handle_route_errors
@require_auth
def api_get_generate_options():
    settings_data, _, _ = _get_schedule_settings()
    divisions = _serialize_rows(get_divisions(g.org_id))
    return _api_success({"settings": settings_data, "divisions": divisions})


@app.post("/api/generate")
@handle_route_errors
@require_role("admin")
def api_generate_timetable():
    org_id = g.org_id
    payload = request.get_json(silent=True) or {}
    settings_data, days, time_slots = _get_schedule_settings()
    semester_type = str(payload.get("semester_type") or settings_data.get("semester_type") or "odd")
    program = str(payload.get("program") or settings_data.get("default_program") or "UG")
    selected_division_ids = payload.get("division_ids") or []

    all_divisions = get_divisions(org_id)
    eligible_divisions = [
        d
        for d in all_divisions
        if d["program"].upper() == program.upper()
        and _semester_matches_type(int(d["semester"]), semester_type)
    ]

    parsed_selected_ids = []
    for item in selected_division_ids:
        try:
            parsed_selected_ids.append(int(item))
        except (TypeError, ValueError):
            return _api_error("Division selection contains invalid values.")

    if parsed_selected_ids:
        selected_set = set(parsed_selected_ids)
        target_divisions = [d for d in eligible_divisions if d["id"] in selected_set]
    else:
        target_divisions = eligible_divisions

    if not target_divisions:
        return _api_error("No divisions match the selected semester type and program. Check your divisions and settings.", 400)

    faculty = get_faculty(org_id)
    subjects = get_subjects(org_id)
    rooms = _serialize_rows(get_rooms(org_id))

    if len(faculty) == 0:
        return _api_error("Add at least one faculty member before generating a timetable.", 400)
    if len(subjects) == 0:
        return _api_error("Add at least one subject before generating a timetable.", 400)

    if _rq_queue is not None:
        from app.services.jobs import run_generation_job
        job = _rq_queue.enqueue(
            run_generation_job,
            org_id,
            {
                "faculty": faculty,
                "subjects": subjects,
                "divisions": target_divisions,
                "rooms": rooms,
                "semester_type": semester_type,
                "program": program,
                "days": days,
                "time_slots": time_slots,
            },
        )
        return _api_success({"job_id": job.id, "async": True}, "Generation job queued.")

    result = generate_timetable(
        faculty=faculty,
        subjects=subjects,
        divisions=target_divisions,
        rooms=rooms,
        semester_type=semester_type,
        program=program,
        days=days,
        time_slots=time_slots,
    )
    if not result["success"]:
        return _api_error(f"Generation failed: {result['reason']}", 422)

    generation_id = datetime.now().strftime("GEN-%Y%m%d%H%M%S")
    save_timetable_records(org_id, generation_id, result["records"])
    timetable_data = get_timetable_for_generation(org_id, generation_id)

    return _api_success(
        {
            "job_id": None,
            "async": False,
            "generation_id": generation_id,
            "timetable_data": timetable_data,
            "days": days,
            "time_slots": time_slots,
        },
        "Timetable generated successfully.",
    )


@app.get("/api/generate/status/<string:job_id>")
@handle_route_errors
@require_auth
def api_generate_status(job_id: str):
    if _rq_queue is None:
        return _api_success({"status": "done", "generation_id": None, "error": None})

    from rq.job import Job as _RQJob
    from rq.exceptions import NoSuchJobError
    try:
        job = _RQJob.fetch(job_id, connection=_rq_queue.connection)
    except NoSuchJobError:
        return _api_error(f"Job '{job_id}' not found.", 404)

    status_map = {
        "queued": "queued",
        "started": "running",
        "finished": "done",
        "failed": "failed",
    }
    rq_status = job.get_status()
    generation_id = job.result.get("generation_id") if rq_status == "finished" and job.result else None
    error = str(job.exc_info) if rq_status == "failed" else None

    return _api_success(
        {
            "status": status_map.get(str(rq_status), str(rq_status)),
            "generation_id": generation_id,
            "error": error,
        }
    )


# ===========================================================================
# SHARE TOKENS  (POST requires auth; GET is public)
# ===========================================================================

@app.post("/api/share")
@handle_route_errors
@require_auth
def api_create_share():
    org_id = g.org_id
    payload = request.get_json(silent=True) or {}
    generation_id = str(payload.get("generation_id", "")).strip()
    expires_in_days = int(payload.get("expires_in_days", 7))

    if not generation_id:
        return _api_error("generation_id is required.")

    expires_at = datetime.now(tz=timezone.utc) + timedelta(days=expires_in_days)
    token = create_share_token(
        org_id=org_id,
        generation_id=generation_id,
        created_by=g.current_user.get("id"),
        expires_at=expires_at,
    )
    share_url = url_for("api_get_share", token=token, _external=True)
    return _api_success({"token": token, "share_url": share_url}, "Share link created.")


@app.get("/api/share/<string:token>")
@handle_route_errors
def api_get_share(token: str):
    row = get_share_token_row(token)
    if not row:
        return _api_error("Invalid or expired share token.", 404)

    if row.get("expires_at") and row["expires_at"] < datetime.now(tz=timezone.utc):
        return _api_error("This share link has expired.", 410)

    org_id = int(row["org_id"])
    generation_id = row["generation_id"]
    timetable_data = get_timetable_for_generation(org_id, generation_id)
    _, days, time_slots = _get_schedule_settings()

    return _api_success(
        {
            "generation_id": generation_id,
            "timetable_data": timetable_data,
            "days": days,
            "time_slots": time_slots,
        }
    )

def _parse_csv_rows(file_bytes: bytes) -> list[dict]:
    import csv, io
    reader = csv.DictReader(io.StringIO(file_bytes.decode("utf-8-sig")))
    return [dict(row) for row in reader]

def _parse_json_rows(file_bytes: bytes) -> list[dict]:
    import json
    data = json.loads(file_bytes)
    if isinstance(data, dict):
        return [data]
    return list(data)

def _parse_import_file(file) -> list[dict]:
    filename = file.filename.lower()
    raw = file.read()
    if filename.endswith(".json"):
        return _parse_json_rows(raw)
    return _parse_csv_rows(raw)

@app.post("/api/import/faculty")
@handle_route_errors
@require_role("admin")
def api_import_faculty():
    from app.models.database import upsert_faculty
    if "file" not in request.files:
        return _api_error("No file uploaded. Use field name 'file'.")

    try:
        rows = _parse_import_file(request.files["file"])
    except Exception as exc:
        logger.error("faculty import parse error: %s", exc)
        return _api_error("Could not parse file. Ensure it is valid CSV or JSON.")

    imported_count = 0
    skipped_count = 0
    errors = []

    for idx, row in enumerate(rows, start=1):
        name = str(row.get("name", "")).strip()
        subject = str(row.get("subject", "")).strip()
        available_time = str(row.get("available_time", "")).strip()
        max_lec_raw = row.get("max_lectures_per_day", "")

        if not name:
            errors.append({"row": idx, "reason": "Name is required."})
            skipped_count += 1
            continue
        if not subject:
            errors.append({"row": idx, "reason": "Subject is required."})
            skipped_count += 1
            continue
        if not available_time:
            errors.append({"row": idx, "reason": "available_time is required."})
            skipped_count += 1
            continue

        try:
            max_lec = int(max_lec_raw)
            if max_lec < 1:
                raise ValueError
        except (ValueError, TypeError):
            errors.append({"row": idx, "reason": "max_lectures_per_day must be integer >= 1."})
            skipped_count += 1
            continue

        try:
            normalized = normalize_availability_text(available_time)
        except ValueError:
            errors.append({"row": idx, "reason": f"Invalid time format: {available_time!r}"})
            skipped_count += 1
            continue

        try:
            upsert_faculty(g.org_id, name, subject, normalized, max_lec)
            imported_count += 1
        except Exception as exc:
            logger.error("upsert faculty row %d: %s", idx, exc)
            errors.append({"row": idx, "reason": "Database error — row skipped."})
            skipped_count += 1

    faculty_rows = _serialize_rows(get_faculty(g.org_id))
    return _api_success(
        {"imported_count": imported_count, "skipped_count": skipped_count, "errors": errors, "faculty": faculty_rows},
        f"Imported {imported_count} faculty record(s). Skipped {skipped_count}.",
    ), 200

@app.post("/api/import/subjects")
@handle_route_errors
@require_role("admin")
def api_import_subjects():
    from app.models.database import upsert_subject, get_faculty_by_name
    if "file" not in request.files:
        return _api_error("No file uploaded. Use field name 'file'.")

    try:
        rows = _parse_import_file(request.files["file"])
    except Exception as exc:
        logger.error("subjects import parse error: %s", exc)
        return _api_error("Could not parse file. Ensure it is valid CSV or JSON.")

    imported_count = 0
    skipped_count = 0
    errors = []
    valid_types = {"Class", "Lab", "Tutorial"}

    for idx, row in enumerate(rows, start=1):
        name = str(row.get("name", "")).strip()
        subject_type = str(row.get("subject_type", "")).strip()
        faculty_name = str(row.get("faculty_name", "")).strip()

        if not name:
            errors.append({"row": idx, "reason": "name is required."}); skipped_count += 1; continue
        if subject_type not in valid_types:
            errors.append({"row": idx, "reason": f"subject_type must be one of {valid_types}."}); skipped_count += 1; continue
        if not faculty_name:
            errors.append({"row": idx, "reason": "faculty_name is required."}); skipped_count += 1; continue

        fac_row = get_faculty_by_name(g.org_id, faculty_name)
        if not fac_row:
            errors.append({"row": idx, "reason": f"Faculty '{faculty_name}' not found."}); skipped_count += 1; continue

        try:
            upsert_subject(g.org_id, name, subject_type, int(fac_row["id"]))
            imported_count += 1
        except Exception as exc:
            logger.error("upsert subject row %d: %s", idx, exc)
            errors.append({"row": idx, "reason": "Database error — row skipped."}); skipped_count += 1

    subjects_rows = _serialize_rows(get_subjects(g.org_id))
    return _api_success(
        {"imported_count": imported_count, "skipped_count": skipped_count, "errors": errors, "subjects": subjects_rows},
        f"Imported {imported_count} subject(s). Skipped {skipped_count}.",
    ), 200

@app.post("/api/import/divisions")
@handle_route_errors
@require_role("admin")
def api_import_divisions():
    from app.models.database import upsert_division
    if "file" not in request.files:
        return _api_error("No file uploaded. Use field name 'file'.")

    try:
        rows = _parse_import_file(request.files["file"])
    except Exception as exc:
        logger.error("divisions import parse error: %s", exc)
        return _api_error("Could not parse file. Ensure it is valid CSV or JSON.")

    imported_count = 0
    skipped_count = 0
    errors = []

    for idx, row in enumerate(rows, start=1):
        name = str(row.get("name", "")).strip()
        program = str(row.get("program", "")).strip().upper()
        sem_raw = row.get("semester", "")

        if not name:
            errors.append({"row": idx, "reason": "name is required."}); skipped_count += 1; continue
        if program not in {"UG", "PG"}:
            errors.append({"row": idx, "reason": "program must be UG or PG."}); skipped_count += 1; continue

        try:
            semester = int(sem_raw)
            if semester < 1 or semester > 8:
                raise ValueError
        except (ValueError, TypeError):
            errors.append({"row": idx, "reason": "semester must be integer 1–8."}); skipped_count += 1; continue

        try:
            upsert_division(g.org_id, name, semester, program)
            imported_count += 1
        except Exception as exc:
            logger.error("upsert division row %d: %s", idx, exc)
            errors.append({"row": idx, "reason": "Database error — row skipped."}); skipped_count += 1

    division_rows = _serialize_rows(get_divisions(g.org_id))
    return _api_success(
        {"imported_count": imported_count, "skipped_count": skipped_count, "errors": errors, "divisions": division_rows},
        f"Imported {imported_count} division(s). Skipped {skipped_count}.",
    ), 200

@app.post("/api/import/auto-regenerate")
@handle_route_errors
@require_role("admin")
def api_auto_regenerate():
    """Check if a timetable exists and regenerate it automatically."""
    payload = request.get_json(silent=True) or {}
    trigger = str(payload.get("trigger", "")).strip()

    generation_id = get_latest_generation_id(g.org_id)
    if not generation_id:
        return _api_success(
            {"regenerated": False, "reason": "No existing timetable to update."},
            "No existing timetable to update.",
        )

    settings_data, days, time_slots = _get_schedule_settings()
    semester_type = str(settings_data.get("semester_type") or "odd")
    program = str(settings_data.get("default_program") or "UG")

    faculty = get_faculty(g.org_id)
    subjects = get_subjects(g.org_id)
    all_divisions = get_divisions(g.org_id)

    if not faculty or not subjects or not all_divisions:
        return _api_success(
            {"regenerated": False, "reason": "Insufficient data to regenerate."},
            "Insufficient data to regenerate.",
        )

    eligible_divisions = [
        d for d in all_divisions
        if d["program"].upper() == program.upper()
        and _semester_matches_type(int(d["semester"]), semester_type)
    ]
    target_divisions = eligible_divisions or all_divisions

    try:
        result = generate_timetable(
            faculty=faculty,
            subjects=subjects,
            divisions=target_divisions,
            rooms=[],
            semester_type=semester_type,
            program=program,
            days=days,
            time_slots=time_slots,
        )
    except Exception as exc:
        logger.error("auto-regenerate failed: %s", exc)
        return _api_error(f"Timetable regeneration failed: {exc}", 422)

    if not result.get("success"):
        return _api_error(result.get("message", "Generation failed."), 422)

    new_generation_id = result["generation_id"]
    save_timetable_records(g.org_id, new_generation_id, result["records"])
    timetable_data = get_timetable_for_generation(g.org_id, new_generation_id)

    return _api_success(
        {
            "regenerated": True,
            "generation_id": new_generation_id,
            "timetable_data": timetable_data,
            "days": days,
            "time_slots": time_slots,
            "trigger": trigger,
        },
        f"Timetable automatically updated after {trigger or 'data'} change.",
    )

@app.route("/app", defaults={"path": ""})
@app.route("/app/<path:path>")
def react_app_entry(path: str):
    if not REACT_DIST_DIR.exists():
        return "React build is not available. Run frontend build first.", 503
    file_path = REACT_DIST_DIR / path
    if path and file_path.exists() and file_path.is_file():
        return send_from_directory(REACT_DIST_DIR, path)
    return send_from_directory(REACT_DIST_DIR, "index.html")

@app.route("/assets/<path:path>")
def react_asset(path: str):
    assets_dir = REACT_DIST_DIR / "assets"
    return send_from_directory(assets_dir, path)

@app.route("/")
def dashboard():
    return redirect(url_for("react_app_entry"))

if __name__ == "__main__":
    app.run(debug=True)
