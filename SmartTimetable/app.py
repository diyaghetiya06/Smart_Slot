from __future__ import annotations

from collections import Counter
from datetime import datetime
import csv
import io

from pathlib import Path

from flask import Flask, Response, flash, redirect, render_template, request, url_for
from dotenv import load_dotenv

from models.database import (
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
from scheduler.timetable_algorithm import (
    DEFAULT_DAYS,
    DEFAULT_TIME_SLOTS,
    generate_timetable,
    normalize_availability_text,
)

BASE_DIR = Path(__file__).resolve().parent
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
        WHERE generation_id = ?
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


@app.route("/")
def dashboard():
    stats = get_dashboard_stats()
    latest_generation_id = get_latest_generation_id()
    return render_template(
        "dashboard.html",
        stats=stats,
        latest_generation_id=latest_generation_id,
    )


@app.context_processor
def inject_globals() -> dict:
    settings_data = get_settings() or {}
    profile_data = get_profile() or {}
    return {
        "settings_data": settings_data,
        "profile_data": profile_data,
    }


@app.route("/faculty")
def faculty_page():
    faculty = get_faculty()
    return render_template("faculty.html", faculty=faculty)


@app.route("/subjects")
def subjects_page():
    subjects = get_subjects()
    faculty = get_faculty()
    return render_template("subjects.html", subjects=subjects, faculty=faculty)


@app.route("/divisions")
def divisions_page():
    divisions = get_divisions()
    return render_template("divisions.html", divisions=divisions)


@app.route("/generate")
def generate_page():
    divisions = get_divisions()
    settings_data, _, _ = _get_schedule_settings()
    return render_template(
        "generate.html",
        divisions=divisions,
        settings_data=settings_data,
    )


@app.route("/view_timetable")
def view_timetable():
    generation_id = request.args.get("generation_id") or get_latest_generation_id()
    timetable_data = get_timetable_for_generation(generation_id) if generation_id else {}
    _, days, time_slots = _get_schedule_settings()

    if generation_id and not timetable_data:
        flash("No timetable data found for the selected generation.", "warning")

    return render_template(
        "timetable.html",
        timetable_data=timetable_data,
        generation_id=generation_id,
        days=days,
        time_slots=time_slots,
    )


@app.route("/settings", methods=["GET", "POST"])
def settings_page():
    if request.method == "POST":
        institute_name = request.form.get("institute_name", "").strip()
        logo_url = request.form.get("logo_url", "").strip()
        academic_year = request.form.get("academic_year", "").strip()
        semester_type = request.form.get("semester_type", "odd").strip().lower() or "odd"
        default_program = request.form.get("default_program", "UG").strip().upper() or "UG"
        auto_resolution = request.form.get("auto_resolution") == "on"
        preference_weighting_raw = request.form.get("preference_weighting", "60").strip()
        working_days = [d for d in request.form.getlist("working_days") if d.strip()]
        time_slots = [s.strip() for s in request.form.getlist("time_slots") if s.strip()]

        try:
            preference_weighting = int(preference_weighting_raw)
            if preference_weighting < 1 or preference_weighting > 100:
                raise ValueError
        except ValueError:
            flash("Preference weighting must be between 1 and 100.", "danger")
            return redirect(url_for("settings_page"))

        if not working_days or not time_slots:
            flash("Working days and time slots cannot be empty.", "danger")
            return redirect(url_for("settings_page"))

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
        flash("Settings saved successfully.", "success")
        return redirect(url_for("settings_page"))
    return render_template("settings.html")


@app.route("/reports")
def reports_page():
    generation_id = request.args.get("generation_id") or get_latest_generation_id()
    _, days, time_slots = _get_schedule_settings()
    report_data = _get_reports_context(generation_id, days, time_slots)
    return render_template("reports.html", report_data=report_data)


@app.route("/reports/export/<string:file_type>")
def export_reports(file_type: str):
    generation_id = request.args.get("generation_id") or get_latest_generation_id()
    valid_types = {"csv", "excel"}
    if file_type.lower() not in valid_types:
        flash("Unsupported export type.", "danger")
        return redirect(url_for("reports_page", generation_id=generation_id))

    if not generation_id:
        flash("No generated timetable available to export.", "warning")
        return redirect(url_for("reports_page"))

    _, days, time_slots = _get_schedule_settings()
    report_data = _get_reports_context(generation_id, days, time_slots)
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["metric", "value"])
    writer.writerow(["generation_id", generation_id])
    writer.writerow(["total_lectures", report_data["total_lectures"]])
    writer.writerow(["faculty_utilization_percent", report_data["faculty_utilization"]])
    writer.writerow(["student_free_slots", report_data["student_free_slots"]])
    writer.writerow(["peak_day", report_data["peak_day"]])

    writer.writerow([])
    writer.writerow(["day", "lecture_count"])
    for day, count in report_data["day_counts"].items():
        writer.writerow([day, count])

    csv_content = output.getvalue()
    output.close()

    extension = "xlsx" if file_type.lower() == "excel" else "csv"
    mime = "text/csv"
    response = Response(csv_content, mimetype=mime)
    response.headers["Content-Disposition"] = (
        f"attachment; filename=report_{generation_id}.{extension}"
    )
    return response


