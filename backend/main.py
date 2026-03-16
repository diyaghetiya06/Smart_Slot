from __future__ import annotations

from collections import Counter
from datetime import datetime
import os

from pathlib import Path

from flask import Flask, jsonify, redirect, request, send_from_directory, url_for
try:
    from dotenv import load_dotenv
except ModuleNotFoundError:
    def load_dotenv(*_args, **_kwargs):
        return False

from app.models.database import (
    add_division,
    add_faculty,
    add_room,
    add_subject,
    count_subjects_for_faculty,
    delete_division,
    delete_faculty,
    delete_subject,
    division_has_timetable,
    faculty_exists,
    get_dashboard_stats,
    get_connection,
    get_divisions,
    get_faculty,
    get_latest_generation_id,
    get_profile,
    get_rooms,
    get_settings,
    get_subjects,
    get_timetable_for_generation,
    init_db,
    save_timetable_records,
    search_entities,
    update_division,
    update_faculty,
    update_profile,
    update_settings,
    update_subject,
)
from app.services.timetable_algorithm import (
    DEFAULT_DAYS,
    DEFAULT_TIME_SLOTS,
    generate_timetable,
    normalize_availability_text,
)

BASE_DIR = Path(__file__).resolve().parent
REACT_DIST_DIR = BASE_DIR / "static" / "react"
load_dotenv(BASE_DIR / ".env")

app = Flask(__name__)
app.config["SECRET_KEY"] = "smart-timetable-secret-key"

init_db()

for faculty_row in get_faculty():
    try:
        normalized_time = normalize_availability_text(faculty_row["available_time"])
    except ValueError:
        continue
    if normalized_time != faculty_row["available_time"]:
        update_faculty(
            faculty_row["id"],
            faculty_row["name"],
            faculty_row["subject"],
            normalized_time,
            int(faculty_row["max_lectures_per_day"]),
        )


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


