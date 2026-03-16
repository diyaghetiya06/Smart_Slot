from __future__ import annotations

import os
from typing import Any

import psycopg
from psycopg.rows import dict_row


def get_connection() -> psycopg.Connection:
    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        raise RuntimeError("DATABASE_URL is not set. Configure Neon database access.")
    return psycopg.connect(database_url, row_factory=dict_row)


def init_db() -> None:
    default_days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]
    default_slots = [
        "9:00 AM-10:00 AM",
        "10:00 AM-11:00 AM",
        "11:00 AM-12:00 PM",
        "12:00 PM-1:00 PM",
        "1:00 PM-2:00 PM (Lunch Break)",
        "2:00 PM-3:00 PM",
        "3:00 PM-4:00 PM",
        "4:00 PM-5:00 PM",
    ]

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS faculty (
                    id SERIAL PRIMARY KEY,
                    name TEXT NOT NULL,
                    subject TEXT NOT NULL,
                    available_time TEXT NOT NULL,
                    max_lectures_per_day INTEGER NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
                """
            )

            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS subjects (
                    id SERIAL PRIMARY KEY,
                    name TEXT NOT NULL,
                    subject_type TEXT NOT NULL CHECK(subject_type IN ('Class', 'Lab', 'Tutorial')),
                    assigned_faculty_id INTEGER NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY(assigned_faculty_id) REFERENCES faculty(id) ON DELETE RESTRICT
                )
                """
            )

            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS divisions (
                    id SERIAL PRIMARY KEY,
                    name TEXT NOT NULL,
                    semester INTEGER NOT NULL,
                    program TEXT NOT NULL CHECK(program IN ('UG', 'PG')),
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
                """
            )

            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS timetable (
                    id SERIAL PRIMARY KEY,
                    division_id INTEGER NOT NULL,
                    semester INTEGER NOT NULL,
                    program TEXT NOT NULL,
                    day TEXT NOT NULL,
                    slot_index INTEGER NOT NULL,
                    time_slot TEXT NOT NULL,
                    subject_id INTEGER NOT NULL,
                    faculty_id INTEGER NOT NULL,
                    subject_name TEXT NOT NULL,
                    faculty_name TEXT NOT NULL,
                    subject_type TEXT NOT NULL,
                    generation_id TEXT NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY(division_id) REFERENCES divisions(id) ON DELETE CASCADE,
                    FOREIGN KEY(subject_id) REFERENCES subjects(id) ON DELETE CASCADE,
                    FOREIGN KEY(faculty_id) REFERENCES faculty(id) ON DELETE CASCADE
                )
                """
            )

            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS settings (
                    id INTEGER PRIMARY KEY CHECK (id = 1),
                    institute_name TEXT,
                    logo_url TEXT,
                    academic_year TEXT,
                    semester_type TEXT CHECK (semester_type IN ('odd', 'even')),
                    default_program TEXT CHECK (default_program IN ('UG', 'PG')),
                    auto_resolution BOOLEAN NOT NULL DEFAULT true,
                    preference_weighting INTEGER NOT NULL DEFAULT 60,
                    working_days TEXT[] NOT NULL,
                    time_slots TEXT[] NOT NULL,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
                """
            )

            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS user_profile (
                    id INTEGER PRIMARY KEY CHECK (id = 1),
                    full_name TEXT,
                    role_title TEXT,
                    institute TEXT,
                    email TEXT,
                    phone TEXT,
                    theme TEXT DEFAULT 'dark',
                    contrast TEXT DEFAULT 'standard',
                    landing TEXT DEFAULT 'dashboard',
                    email_notifications BOOLEAN DEFAULT true,
                    auto_save BOOLEAN DEFAULT true,
                    compact_view BOOLEAN DEFAULT false,
                    slack_integration BOOLEAN DEFAULT false,
                    two_factor BOOLEAN DEFAULT true,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
                """
            )

            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS infrastructure_rooms (
                    id SERIAL PRIMARY KEY,
                    name TEXT NOT NULL,
                    capacity INTEGER NOT NULL CHECK (capacity > 0),
                    room_type TEXT NOT NULL,
                    status TEXT NOT NULL,
                    equipment TEXT[] NOT NULL DEFAULT '{}',
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
                """
            )

            cur.execute(
                """
                INSERT INTO settings (
                    id,
                    institute_name,
                    logo_url,
                    academic_year,
                    semester_type,
                    default_program,
                    auto_resolution,
                    preference_weighting,
                    working_days,
                    time_slots
                )
                VALUES (1, '', '', '', 'odd', 'UG', true, 60, %s, %s)
                ON CONFLICT (id) DO NOTHING
                """,
                (default_days, default_slots),
            )

            cur.execute(
                """
                INSERT INTO user_profile (
                    id,
                    full_name,
                    role_title,
                    institute,
                    email,
                    phone
                )
                VALUES (1, '', '', '', '', '')
                ON CONFLICT (id) DO NOTHING
                """
            )
        conn.commit()


def add_faculty(name: str, subject: str, available_time: str, max_lectures_per_day: int) -> None:
    with get_connection() as conn:
        conn.execute(
            """
            INSERT INTO faculty (name, subject, available_time, max_lectures_per_day)
            VALUES (%s, %s, %s, %s)
            """,
            (name, subject, available_time, max_lectures_per_day),
        )
        conn.commit()


def update_faculty(
    faculty_id: int,
    name: str,
    subject: str,
    available_time: str,
    max_lectures_per_day: int,
) -> None:
    with get_connection() as conn:
        conn.execute(
            """
            UPDATE faculty
            SET name = %s, subject = %s, available_time = %s, max_lectures_per_day = %s
            WHERE id = %s
            """,
            (name, subject, available_time, max_lectures_per_day, faculty_id),
        )
        conn.commit()


def delete_faculty(faculty_id: int) -> None:
    with get_connection() as conn:
        conn.execute("DELETE FROM faculty WHERE id = %s", (faculty_id,))
        conn.commit()


def get_faculty() -> list[dict]:
    with get_connection() as conn:
        rows = conn.execute("SELECT * FROM faculty ORDER BY id DESC").fetchall()
    return rows


def add_subject(name: str, subject_type: str, assigned_faculty_id: int) -> None:
    with get_connection() as conn:
        conn.execute(
            """
            INSERT INTO subjects (name, subject_type, assigned_faculty_id)
            VALUES (%s, %s, %s)
            """,
            (name, subject_type, assigned_faculty_id),
        )
        conn.commit()


def update_subject(subject_id: int, name: str, subject_type: str, assigned_faculty_id: int) -> None:
    with get_connection() as conn:
        conn.execute(
            """
            UPDATE subjects
            SET name = %s, subject_type = %s, assigned_faculty_id = %s
            WHERE id = %s
            """,
            (name, subject_type, assigned_faculty_id, subject_id),
        )
        conn.commit()


def delete_subject(subject_id: int) -> None:
    with get_connection() as conn:
        conn.execute("DELETE FROM subjects WHERE id = %s", (subject_id,))
        conn.commit()


def get_subjects() -> list[dict]:
    with get_connection() as conn:
        rows = conn.execute(
            """
            SELECT s.*, f.name AS faculty_name
            FROM subjects s
            JOIN faculty f ON f.id = s.assigned_faculty_id
            ORDER BY s.id DESC
            """
        ).fetchall()
    return rows


def add_division(name: str, semester: int, program: str) -> None:
    with get_connection() as conn:
        conn.execute(
            """
            INSERT INTO divisions (name, semester, program)
            VALUES (%s, %s, %s)
            """,
            (name, semester, program.upper()),
        )
        conn.commit()


def update_division(division_id: int, name: str, semester: int, program: str) -> None:
    with get_connection() as conn:
        conn.execute(
            """
            UPDATE divisions
            SET name = %s, semester = %s, program = %s
            WHERE id = %s
            """,
            (name, semester, program.upper(), division_id),
        )
        conn.commit()


def delete_division(division_id: int) -> None:
    with get_connection() as conn:
        conn.execute("DELETE FROM divisions WHERE id = %s", (division_id,))
        conn.commit()


def get_divisions() -> list[dict]:
    with get_connection() as conn:
        rows = conn.execute("SELECT * FROM divisions ORDER BY semester, name").fetchall()
    return rows


def save_timetable_records(generation_id: str, records: list[dict]) -> None:
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.executemany(
                """
                INSERT INTO timetable (
                    division_id, semester, program, day, slot_index, time_slot,
                    subject_id, faculty_id, subject_name, faculty_name, subject_type, generation_id
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                """,
                [
                    (
                        r["division_id"],
                        r["semester"],
                        r["program"],
                        r["day"],
                        r["slot_index"],
                        r["time_slot"],
                        r["subject_id"],
                        r["faculty_id"],
                        r["subject_name"],
                        r["faculty_name"],
                        r["subject_type"],
                        generation_id,
                    )
                    for r in records
                ],
            )
        conn.commit()


def get_latest_generation_id() -> str | None:
    with get_connection() as conn:
        row = conn.execute(
            """
            SELECT generation_id
            FROM timetable
            GROUP BY generation_id
            ORDER BY MAX(created_at) DESC
            LIMIT 1
            """
        ).fetchone()
    return row["generation_id"] if row else None


def get_timetable_for_generation(generation_id: str | None) -> dict:
    if not generation_id:
        return {}

    with get_connection() as conn:
        rows = conn.execute(
            """
            SELECT t.*, d.name AS division_name
            FROM timetable t
            JOIN divisions d ON d.id = t.division_id
            WHERE t.generation_id = %s
            ORDER BY d.semester, d.name, t.slot_index
            """,
            (generation_id,),
        ).fetchall()

    result = {}
    for row in rows:
        division_key = f"Sem {row['semester']} - {row['division_name']} ({row['program']})"
        result.setdefault(division_key, {})
        result[division_key].setdefault(row["day"], {})
        result[division_key][row["day"]][row["slot_index"]] = {
            "subject_name": row["subject_name"],
            "faculty_name": row["faculty_name"],
            "subject_type": row["subject_type"],
        }

    return result


def get_dashboard_stats() -> dict:
    with get_connection() as conn:
        faculty_count = conn.execute("SELECT COUNT(*) AS c FROM faculty").fetchone()["c"]
        subject_count = conn.execute("SELECT COUNT(*) AS c FROM subjects").fetchone()["c"]
        division_count = conn.execute("SELECT COUNT(*) AS c FROM divisions").fetchone()["c"]
        timetable_count = conn.execute(
            "SELECT COUNT(DISTINCT generation_id) AS c FROM timetable"
        ).fetchone()["c"]

    return {
        "faculty": faculty_count,
        "subjects": subject_count,
        "divisions": division_count,
        "timetables": timetable_count,
    }


def get_settings() -> dict[str, Any]:
    with get_connection() as conn:
        row = conn.execute("SELECT * FROM settings WHERE id = 1").fetchone()
    return row or {}


def update_settings(payload: dict[str, Any]) -> None:
    with get_connection() as conn:
        conn.execute(
            """
            UPDATE settings
            SET institute_name = %s,
                logo_url = %s,
                academic_year = %s,
                semester_type = %s,
                default_program = %s,
                auto_resolution = %s,
                preference_weighting = %s,
                working_days = %s,
                time_slots = %s,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = 1
            """,
            (
                payload.get("institute_name"),
                payload.get("logo_url"),
                payload.get("academic_year"),
                payload.get("semester_type"),
                payload.get("default_program"),
                payload.get("auto_resolution"),
                payload.get("preference_weighting"),
                payload.get("working_days"),
                payload.get("time_slots"),
            ),
        )
        conn.commit()


def get_profile() -> dict[str, Any]:
    with get_connection() as conn:
        row = conn.execute("SELECT * FROM user_profile WHERE id = 1").fetchone()
    return row or {}


def update_profile(payload: dict[str, Any]) -> None:
    with get_connection() as conn:
        conn.execute(
            """
            UPDATE user_profile
            SET full_name = %s,
                role_title = %s,
                institute = %s,
                email = %s,
                phone = %s,
                theme = %s,
                contrast = %s,
                landing = %s,
                email_notifications = %s,
                auto_save = %s,
                compact_view = %s,
                slack_integration = %s,
                two_factor = %s,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = 1
            """,
            (
                payload.get("full_name"),
                payload.get("role_title"),
                payload.get("institute"),
                payload.get("email"),
                payload.get("phone"),
                payload.get("theme"),
                payload.get("contrast"),
                payload.get("landing"),
                payload.get("email_notifications"),
                payload.get("auto_save"),
                payload.get("compact_view"),
                payload.get("slack_integration"),
                payload.get("two_factor"),
            ),
        )
        conn.commit()


def add_room(
    name: str,
    capacity: int,
    room_type: str,
    status: str,
    equipment: list[str],
) -> None:
    with get_connection() as conn:
        conn.execute(
            """
            INSERT INTO infrastructure_rooms (name, capacity, room_type, status, equipment)
            VALUES (%s, %s, %s, %s, %s)
            """,
            (name, capacity, room_type, status, equipment),
        )
        conn.commit()


def get_rooms() -> list[dict]:
    with get_connection() as conn:
        rows = conn.execute(
            """
            SELECT *
            FROM infrastructure_rooms
            ORDER BY created_at DESC, id DESC
            """
        ).fetchall()
    return rows


def count_subjects_for_faculty(faculty_id: int) -> int:
    with get_connection() as conn:
        row = conn.execute(
            "SELECT COUNT(*) AS c FROM subjects WHERE assigned_faculty_id = %s",
            (faculty_id,),
        ).fetchone()
    return int(row["c"] if row else 0)


def faculty_exists(faculty_id: int) -> bool:
    with get_connection() as conn:
        row = conn.execute(
            "SELECT 1 FROM faculty WHERE id = %s",
            (faculty_id,),
        ).fetchone()
    return bool(row)


def division_has_timetable(division_id: int) -> bool:
    with get_connection() as conn:
        row = conn.execute(
            "SELECT 1 FROM timetable WHERE division_id = %s LIMIT 1",
            (division_id,),
        ).fetchone()
    return bool(row)


def search_entities(term: str) -> dict[str, list[dict]]:
    like_term = f"%{term}%"
    with get_connection() as conn:
        faculty = conn.execute(
            "SELECT * FROM faculty WHERE name ILIKE %s OR subject ILIKE %s",
            (like_term, like_term),
        ).fetchall()
        subjects = conn.execute(
            """
            SELECT s.*, f.name AS faculty_name
            FROM subjects s
            JOIN faculty f ON f.id = s.assigned_faculty_id
            WHERE s.name ILIKE %s OR s.subject_type ILIKE %s OR f.name ILIKE %s
            """,
            (like_term, like_term, like_term),
        ).fetchall()
        divisions = conn.execute(
            "SELECT * FROM divisions WHERE name ILIKE %s",
            (like_term,),
        ).fetchall()

    return {
        "faculty": faculty,
        "subjects": subjects,
        "divisions": divisions,
    }