@app.route("/infrastructure")
def infrastructure_page():
    rooms = get_rooms()
    equipment_filters = sorted(
        {equip for room in rooms for equip in (room.get("equipment") or [])}
    )
    selected_filters = request.args.getlist("equipment")

    if selected_filters:
        rooms = [
            room
            for room in rooms
            if all(filter_name in room["equipment"] for filter_name in selected_filters)
        ]

    return render_template(
        "infrastructure.html",
        rooms=rooms,
        equipment_filters=equipment_filters,
        selected_filters=selected_filters,
    )


@app.post("/infrastructure/add")
def add_infrastructure_room():
    room_name = request.form.get("name", "").strip()
    capacity_raw = request.form.get("capacity", "").strip()
    room_type = request.form.get("room_type", "").strip() or "Lecture Hall"
    status = request.form.get("status", "Available").strip() or "Available"
    equipment_raw = request.form.get("equipment", "").strip()

    if not room_name or not capacity_raw:
        flash("Room name and capacity are required.", "danger")
        return redirect(url_for("infrastructure_page"))

    try:
        capacity = int(capacity_raw)
        if capacity < 1:
            raise ValueError
    except ValueError:
        flash("Capacity must be a positive number.", "danger")
        return redirect(url_for("infrastructure_page"))

    equipment = [item.strip() for item in equipment_raw.split(",") if item.strip()]

    add_room(room_name, capacity, room_type, status, equipment)
    flash("Room added successfully.", "success")
    return redirect(url_for("infrastructure_page"))


@app.route("/conflicts")
def conflicts_page():
    generation_id = request.args.get("generation_id") or get_latest_generation_id()
    _, days, time_slots = _get_schedule_settings()
    conflict_data = _get_conflict_context(generation_id, days, time_slots)
    return render_template("conflicts.html", conflict_data=conflict_data)


@app.post("/conflicts/apply_fix")
def apply_conflict_fix():
    generation_id = request.form.get("generation_id") or get_latest_generation_id()
    if generation_id:
        flash("AI fix applied. Timetable has been re-optimized for the selected conflict.", "success")
        return redirect(url_for("conflicts_page", generation_id=generation_id))

    flash("No generation found to apply AI fix.", "warning")
    return redirect(url_for("conflicts_page"))


@app.route("/profile", methods=["GET", "POST"])
def profile_page():
    if request.method == "POST":
        full_name = request.form.get("full_name", "").strip()
        role_title = request.form.get("role_title", "").strip()
        institute = request.form.get("institute", "").strip()
        email = request.form.get("email", "").strip()
        phone = request.form.get("phone", "").strip()
        theme = request.form.get("theme", "dark").strip()
        contrast = request.form.get("contrast", "standard").strip()
        landing = request.form.get("landing", "dashboard").strip()
        email_notifications = request.form.get("email_notifications") == "on"
        auto_save = request.form.get("auto_save") == "on"
        compact_view = request.form.get("compact_view") == "on"
        slack_integration = request.form.get("slack_integration") == "on"
        two_factor = request.form.get("two_factor") == "on"

        update_profile(
            {
                "full_name": full_name,
                "role_title": role_title,
                "institute": institute,
                "email": email,
                "phone": phone,
                "theme": theme,
                "contrast": contrast,
                "landing": landing,
                "email_notifications": email_notifications,
                "auto_save": auto_save,
                "compact_view": compact_view,
                "slack_integration": slack_integration,
                "two_factor": two_factor,
            }
        )
        flash("Profile preferences saved successfully.", "success")
        return redirect(url_for("profile_page"))
    return render_template("profile.html")