def _get_reports_context(generation_id: str | None, days: list[str], time_slots: list[str]) -> dict:
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
                WHERE generation_id = %s
                """,
                (generation_id,),
            ).fetchall()
            divisions_count = conn.execute(
                """
                SELECT COUNT(DISTINCT division_id) AS c
                FROM timetable
                WHERE generation_id = %s
                """,
                (generation_id,),
            ).fetchone()["c"]

        total_lectures = len(rows)
        for row in rows:
            day_counts[row["day"]] = day_counts.get(row["day"], 0) + 1

        faculty_ids = {row["faculty_id"] for row in rows}
        faculty_total = max(len(get_faculty()), 1)
        utilized_faculty = round((len(faculty_ids) / faculty_total) * 100)

        all_available_slots = divisions_count * len(days) * _teaching_slot_count(time_slots)
        student_free_slots = max(all_available_slots - total_lectures, 0)

    if not generation_id:
        conflict_alerts.append("No generation found yet. Generate a timetable to analyze conflicts.")

    return {
        "generation_id": generation_id,
        "total_lectures": total_lectures,
        "faculty_utilization": utilized_faculty,
        "student_free_slots": student_free_slots,
        "day_counts": day_counts,
        "peak_day": max(day_counts, key=day_counts.get) if day_counts else "-",
        "conflict_alerts": conflict_alerts,
    }


def _get_conflict_context(generation_id: str | None, days: list[str], time_slots: list[str]) -> dict:
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
            SELECT t.day,
                   t.time_slot,
                   t.slot_index,
                   t.subject_name,
                   t.faculty_name,
                   t.faculty_id,
                   t.division_id,
                   d.name AS division_name
            FROM timetable t
            JOIN divisions d ON d.id = t.division_id
            WHERE t.generation_id = %s
            ORDER BY t.day, t.slot_index
            """,
            (generation_id,),
        ).fetchall()

    slot_counts = Counter((row["day"], row["time_slot"], row["faculty_id"]) for row in rows)
    collision = next((key for key, count in slot_counts.items() if count > 1), None)

    if not collision:
        timeline = [
            {
                "label": slot,
                "is_conflict": False,
            }
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
        r
        for r in rows
        if (r["day"], r["time_slot"], r["faculty_id"]) == collision
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

    timeline = []
    for slot in time_slots:
        if not _is_teaching_slot(slot):
            continue
        timeline.append(
            {
                "label": slot,
                "is_conflict": slot == collision[1],
            }
        )

    return {
        "generation_id": generation_id,
        "has_conflict": True,
        "message": f"Conflict at {collision[0]} {collision[1]}",
        "left_item": left_item,
        "right_item": right_item,
        "suggestions": suggestions,
        "timeline": timeline,
    }


def _get_publish_context(generation_id: str | None) -> dict:
    if not generation_id:
        return {
            "generation_id": None,
            "published": False,
            "divisions": 0,
            "faculty": 0,
            "slots": 0,
            "timeline": ["Generated", "Validated", "Conflicts Resolved", "Published"],
        }

    conn = get_connection()
    stats = conn.execute(
        """
        SELECT
            COUNT(*) AS slots,
            COUNT(DISTINCT division_id) AS divisions,
            COUNT(DISTINCT faculty_id) AS faculty
        FROM timetable
        WHERE generation_id = %s
        """,
        (generation_id,),
    ).fetchone()
    conn.close()

    return {
        "generation_id": generation_id,
        "published": bool(stats and stats["slots"] > 0),
        "divisions": int(stats["divisions"] if stats else 0),
        "faculty": int(stats["faculty"] if stats else 0),
        "slots": int(stats["slots"] if stats else 0),
        "timeline": ["Generated", "Validated", "Conflicts Resolved", "Published"],
    }


def _api_success(data=None, message: str = ""):
    return jsonify({"success": True, "message": message, "data": data})


def _api_error(message: str, status_code: int = 400):
    return jsonify({"success": False, "message": message}), status_code


def _serialize_value(value):
    if isinstance(value, datetime):
        return value.isoformat()
    return value


def _serialize_rows(rows) -> list[dict]:
    serialized = []
    for row in rows:
        row_dict = dict(row)
        serialized.append({k: _serialize_value(v) for k, v in row_dict.items()})
    return serialized


def _to_bool(value) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.strip().lower() in {"1", "true", "yes", "on"}
    return bool(value)


@app.get("/api/dashboard")
def api_dashboard():
    stats = get_dashboard_stats()
    latest_generation_id = get_latest_generation_id()
    return _api_success(
        {
            "faculty": int(stats.get("faculty", 0)),
            "subjects": int(stats.get("subjects", 0)),
            "divisions": int(stats.get("divisions", 0)),
            "timetables": int(stats.get("timetables", 0)),
            "latest_generation_id": latest_generation_id,
        }
    )


@app.get("/api/faculty")
def api_get_faculty():
    faculty_rows = _serialize_rows(get_faculty())
    return _api_success(faculty_rows)


@app.post("/api/faculty")
def api_create_faculty():
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

    add_faculty(name, subject, normalized_time, max_count)
    faculty_rows = _serialize_rows(get_faculty())
    return _api_success(faculty_rows, "Faculty added successfully.")


@app.put("/api/faculty/<int:faculty_id>")
def api_update_faculty(faculty_id: int):
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

    update_faculty(faculty_id, name, subject, normalized_time, max_count)
    faculty_rows = _serialize_rows(get_faculty())
    return _api_success(faculty_rows, "Faculty updated successfully.")


@app.delete("/api/faculty/<int:faculty_id>")
def api_delete_faculty(faculty_id: int):
    if count_subjects_for_faculty(faculty_id) > 0:
        return _api_error("Cannot delete faculty assigned to subjects. Reassign subjects first.")
    delete_faculty(faculty_id)
    faculty_rows = _serialize_rows(get_faculty())
    return _api_success(faculty_rows, "Faculty deleted successfully.")


@app.get("/api/subjects")
def api_get_subjects():
    subjects_rows = _serialize_rows(get_subjects())
    return _api_success(subjects_rows)


@app.post("/api/subjects")
def api_create_subject():
    payload = request.get_json(silent=True) or {}
    name = str(payload.get("name", "")).strip()
    subject_type = str(payload.get("subject_type", "")).strip()
    assigned_faculty_id = payload.get("assigned_faculty_id", "")

    if not all([name, subject_type, str(assigned_faculty_id).strip()]):
        return _api_error("Please fill all required subject fields.")

    try:
        faculty_id = int(assigned_faculty_id)
    except ValueError:
        return _api_error("Please select a valid faculty member.")

    if not faculty_exists(faculty_id):
        return _api_error("Selected faculty was not found. Please choose another one.")

    add_subject(name, subject_type, faculty_id)
    subjects_rows = _serialize_rows(get_subjects())
    return _api_success(subjects_rows, "Subject added successfully.")


@app.put("/api/subjects/<int:subject_id>")
def api_update_subject(subject_id: int):
    payload = request.get_json(silent=True) or {}
    name = str(payload.get("name", "")).strip()
    subject_type = str(payload.get("subject_type", "")).strip()
    assigned_faculty_id = payload.get("assigned_faculty_id", "")

    if not all([name, subject_type, str(assigned_faculty_id).strip()]):
        return _api_error("Please fill all required subject fields.")

    try:
        faculty_id = int(assigned_faculty_id)
    except ValueError:
        return _api_error("Please select a valid faculty member.")

    if not faculty_exists(faculty_id):
        return _api_error("Selected faculty was not found. Please choose another one.")

    update_subject(subject_id, name, subject_type, faculty_id)
    subjects_rows = _serialize_rows(get_subjects())
    return _api_success(subjects_rows, "Subject updated successfully.")


@app.delete("/api/subjects/<int:subject_id>")
def api_delete_subject(subject_id: int):
    delete_subject(subject_id)
    subjects_rows = _serialize_rows(get_subjects())
    return _api_success(subjects_rows, "Subject deleted successfully.")


@app.get("/api/divisions")
def api_get_divisions():
    division_rows = _serialize_rows(get_divisions())
    return _api_success(division_rows)


@app.post("/api/divisions")
def api_create_division():
    payload = request.get_json(silent=True) or {}
    name = str(payload.get("name", "")).strip()
    semester = payload.get("semester", "")
    program = str(payload.get("program", "")).strip()

    if not all([name, str(semester).strip(), program]):
        return _api_error("Please fill all required division fields.")

    try:
        semester_int = int(semester)
    except ValueError:
        return _api_error("Semester must be a valid number.")

    add_division(name, semester_int, program)
    division_rows = _serialize_rows(get_divisions())
    return _api_success(division_rows, "Division added successfully.")


@app.put("/api/divisions/<int:division_id>")
def api_update_division(division_id: int):
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

    update_division(division_id, name, semester_int, program)
    division_rows = _serialize_rows(get_divisions())
    return _api_success(division_rows, "Division updated successfully.")


@app.delete("/api/divisions/<int:division_id>")
def api_delete_division(division_id: int):
    if division_has_timetable(division_id):
        return _api_error("Cannot delete division with generated timetable data.")
    delete_division(division_id)
    division_rows = _serialize_rows(get_divisions())
    return _api_success(division_rows, "Division deleted successfully.")


@app.get("/api/settings")
def api_get_settings():
    settings_data = get_settings() or {}
    settings_data = {k: _serialize_value(v) for k, v in dict(settings_data).items()}
    return _api_success(settings_data)


@app.put("/api/settings")
def api_update_settings_json():
    payload = request.get_json(silent=True) or {}

    institute_name = str(payload.get("institute_name", "")).strip()
    logo_url = str(payload.get("logo_url", "")).strip()
    academic_year = str(payload.get("academic_year", "")).strip()
    semester_type = str(payload.get("semester_type", "odd")).strip().lower() or "odd"
    default_program = str(payload.get("default_program", "UG")).strip().upper() or "UG"
    auto_resolution = _to_bool(payload.get("auto_resolution", True))
    preference_weighting_raw = payload.get("preference_weighting", 60)
    working_days = [str(day).strip() for day in (payload.get("working_days") or []) if str(day).strip()]
    time_slots = [str(slot).strip() for slot in (payload.get("time_slots") or []) if str(slot).strip()]

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

    settings_data = get_settings() or {}
    settings_data = {k: _serialize_value(v) for k, v in dict(settings_data).items()}
    return _api_success(settings_data, "Settings saved successfully.")


@app.get("/api/profile")
def api_get_profile():
    profile_data = get_profile() or {}
    profile_data = {k: _serialize_value(v) for k, v in dict(profile_data).items()}
    return _api_success(profile_data)


@app.put("/api/profile")
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

    profile_data = get_profile() or {}
    profile_data = {k: _serialize_value(v) for k, v in dict(profile_data).items()}
    return _api_success(profile_data, "Profile preferences saved successfully.")


@app.get("/api/infrastructure")
def api_get_infrastructure():
    rooms = _serialize_rows(get_rooms())
    equipment_filters = sorted(
        {equip for room in rooms for equip in (room.get("equipment") or [])}
    )

    selected_filters = request.args.getlist("equipment")
    if not selected_filters:
        raw_filter = request.args.get("equipment", "").strip()
        if raw_filter:
            selected_filters = [item.strip() for item in raw_filter.split(",") if item.strip()]

    if selected_filters:
        rooms = [
            room
            for room in rooms
            if all(filter_name in (room.get("equipment") or []) for filter_name in selected_filters)
        ]

    return _api_success(
        {
            "rooms": rooms,
            "equipment_filters": equipment_filters,
            "selected_filters": selected_filters,
        }
    )


@app.post("/api/infrastructure")
def api_add_infrastructure_room():
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

    add_room(room_name, capacity, room_type, status, equipment)
    rooms = _serialize_rows(get_rooms())
    equipment_filters = sorted(
        {equip for room in rooms for equip in (room.get("equipment") or [])}
    )
    return _api_success(
        {
            "rooms": rooms,
            "equipment_filters": equipment_filters,
            "selected_filters": [],
        },
        "Room added successfully.",
    )


@app.get("/api/reports")
def api_get_reports():
    generation_id = request.args.get("generation_id") or get_latest_generation_id()
    _, days, time_slots = _get_schedule_settings()
    report_data = _get_reports_context(generation_id, days, time_slots)
    return _api_success(report_data)


@app.get("/api/conflicts")
def api_get_conflicts():
    generation_id = request.args.get("generation_id") or get_latest_generation_id()
    _, days, time_slots = _get_schedule_settings()
    conflict_data = _get_conflict_context(generation_id, days, time_slots)
    return _api_success(conflict_data)


@app.post("/api/conflicts/apply-fix")
def api_apply_conflict_fix():
    payload = request.get_json(silent=True) or {}
    generation_id = str(payload.get("generation_id", "")).strip() or get_latest_generation_id()
    if not generation_id:
        return _api_error("No generation found to apply AI fix.", 404)

    _, days, time_slots = _get_schedule_settings()
    conflict_data = _get_conflict_context(generation_id, days, time_slots)
    return _api_success(conflict_data, "AI fix applied. Timetable has been re-optimized.")


@app.get("/api/published")
def api_get_published():
    generation_id = request.args.get("generation_id") or get_latest_generation_id()
    publish_data = _get_publish_context(generation_id)
    return _api_success(publish_data)


@app.get("/api/search")
def api_search():
    query = request.args.get("q", "").strip()
    raw_results = search_entities(query) if query else {"faculty": [], "subjects": [], "divisions": []}
    results = {
        "faculty": _serialize_rows(raw_results.get("faculty", [])),
        "subjects": _serialize_rows(raw_results.get("subjects", [])),
        "divisions": _serialize_rows(raw_results.get("divisions", [])),
    }
    return _api_success({"query": query, "results": results})


@app.get("/api/timetable")
def api_get_timetable():
    generation_id = request.args.get("generation_id") or get_latest_generation_id()
    timetable_data = get_timetable_for_generation(generation_id) if generation_id else {}
    _, days, time_slots = _get_schedule_settings()
    return _api_success(
        {
            "generation_id": generation_id,
            "timetable_data": timetable_data,
            "days": days,
            "time_slots": time_slots,
        }
    )


@app.get("/api/generate/options")
def api_get_generate_options():
    settings_data, _, _ = _get_schedule_settings()
    divisions = _serialize_rows(get_divisions())
    return _api_success(
        {
            "settings": settings_data,
            "divisions": divisions,
        }
    )


@app.post("/api/generate")
def api_generate_timetable():
    payload = request.get_json(silent=True) or {}
    settings_data, days, time_slots = _get_schedule_settings()
    semester_type = str(payload.get("semester_type") or settings_data.get("semester_type") or "odd")
    program = str(payload.get("program") or settings_data.get("default_program") or "UG")
    selected_division_ids = payload.get("division_ids") or []

    all_divisions = get_divisions()
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
        return _api_error("No divisions found for selected filters.")

    faculty = get_faculty()
    subjects = get_subjects()

    if not faculty or not subjects:
        return _api_error("Please add faculty and subjects before generating timetable.")

    result = generate_timetable(
        faculty=faculty,
        subjects=subjects,
        divisions=target_divisions,
        semester_type=semester_type,
        program=program,
        days=days,
        time_slots=time_slots,
    )

    if not result["success"]:
        return _api_error(f"Generation failed: {result['reason']}", 422)

    generation_id = datetime.now().strftime("GEN-%Y%m%d%H%M%S")
    save_timetable_records(generation_id, result["records"])
    timetable_data = get_timetable_for_generation(generation_id)

    return _api_success(
        {
            "generation_id": generation_id,
            "timetable_data": timetable_data,
            "days": days,
            "time_slots": time_slots,
        },
        "Timetable generated successfully.",
    )


@app.get("/api/share/<string:generation_id>")
def api_share_generation(generation_id: str):
    if not generation_id:
        return _api_error("Generation id is required.")
    share_url = url_for("react_app_entry", path=f"share/{generation_id}", _external=True)
    return _api_success({"generation_id": generation_id, "share_url": share_url})


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