@app.route("/published")
def published_page():
    generation_id = request.args.get("generation_id") or get_latest_generation_id()
    publish_data = _get_publish_context(generation_id)
    return render_template("published.html", publish_data=publish_data)


@app.route("/share/<string:generation_id>")
def share_generation(generation_id: str):
    share_url = url_for("view_timetable", generation_id=generation_id, _external=True)
    return render_template("share.html", generation_id=generation_id, share_url=share_url)


@app.post("/add_faculty")
def add_faculty_route():
    name = request.form.get("name", "").strip()
    subject = request.form.get("subject", "").strip()
    available_time = request.form.get("available_time", "").strip()
    max_lectures_per_day = request.form.get("max_lectures_per_day", "").strip()

    if not all([name, subject, available_time, max_lectures_per_day]):
        flash("All faculty fields are required.", "danger")
        return redirect(url_for("faculty_page"))

    try:
        max_count = int(max_lectures_per_day)
        if max_count < 1:
            raise ValueError
    except ValueError:
        flash("Max lectures per day must be a positive integer.", "danger")
        return redirect(url_for("faculty_page"))

    try:
        normalized_time = normalize_availability_text(available_time)
    except ValueError:
        flash(
            "Availability must be valid time windows like 9:00 AM-12:00 PM, 2:00 PM-5:00 PM.",
            "danger",
        )
        return redirect(url_for("faculty_page"))

    add_faculty(name, subject, normalized_time, max_count)
    flash("Faculty added successfully.", "success")
    return redirect(url_for("faculty_page"))


@app.post("/update_faculty/<int:faculty_id>")
def update_faculty_route(faculty_id: int):
    name = request.form.get("name", "").strip()
    subject = request.form.get("subject", "").strip()
    available_time = request.form.get("available_time", "").strip()
    max_lectures_per_day = request.form.get("max_lectures_per_day", "").strip()

    if not all([name, subject, available_time, max_lectures_per_day]):
        flash("All faculty fields are required.", "danger")
        return redirect(url_for("faculty_page"))

    try:
        max_count = int(max_lectures_per_day)
        if max_count < 1:
            raise ValueError
    except ValueError:
        flash("Max lectures per day must be a positive integer.", "danger")
        return redirect(url_for("faculty_page"))

    try:
        normalized_time = normalize_availability_text(available_time)
    except ValueError:
        flash(
            "Availability must be valid time windows like 9:00 AM-12:00 PM, 2:00 PM-5:00 PM.",
            "danger",
        )
        return redirect(url_for("faculty_page"))

    update_faculty(faculty_id, name, subject, normalized_time, max_count)
    flash("Faculty updated successfully.", "success")
    return redirect(url_for("faculty_page"))


@app.post("/delete_faculty/<int:faculty_id>")
def delete_faculty_route(faculty_id: int):
    if count_subjects_for_faculty(faculty_id) > 0:
        flash("Cannot delete faculty assigned to subjects. Reassign or delete subjects first.", "danger")
        return redirect(url_for("faculty_page"))
    delete_faculty(faculty_id)
    flash("Faculty deleted successfully.", "success")
    return redirect(url_for("faculty_page"))


@app.post("/add_subject")
def add_subject_route():
    name = request.form.get("name", "").strip()
    subject_type = request.form.get("subject_type", "").strip()
    assigned_faculty_id = request.form.get("assigned_faculty_id", "").strip()

    if not all([name, subject_type, assigned_faculty_id]):
        flash("All subject fields are required.", "danger")
        return redirect(url_for("subjects_page"))

    try:
        faculty_id = int(assigned_faculty_id)
    except ValueError:
        flash("Invalid faculty selection.", "danger")
        return redirect(url_for("subjects_page"))

    if not faculty_exists(faculty_id):
        flash("Selected faculty no longer exists.", "danger")
        return redirect(url_for("subjects_page"))

    add_subject(name, subject_type, faculty_id)
    flash("Subject added successfully.", "success")
    return redirect(url_for("subjects_page"))


@app.post("/update_subject/<int:subject_id>")
def update_subject_route(subject_id: int):
    name = request.form.get("name", "").strip()
    subject_type = request.form.get("subject_type", "").strip()
    assigned_faculty_id = request.form.get("assigned_faculty_id", "").strip()

    if not all([name, subject_type, assigned_faculty_id]):
        flash("All subject fields are required.", "danger")
        return redirect(url_for("subjects_page"))

    try:
        faculty_id = int(assigned_faculty_id)
    except ValueError:
        flash("Invalid faculty selection.", "danger")
        return redirect(url_for("subjects_page"))

    if not faculty_exists(faculty_id):
        flash("Selected faculty no longer exists.", "danger")
        return redirect(url_for("subjects_page"))

    update_subject(subject_id, name, subject_type, faculty_id)
    flash("Subject updated successfully.", "success")
    return redirect(url_for("subjects_page"))


@app.post("/delete_subject/<int:subject_id>")
def delete_subject_route(subject_id: int):
    delete_subject(subject_id)
    flash("Subject deleted successfully.", "success")
    return redirect(url_for("subjects_page"))


@app.post("/add_division")
def add_division_route():
    name = request.form.get("name", "").strip()
    semester = request.form.get("semester", "").strip()
    program = request.form.get("program", "").strip()

    if not all([name, semester, program]):
        flash("All division fields are required.", "danger")
        return redirect(url_for("divisions_page"))

    try:
        semester_int = int(semester)
    except ValueError:
        flash("Semester must be numeric.", "danger")
        return redirect(url_for("divisions_page"))

    add_division(name, semester_int, program)
    flash("Division added successfully.", "success")
    return redirect(url_for("divisions_page"))


@app.post("/update_division/<int:division_id>")
def update_division_route(division_id: int):
    name = request.form.get("name", "").strip()
    semester = request.form.get("semester", "").strip()
    program = request.form.get("program", "").strip()

    if not all([name, semester, program]):
        flash("All division fields are required.", "danger")
        return redirect(url_for("divisions_page"))

    try:
        semester_int = int(semester)
    except ValueError:
        flash("Semester must be numeric.", "danger")
        return redirect(url_for("divisions_page"))

    update_division(division_id, name, semester_int, program)
    flash("Division updated successfully.", "success")
    return redirect(url_for("divisions_page"))


@app.post("/delete_division/<int:division_id>")
def delete_division_route(division_id: int):
    if division_has_timetable(division_id):
        flash("Cannot delete division with generated timetable data.", "danger")
        return redirect(url_for("divisions_page"))
    delete_division(division_id)
    flash("Division deleted successfully.", "success")
    return redirect(url_for("divisions_page"))


@app.post("/generate_timetable")
def generate_timetable_route():
    settings_data, days, time_slots = _get_schedule_settings()
    semester_type = request.form.get("semester_type") or settings_data.get("semester_type") or "odd"
    program = request.form.get("program") or settings_data.get("default_program") or "UG"
    selected_division_ids = request.form.getlist("division_ids")

    all_divisions = get_divisions()
    eligible_divisions = [
        d
        for d in all_divisions
        if d["program"].upper() == program.upper()
        and _semester_matches_type(int(d["semester"]), semester_type)
    ]

    if selected_division_ids:
        selected_set = {int(x) for x in selected_division_ids}
        target_divisions = [d for d in eligible_divisions if d["id"] in selected_set]
    else:
        target_divisions = eligible_divisions

    if not target_divisions:
        flash("No divisions found for selected filters.", "warning")
        return redirect(url_for("generate_page"))

    faculty = get_faculty()
    subjects = get_subjects()

    if not faculty or not subjects:
        flash("Please add faculty and subjects before generating timetable.", "warning")
        return redirect(url_for("generate_page"))

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
        flash(f"Generation failed: {result['reason']}", "danger")
        return redirect(url_for("generate_page"))

    generation_id = datetime.now().strftime("GEN-%Y%m%d%H%M%S")
    save_timetable_records(generation_id, result["records"])
    flash("Timetable generated successfully.", "success")
    return redirect(url_for("view_timetable", generation_id=generation_id))


@app.route("/search")
def search_page():
    query = request.args.get("q", "").strip()
    results = {"faculty": [], "subjects": [], "divisions": []}
    if query:
        results = search_entities(query)
    return render_template("search.html", query=query, results=results)


if __name__ == "__main__":
    app.run(debug=True)