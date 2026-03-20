"""
Smart Slot Database Layer
=========================

Tables
------
organisations        — Multi-tenant organisation accounts
users                — Authenticated users within an organisation
faculty              — Teaching staff with availability and workload limits
subjects             — Courses with type and faculty assignment
divisions            — Student groups by semester and program
timetable            — Generated schedule records (append-only, never updated in place)
infrastructure_rooms — Physical rooms with capacity and equipment
settings             — Application configuration (singleton, id=1)
user_profile         — Legacy single-user profile preferences (singleton, id=1)
share_tokens         — Public access tokens for sharing timetable views

Relationships
-------------
faculty              .org_id   → organisations.id  (CASCADE)
subjects             .org_id   → organisations.id  (CASCADE)
subjects .assigned_faculty_id → faculty.id         (RESTRICT — delete faculty only when no subjects)
divisions            .org_id   → organisations.id  (CASCADE)
timetable            .org_id   → organisations.id  (CASCADE)
timetable        .division_id  → divisions.id       (CASCADE)
timetable         .subject_id  → subjects.id        (CASCADE)
timetable          .faculty_id → faculty.id         (CASCADE)
timetable            .room_id  → infrastructure_rooms.id (SET NULL)

Denormalized Columns in `timetable`
------------------------------------
subject_name, faculty_name, subject_type are snapshot copies stored at generation time.
This preserves historical accuracy — if a faculty member is renamed, existing timetables
still show the name at the time of scheduling.
"""

from __future__ import annotations

import logging
import os
import datetime
from decimal import Decimal
from typing import Any

import psycopg
from psycopg.rows import dict_row

try:
    from psycopg_pool import ConnectionPool  # type: ignore
    _pool = None
except ImportError:
    _pool = None

logger = logging.getLogger(__name__)


def get_connection() -> psycopg.Connection:
    """Return a live DB connection."""
    if _pool is not None:
        return _pool.connection()  # type: ignore[return-value]
    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        raise RuntimeError("DATABASE_URL is not set. Configure Neon database access.")
    return psycopg.connect(database_url, row_factory=dict_row)


def _serialize_dict(row: dict) -> dict:
    """
    Converts a database row dictionary into a JSON-serializable format.
    Handles datetime, date, and Decimal.
    """
    serialized = {}
    for key, value in row.items():
        if isinstance(value, (datetime.datetime, datetime.date)):
            serialized[key] = value.isoformat()
        elif isinstance(value, Decimal):
            serialized[key] = float(value)
        else:
            serialized[key] = value
    return serialized


def init_db() -> None:
    """
    Create all tables with the strictly defined clean schema.
    No migrations or alters – only fresh CREATE TABLE statements.
    """
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
            # 1. Organisations
            cur.execute("""
                CREATE TABLE IF NOT EXISTS organisations (
                    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
                    name TEXT NOT NULL,
                    slug TEXT NOT NULL,
                    plan TEXT NOT NULL DEFAULT 'free',
                    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                    CONSTRAINT uq_organisations_slug UNIQUE(slug)
                )
            """)

            # 2. Users
            cur.execute("""
                CREATE TABLE IF NOT EXISTS users (
                    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
                    org_id INTEGER NOT NULL,
                    email TEXT NOT NULL,
                    password_hash TEXT NOT NULL,
                    role TEXT NOT NULL DEFAULT 'admin',
                    full_name TEXT,
                    is_active BOOLEAN NOT NULL DEFAULT true,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                    CONSTRAINT uq_users_email UNIQUE(email),
                    CONSTRAINT chk_users_role CHECK (role IN ('admin', 'faculty', 'viewer')),
                    CONSTRAINT fk_users_organisations FOREIGN KEY(org_id) REFERENCES organisations(id) ON DELETE CASCADE
                )
            """)

            # 3. Faculty
            cur.execute("""
                CREATE TABLE IF NOT EXISTS faculty (
                    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
                    org_id INTEGER NOT NULL,
                    name TEXT NOT NULL,
                    subject TEXT NOT NULL,
                    available_time TEXT NOT NULL,
                    max_lectures_per_day INTEGER NOT NULL,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                    CONSTRAINT chk_faculty_max_lectures CHECK (max_lectures_per_day > 0),
                    CONSTRAINT fk_faculty_organisations FOREIGN KEY (org_id) REFERENCES organisations(id) ON DELETE CASCADE
                )
            """)

            # 4. Subjects
            cur.execute("""
                CREATE TABLE IF NOT EXISTS subjects (
                    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
                    org_id INTEGER NOT NULL,
                    name TEXT NOT NULL,
                    subject_type TEXT NOT NULL,
                    assigned_faculty_id INTEGER NOT NULL,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                    CONSTRAINT chk_subjects_type CHECK (subject_type IN ('Class', 'Lab', 'Tutorial')),
                    CONSTRAINT fk_subjects_organisations FOREIGN KEY (org_id) REFERENCES organisations(id) ON DELETE CASCADE,
                    CONSTRAINT fk_subjects_faculty FOREIGN KEY (assigned_faculty_id) REFERENCES faculty(id) ON DELETE RESTRICT
                )
            """)

            # 5. Divisions
            cur.execute("""
                CREATE TABLE IF NOT EXISTS divisions (
                    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
                    org_id INTEGER NOT NULL,
                    name TEXT NOT NULL,
                    semester INTEGER NOT NULL,
                    program TEXT NOT NULL,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                    CONSTRAINT chk_divisions_semester CHECK (semester > 0),
                    CONSTRAINT chk_divisions_program CHECK (program IN ('UG', 'PG')),
                    CONSTRAINT fk_divisions_organisations FOREIGN KEY (org_id) REFERENCES organisations(id) ON DELETE CASCADE
                )
            """)

            # 6. Infrastructure Rooms
            cur.execute("""
                CREATE TABLE IF NOT EXISTS infrastructure_rooms (
                    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
                    org_id INTEGER NOT NULL,
                    name TEXT NOT NULL,
                    capacity INTEGER NOT NULL,
                    room_type TEXT NOT NULL,
                    status TEXT NOT NULL,
                    equipment TEXT[] NOT NULL DEFAULT '{}',
                    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                    CONSTRAINT chk_rooms_capacity CHECK (capacity > 0),
                    CONSTRAINT fk_rooms_organisations FOREIGN KEY (org_id) REFERENCES organisations(id) ON DELETE CASCADE
                )
            """)

            # 7. Timetable
            cur.execute("""
                CREATE TABLE IF NOT EXISTS timetable (
                    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
                    org_id INTEGER NOT NULL,
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
                    status TEXT NOT NULL DEFAULT 'draft',
                    room_id INTEGER,
                    room_name TEXT,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                    CONSTRAINT chk_timetable_status CHECK (status IN ('draft', 'reviewed', 'published')),
                    CONSTRAINT chk_timetable_program CHECK (program IN ('UG', 'PG')),
                    CONSTRAINT fk_timetable_organisations FOREIGN KEY (org_id) REFERENCES organisations(id) ON DELETE CASCADE,
                    CONSTRAINT fk_timetable_divisions FOREIGN KEY (division_id) REFERENCES divisions(id) ON DELETE CASCADE,
                    CONSTRAINT fk_timetable_subjects FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE,
                    CONSTRAINT fk_timetable_faculty FOREIGN KEY (faculty_id) REFERENCES faculty(id) ON DELETE CASCADE,
                    CONSTRAINT fk_timetable_rooms FOREIGN KEY (room_id) REFERENCES infrastructure_rooms(id) ON DELETE SET NULL
                )
            """)

            # 8. Settings
            cur.execute("""
                CREATE TABLE IF NOT EXISTS settings (
                    id INTEGER PRIMARY KEY,
                    org_id INTEGER,
                    institute_name TEXT NOT NULL DEFAULT '',
                    logo_url TEXT NOT NULL DEFAULT '',
                    academic_year TEXT NOT NULL DEFAULT '',
                    semester_type TEXT NOT NULL DEFAULT 'odd',
                    default_program TEXT NOT NULL DEFAULT 'UG',
                    auto_resolution BOOLEAN NOT NULL DEFAULT true,
                    preference_weighting INTEGER NOT NULL DEFAULT 60,
                    working_days TEXT[] NOT NULL,
                    time_slots TEXT[] NOT NULL,
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                    CONSTRAINT chk_settings_id CHECK (id = 1),
                    CONSTRAINT chk_settings_semester CHECK (semester_type IN ('odd', 'even')),
                    CONSTRAINT chk_settings_program CHECK (default_program IN ('UG', 'PG')),
                    CONSTRAINT fk_settings_organisations FOREIGN KEY (org_id) REFERENCES organisations(id) ON DELETE CASCADE
                )
            """)

            # 9. User Profile
            cur.execute("""
                CREATE TABLE IF NOT EXISTS user_profile (
                    id INTEGER PRIMARY KEY,
                    full_name TEXT NOT NULL DEFAULT '',
                    role_title TEXT NOT NULL DEFAULT '',
                    institute TEXT NOT NULL DEFAULT '',
                    email TEXT NOT NULL DEFAULT '',
                    phone TEXT NOT NULL DEFAULT '',
                    theme TEXT NOT NULL DEFAULT 'dark',
                    contrast TEXT NOT NULL DEFAULT 'standard',
                    landing TEXT NOT NULL DEFAULT 'dashboard',
                    email_notifications BOOLEAN NOT NULL DEFAULT true,
                    auto_save BOOLEAN NOT NULL DEFAULT true,
                    compact_view BOOLEAN NOT NULL DEFAULT false,
                    slack_integration BOOLEAN NOT NULL DEFAULT false,
                    two_factor BOOLEAN NOT NULL DEFAULT true,
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                    CONSTRAINT chk_profile_id CHECK (id = 1)
                )
            """)

            # 10. Share Tokens
            cur.execute("""
                CREATE TABLE IF NOT EXISTS share_tokens (
                    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
                    token TEXT NOT NULL DEFAULT gen_random_uuid()::text,
                    generation_id TEXT NOT NULL,
                    org_id INTEGER NOT NULL,
                    created_by INTEGER,
                    expires_at TIMESTAMPTZ,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                    CONSTRAINT uq_share_tokens_token UNIQUE (token),
                    CONSTRAINT fk_share_tokens_org FOREIGN KEY (org_id) REFERENCES organisations(id) ON DELETE CASCADE,
                    CONSTRAINT fk_share_tokens_users FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
                )
            """)

            # Seed default organisation to satisfy FK requirements from older setups
            cur.execute("""
                INSERT INTO organisations (name, slug, plan)
                VALUES ('Default Organisation', 'default', 'free')
                ON CONFLICT (slug) DO NOTHING
            """)

            # Seed settings
            cur.execute("""
                INSERT INTO settings (
                    id, institute_name, logo_url, academic_year,
                    semester_type, default_program, auto_resolution,
                    preference_weighting, working_days, time_slots
                )
                VALUES (1, '', '', '', 'odd', 'UG', true, 60, %s, %s)
                ON CONFLICT (id) DO NOTHING
            """, (default_days, default_slots))

            # Seed user_profile
            cur.execute("""
                INSERT INTO user_profile (
                    id, full_name, role_title, institute, email, phone
                )
                VALUES (1, '', '', '', '', '')
                ON CONFLICT (id) DO NOTHING
            """)

        conn.commit()
    logger.info("Database cleanly initialized.")

def migrate_db() -> None:
    """
    Idempotent database migration. Safe to run on every application startup.
    Creates tables, adds missing columns, removes unused columns, adds indexes and constraints.
    """
    logger.info("Starting database schema migration...")
    
    with get_connection() as conn:
        with conn.cursor() as cur:
            # Step 1: Create missing tables (idempotent)
            cur.execute("""
                CREATE TABLE IF NOT EXISTS share_tokens (
                    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
                    token TEXT NOT NULL DEFAULT gen_random_uuid()::text,
                    generation_id TEXT NOT NULL,
                    org_id INTEGER NOT NULL,
                    created_by INTEGER,
                    expires_at TIMESTAMPTZ,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                    CONSTRAINT uq_share_tokens_token UNIQUE (token),
                    CONSTRAINT fk_share_tokens_org FOREIGN KEY (org_id) REFERENCES organisations(id) ON DELETE CASCADE,
                    CONSTRAINT fk_share_tokens_users FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
                )
            """)

            # Step 2: Add missing columns
            # In PostgreSQL, we can add columns idempotently
            columns_to_add = [
                ("organisations", "plan TEXT NOT NULL DEFAULT 'free'"),
                ("faculty", "org_id INTEGER REFERENCES organisations(id) ON DELETE CASCADE"),
                ("subjects", "org_id INTEGER REFERENCES organisations(id) ON DELETE CASCADE"),
                ("divisions", "org_id INTEGER REFERENCES organisations(id) ON DELETE CASCADE"),
                ("infrastructure_rooms", "org_id INTEGER REFERENCES organisations(id) ON DELETE CASCADE"),
                ("settings", "org_id INTEGER REFERENCES organisations(id) ON DELETE CASCADE"),
                ("timetable", "org_id INTEGER REFERENCES organisations(id) ON DELETE CASCADE"),
                ("timetable", "status TEXT NOT NULL DEFAULT 'draft'"),
                ("timetable", "room_id INTEGER REFERENCES infrastructure_rooms(id) ON DELETE SET NULL"),
                ("timetable", "room_name TEXT")
            ]
            
            for table, coldef in columns_to_add:
                col_name = coldef.split()[0]
                cur.execute(f"""
                DO $$
                BEGIN
                    IF NOT EXISTS (
                        SELECT 1 FROM information_schema.columns 
                        WHERE table_name='{table}' AND column_name='{col_name}'
                    ) THEN
                        ALTER TABLE {table} ADD COLUMN {coldef};
                    END IF;
                END $$;
                """)
                
            # Step 3: Identify unused columns (Audit verified none to drop explicitly other than refactored legacy structures)
            # None to drop safely.

            # Step 4: Add Missing Constraints (Foreign Keys, NOT NULL, CHECK, UNIQUE)
            constraints = [
                # user_profile and settings constraints checks
                ("settings", "chk_settings_id", "CHECK (id = 1)"),
                ("user_profile", "chk_profile_id", "CHECK (id = 1)"),
                
                # Check constraints
                ("faculty", "chk_faculty_max_lectures", "CHECK (max_lectures_per_day > 0)"),
                ("subjects", "chk_subjects_type", "CHECK (subject_type IN ('Class', 'Lab', 'Tutorial'))"),
                ("divisions", "chk_divisions_semester", "CHECK (semester > 0)"),
                ("divisions", "chk_divisions_program", "CHECK (program IN ('UG', 'PG'))"),
                ("infrastructure_rooms", "chk_rooms_capacity", "CHECK (capacity > 0)"),
                
                ("timetable", "chk_timetable_status", "CHECK (status IN ('draft', 'reviewed', 'published'))"),
                ("timetable", "chk_timetable_program", "CHECK (program IN ('UG', 'PG'))"),
                
                # Unique constraints
                ("organisations", "uq_organisations_slug", "UNIQUE (slug)"),
                ("users", "uq_users_email", "UNIQUE (email)"),
                ("share_tokens", "uq_share_tokens_token", "UNIQUE (token)"),
                
                # Foreign key checks on timetable
                ("timetable", "fk_timetable_organisations", "FOREIGN KEY (org_id) REFERENCES organisations(id) ON DELETE CASCADE"),
                ("timetable", "fk_timetable_divisions", "FOREIGN KEY (division_id) REFERENCES divisions(id) ON DELETE CASCADE"),
                ("timetable", "fk_timetable_subjects", "FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE"),
                ("timetable", "fk_timetable_faculty", "FOREIGN KEY (faculty_id) REFERENCES faculty(id) ON DELETE CASCADE"),
            ]
            
            for table, constraint_name, definition in constraints:
                cur.execute(f"""
                DO $$
                BEGIN
                    IF NOT EXISTS (
                        SELECT 1 FROM pg_constraint c
                        JOIN pg_class t ON c.conrelid = t.oid
                        WHERE t.relname = '{table}' AND c.conname = '{constraint_name}'
                    ) THEN
                        ALTER TABLE {table} ADD CONSTRAINT {constraint_name} {definition};
                    END IF;
                EXCEPTION
                    WHEN foreign_key_violation THEN
                        NULL;  -- Ignore if existing rows violate the new FK (useful for development)
                    WHEN check_violation THEN
                        NULL;
                    WHEN unique_violation THEN
                        NULL;
                END $$;
                """)

            # Step 5: Create Indexes for Performance
            indexes = [
                "CREATE INDEX IF NOT EXISTS idx_timetable_generation_id ON timetable(generation_id)",
                "CREATE INDEX IF NOT EXISTS idx_timetable_faculty_day_slot ON timetable(faculty_id, day, slot_index)",
                "CREATE INDEX IF NOT EXISTS idx_timetable_division_id ON timetable(division_id)",
                "CREATE INDEX IF NOT EXISTS idx_subjects_faculty_id ON subjects(assigned_faculty_id)",
                "CREATE INDEX IF NOT EXISTS idx_faculty_name ON faculty(name)",
                "CREATE INDEX IF NOT EXISTS idx_faculty_org_id ON faculty(org_id)",
                "CREATE INDEX IF NOT EXISTS idx_subjects_org_id ON subjects(org_id)",
                "CREATE INDEX IF NOT EXISTS idx_divisions_org_id ON divisions(org_id)",
            ]
            for idx in indexes:
                cur.execute(idx)

            # Step 6 & 7: Seed Singletons (Handled natively in init_db which is heavily idempotent with ON CONFLICT DO NOTHING)
        conn.commit()
    logger.info("Database migration completed successfully.")

# ---------------------------------------------------------------------------
# Organisation & User Helpers (Preserved for Auth)
# ---------------------------------------------------------------------------
def create_organisation(name: str, slug: str) -> int:
    with get_connection() as conn:
        row = conn.execute(
            """
            INSERT INTO organisations (name, slug)
            VALUES (%s, %s) RETURNING id
            """,
            (name, slug)
        ).fetchone()
        conn.commit()
    return int(row["id"]) if isinstance(row, dict) else int(row[0])


def org_slug_exists(slug: str) -> bool:
    with get_connection() as conn:
        row = conn.execute("SELECT 1 FROM organisations WHERE slug = %s", (slug,)).fetchone()
    return bool(row)


def create_user(
    org_id: int, email: str, password_hash: str, full_name: str, role: str = "admin"
) -> int:
    with get_connection() as conn:
        row = conn.execute(
            """
            INSERT INTO users (org_id, email, password_hash, full_name, role)
            VALUES (%s, %s, %s, %s, %s) RETURNING id
            """,
            (org_id, email, password_hash, full_name, role)
        ).fetchone()
        conn.commit()
    return int(row["id"]) if isinstance(row, dict) else int(row[0])


def get_user_by_email(email: str) -> dict | None:
    with get_connection() as conn:
        row = conn.execute(
            "SELECT * FROM users WHERE email = %s AND is_active = true", (email,)
        ).fetchone()
    return _serialize_dict(dict(row)) if row else None


def get_user_by_id(user_id: int) -> dict | None:
    with get_connection() as conn:
        row = conn.execute(
            "SELECT * FROM users WHERE id = %s AND is_active = true", (user_id,)
        ).fetchone()
    return _serialize_dict(dict(row)) if row else None


# ---------------------------------------------------------------------------
# Faculty
# ---------------------------------------------------------------------------
def get_faculty(org_id: int) -> list[dict]:
    """Retrieve all faculty for the organisation."""
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT * FROM faculty WHERE org_id = %s ORDER BY id DESC", (org_id,)
        ).fetchall()
    return [_serialize_dict(dict(r)) for r in rows]


def get_faculty_by_id(org_id: int, faculty_id: int) -> dict | None:
    """Retrieve a specific faculty member by ID."""
    with get_connection() as conn:
        row = conn.execute(
            "SELECT * FROM faculty WHERE id = %s AND org_id = %s", (faculty_id, org_id)
        ).fetchone()
    return _serialize_dict(dict(row)) if row else None


def add_faculty(
    org_id: int, name: str, subject: str, available_time: str, max_lectures_per_day: int
) -> dict:
    """Insert a new faculty member and return the inserted row."""
    with get_connection() as conn:
        row = conn.execute(
            """
            INSERT INTO faculty (org_id, name, subject, available_time, max_lectures_per_day)
            VALUES (%s, %s, %s, %s, %s)
            RETURNING *
            """,
            (org_id, name, subject, available_time, max_lectures_per_day)
        ).fetchone()
        conn.commit()
    return _serialize_dict(dict(row))


def update_faculty(
    org_id: int, faculty_id: int, name: str, subject: str, available_time: str, max_lectures_per_day: int
) -> dict | None:
    """Update a faculty member and return the updated row, or None if not found."""
    with get_connection() as conn:
        row = conn.execute(
            """
            UPDATE faculty
            SET name = %s, subject = %s, available_time = %s, max_lectures_per_day = %s
            WHERE id = %s AND org_id = %s
            RETURNING *
            """,
            (name, subject, available_time, max_lectures_per_day, faculty_id, org_id)
        ).fetchone()
        conn.commit()
    return _serialize_dict(dict(row)) if row else None


def delete_faculty(org_id: int, faculty_id: int) -> bool:
    """Delete a faculty member. Returns True if deleted, False if not found."""
    with get_connection() as conn:
        result = conn.execute(
            "DELETE FROM faculty WHERE id = %s AND org_id = %s", (faculty_id, org_id)
        )
        conn.commit()
        return result.rowcount > 0


def count_subjects_for_faculty(org_id: int, faculty_id: int) -> int:
    """Count how many subjects are assigned to this faculty."""
    with get_connection() as conn:
        row = conn.execute(
            "SELECT COUNT(*) as c FROM subjects WHERE assigned_faculty_id = %s AND org_id = %s",
            (faculty_id, org_id)
        ).fetchone()
    return int(row["c"]) if isinstance(row, dict) else int(row[0])


def faculty_exists(org_id: int, faculty_id: int) -> bool:
    """Check if a faculty member exists."""
    with get_connection() as conn:
        row = conn.execute(
            "SELECT 1 FROM faculty WHERE id = %s AND org_id = %s", (faculty_id, org_id)
        ).fetchone()
    return bool(row)


# ---------------------------------------------------------------------------
# Subjects
# ---------------------------------------------------------------------------
def get_subjects(org_id: int) -> list[dict]:
    """Retrieve all subjects, joined with faculty_name."""
    with get_connection() as conn:
        rows = conn.execute(
            """
            SELECT s.*, f.name AS faculty_name
            FROM subjects s
            JOIN faculty f ON f.id = s.assigned_faculty_id
            WHERE s.org_id = %s
            ORDER BY s.id DESC
            """,
            (org_id,)
        ).fetchall()
    return [_serialize_dict(dict(r)) for r in rows]


def get_subject_by_id(org_id: int, subject_id: int) -> dict | None:
    """Retrieve a subject by ID."""
    with get_connection() as conn:
        row = conn.execute(
            """
            SELECT s.*, f.name AS faculty_name
            FROM subjects s
            JOIN faculty f ON f.id = s.assigned_faculty_id
            WHERE s.id = %s AND s.org_id = %s
            """, (subject_id, org_id)
        ).fetchone()
    return _serialize_dict(dict(row)) if row else None


def add_subject(
    org_id: int, name: str, subject_type: str, assigned_faculty_id: int
) -> dict:
    """Insert a new subject and return the inserted row."""
    with get_connection() as conn:
        row = conn.execute(
            """
            INSERT INTO subjects (org_id, name, subject_type, assigned_faculty_id)
            VALUES (%s, %s, %s, %s)
            RETURNING *
            """,
            (org_id, name, subject_type, assigned_faculty_id)
        ).fetchone()
        conn.commit()
    return _serialize_dict(dict(row))


def update_subject(
    org_id: int, subject_id: int, name: str, subject_type: str, assigned_faculty_id: int
) -> dict | None:
    """Update a subject and return the updated row, or None if not found."""
    with get_connection() as conn:
        row = conn.execute(
            """
            UPDATE subjects
            SET name = %s, subject_type = %s, assigned_faculty_id = %s
            WHERE id = %s AND org_id = %s
            RETURNING *
            """,
            (name, subject_type, assigned_faculty_id, subject_id, org_id)
        ).fetchone()
        conn.commit()
    return _serialize_dict(dict(row)) if row else None


def delete_subject(org_id: int, subject_id: int) -> bool:
    """Delete a subject. Returns True if deleted, False if not found."""
    with get_connection() as conn:
        result = conn.execute(
            "DELETE FROM subjects WHERE id = %s AND org_id = %s", (subject_id, org_id)
        )
        conn.commit()
        return result.rowcount > 0


def subject_exists(org_id: int, subject_id: int) -> bool:
    """Check if a subject exists."""
    with get_connection() as conn:
        row = conn.execute(
            "SELECT 1 FROM subjects WHERE id = %s AND org_id = %s", (subject_id, org_id)
        ).fetchone()
    return bool(row)


# ---------------------------------------------------------------------------
# Divisions
# ---------------------------------------------------------------------------
def get_divisions(org_id: int) -> list[dict]:
    """Retrieve all divisions."""
    with get_connection() as conn:
        rows = conn.execute(
            """
            SELECT * FROM divisions
            WHERE org_id = %s
            ORDER BY semester, name
            """,
            (org_id,)
        ).fetchall()
    return [_serialize_dict(dict(r)) for r in rows]


def get_division_by_id(org_id: int, division_id: int) -> dict | None:
    """Retrieve a division by ID."""
    with get_connection() as conn:
        row = conn.execute(
            "SELECT * FROM divisions WHERE id = %s AND org_id = %s", (division_id, org_id)
        ).fetchone()
    return _serialize_dict(dict(row)) if row else None


def add_division(org_id: int, name: str, semester: int, program: str) -> dict:
    """Insert a new division and return the structured dict."""
    with get_connection() as conn:
        row = conn.execute(
            """
            INSERT INTO divisions (org_id, name, semester, program)
            VALUES (%s, %s, %s, %s)
            RETURNING *
            """,
            (org_id, name, semester, program.upper())
        ).fetchone()
        conn.commit()
    return _serialize_dict(dict(row))


def update_division(
    org_id: int, division_id: int, name: str, semester: int, program: str
) -> dict | None:
    """Update a division and return it."""
    with get_connection() as conn:
        row = conn.execute(
            """
            UPDATE divisions
            SET name = %s, semester = %s, program = %s
            WHERE id = %s AND org_id = %s
            RETURNING *
            """,
            (name, semester, program.upper(), division_id, org_id)
        ).fetchone()
        conn.commit()
    return _serialize_dict(dict(row)) if row else None


def delete_division(org_id: int, division_id: int) -> bool:
    """Delete a division. Returns true if affected."""
    with get_connection() as conn:
        result = conn.execute(
            "DELETE FROM divisions WHERE id = %s AND org_id = %s", (division_id, org_id)
        )
        conn.commit()
        return result.rowcount > 0


def division_has_timetable(org_id: int, division_id: int) -> bool:
    """Check if the division is referenced in any timetable generations."""
    with get_connection() as conn:
        row = conn.execute(
            "SELECT 1 FROM timetable WHERE division_id = %s AND org_id = %s LIMIT 1",
            (division_id, org_id)
        ).fetchone()
    return bool(row)

# ---------------------------------------------------------------------------
# Timetable
# ---------------------------------------------------------------------------
def save_timetable_records(
    org_id: int, generation_id: str, records: list[dict]
) -> None:
    """Save finalized generation to the database."""
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.executemany(
                """
                INSERT INTO timetable (
                    org_id, division_id, semester, program, day, slot_index,
                    time_slot, subject_id, faculty_id, subject_name,
                    faculty_name, subject_type, generation_id,
                    room_id, room_name
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                """,
                [
                    (
                        org_id,
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
                        r.get("room_id"),
                        r.get("room_name"),
                    )
                    for r in records
                ],
            )
        conn.commit()


def get_latest_generation_id(org_id: int) -> str | None:
    """Get the most recent finalized generation."""
    with get_connection() as conn:
        row = conn.execute(
            """
            SELECT generation_id
            FROM timetable
            WHERE org_id = %s
            ORDER BY created_at DESC
            LIMIT 1
            """,
            (org_id,),
        ).fetchone()
    return row["generation_id"] if row else None


def get_all_generation_ids(org_id: int) -> list[str]:
    """Return list of all generation_ids ordered by most recent first."""
    with get_connection() as conn:
        rows = conn.execute(
            """
            SELECT generation_id
            FROM timetable
            WHERE org_id = %s
            GROUP BY generation_id
            ORDER BY MAX(created_at) DESC
            """,
            (org_id,)
        ).fetchall()
    return [r["generation_id"] for r in rows]


def get_timetable_for_generation(org_id: int, generation_id: str | None) -> dict:
    """Return the structured calendar nested dict."""
    if not generation_id:
        return {}

    with get_connection() as conn:
        rows = conn.execute(
            """
            SELECT t.*, d.name AS division_name
            FROM timetable t
            JOIN divisions d ON d.id = t.division_id
            WHERE t.generation_id = %s AND t.org_id = %s
            ORDER BY d.semester, d.name, t.slot_index
            """,
            (generation_id, org_id),
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
            "room_name": row.get("room_name"),
        }
    return result


def delete_generation(org_id: int, generation_id: str) -> bool:
    """Cascade delete the given generation block."""
    with get_connection() as conn:
        result = conn.execute(
            "DELETE FROM timetable WHERE generation_id = %s AND org_id = %s",
            (generation_id, org_id)
        )
        conn.commit()
        return result.rowcount > 0


def get_generation_summaries(org_id: int, limit: int = 10) -> list[dict]:
    """Return recent generations with slot/division/faculty counts and status."""
    with get_connection() as conn:
        rows = conn.execute(
            """
            SELECT
                generation_id,
                MAX(status) AS status,
                COUNT(*) AS slots,
                COUNT(DISTINCT division_id) AS divisions,
                COUNT(DISTINCT faculty_id) AS faculty,
                MAX(created_at) AS created_at
            FROM timetable
            WHERE org_id = %s
            GROUP BY generation_id
            ORDER BY MAX(created_at) DESC
            LIMIT %s
            """,
            (org_id, limit),
        ).fetchall()
    return [_serialize_dict(dict(r)) for r in rows]


def update_generation_status(org_id: int, generation_id: str, status: str) -> bool:
    """Update status for every timetable row of a given generation."""
    with get_connection() as conn:
        res = conn.execute(
            """
            UPDATE timetable
            SET status = %s
            WHERE generation_id = %s AND org_id = %s
            """,
            (status, generation_id, org_id),
        )
        conn.commit()
        return res.rowcount > 0


# ---------------------------------------------------------------------------
# Infrastructure rooms
# ---------------------------------------------------------------------------
def get_rooms(org_id: int, equipment_filter: list[str] | None = None) -> list[dict]:
    """Retrieve filtered or all rooms."""
    with get_connection() as conn:
        if equipment_filter:
            rows = conn.execute(
                """
                SELECT * FROM infrastructure_rooms
                WHERE org_id = %s AND equipment @> %s
                ORDER BY name
                """,
                (org_id, equipment_filter),
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT * FROM infrastructure_rooms WHERE org_id = %s ORDER BY name",
                (org_id,),
            ).fetchall()
    return [_serialize_dict(dict(r)) for r in rows]


def add_room(
    org_id: int, name: str, capacity: int, room_type: str, status: str, equipment: list[str]
) -> dict:
    """Add a new architectural room."""
    with get_connection() as conn:
        row = conn.execute(
            """
            INSERT INTO infrastructure_rooms (org_id, name, capacity, room_type, status, equipment)
            VALUES (%s, %s, %s, %s, %s, %s)
            RETURNING *
            """,
            (org_id, name, capacity, room_type, status, equipment),
        ).fetchone()
        conn.commit()
    return _serialize_dict(dict(row))


def update_room(
    org_id: int, room_id: int, name: str, capacity: int, room_type: str, status: str, equipment: list[str]
) -> dict | None:
    """Mutate existing architectural room definition."""
    with get_connection() as conn:
        row = conn.execute(
            """
            UPDATE infrastructure_rooms
            SET name = %s, capacity = %s, room_type = %s, status = %s, equipment = %s
            WHERE id = %s AND org_id = %s
            RETURNING *
            """,
            (name, capacity, room_type, status, equipment, room_id, org_id),
        ).fetchone()
        conn.commit()
    return _serialize_dict(dict(row)) if row else None


def delete_room(org_id: int, room_id: int) -> bool:
    """Delete a room instance natively from the platform."""
    with get_connection() as conn:
        result = conn.execute(
            "DELETE FROM infrastructure_rooms WHERE id = %s AND org_id = %s",
            (room_id, org_id)
        )
        conn.commit()
        return result.rowcount > 0


def get_equipment_filters(org_id: int) -> list[str]:
    """Returns sorted deduplicated list of all equipment values across all rooms."""
    with get_connection() as conn:
        # A smart postgres method to extract all nested arrays and unnest them directly
        rows = conn.execute(
            """
            SELECT DISTINCT unnest(equipment) AS eq
            FROM infrastructure_rooms
            WHERE org_id = %s
            ORDER BY eq
            """,
            (org_id,)
        ).fetchall()
    return [r["eq"] for r in rows]


# ---------------------------------------------------------------------------
# Settings (Singleton pattern)
# ---------------------------------------------------------------------------
def get_settings(org_id: int = 1) -> dict:
    """Always returns a dict — never None."""
    with get_connection() as conn:
        row = conn.execute("SELECT * FROM settings WHERE id = 1").fetchone()
    # It always exists due to init_db seeding.
    return _serialize_dict(dict(row))


def update_settings(payload: dict) -> dict:
    """Update settings and return the exact updated row."""
    with get_connection() as conn:
        row = conn.execute(
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
                updated_at = now()
            WHERE id = 1
            RETURNING *
            """,
            (
                payload.get("institute_name", ""),
                payload.get("logo_url", ""),
                payload.get("academic_year", ""),
                payload.get("semester_type", "odd"),
                payload.get("default_program", "UG"),
                payload.get("auto_resolution", True),
                payload.get("preference_weighting", 60),
                payload.get("working_days", []),
                payload.get("time_slots", []),
            ),
        ).fetchone()
        conn.commit()
    return _serialize_dict(dict(row))


# ---------------------------------------------------------------------------
# User profile (Singleton pattern globally shared for now)
# ---------------------------------------------------------------------------
def get_profile() -> dict:
    """Always returns a dict."""
    with get_connection() as conn:
        row = conn.execute("SELECT * FROM user_profile WHERE id = 1").fetchone()
    return _serialize_dict(dict(row))


def update_profile(payload: dict) -> dict:
    with get_connection() as conn:
        row = conn.execute(
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
                updated_at = now()
            WHERE id = 1
            RETURNING *
            """,
            (
                payload.get("full_name", ""),
                payload.get("role_title", ""),
                payload.get("institute", ""),
                payload.get("email", ""),
                payload.get("phone", ""),
                payload.get("theme", "dark"),
                payload.get("contrast", "standard"),
                payload.get("landing", "dashboard"),
                payload.get("email_notifications", True),
                payload.get("auto_save", True),
                payload.get("compact_view", False),
                payload.get("slack_integration", False),
                payload.get("two_factor", True),
            ),
        ).fetchone()
        conn.commit()
    return _serialize_dict(dict(row))

# ---------------------------------------------------------------------------
# Dashboard stats
# ---------------------------------------------------------------------------
def get_dashboard_stats(org_id: int) -> dict:
    """Returns {faculty: int, subjects: int, divisions: int, timetables: int}"""
    with get_connection() as conn:
        faculty_count = conn.execute(
            "SELECT COUNT(*) AS c FROM faculty WHERE org_id = %s", (org_id,)
        ).fetchone()["c"]
        subject_count = conn.execute(
            "SELECT COUNT(*) AS c FROM subjects WHERE org_id = %s", (org_id,)
        ).fetchone()["c"]
        division_count = conn.execute(
            "SELECT COUNT(*) AS c FROM divisions WHERE org_id = %s", (org_id,)
        ).fetchone()["c"]
        timetable_count = conn.execute(
            "SELECT COUNT(DISTINCT generation_id) AS c FROM timetable WHERE org_id = %s",
            (org_id,),
        ).fetchone()["c"]

    return {
        "faculty": int(faculty_count),
        "subjects": int(subject_count),
        "divisions": int(division_count),
        "timetables": int(timetable_count),
    }

# ---------------------------------------------------------------------------
# Search
# ---------------------------------------------------------------------------
def search_entities(org_id: int, term: str) -> dict[str, list[dict]]:
    """Returns {faculty: [...], subjects: [...], divisions: [...]} matching ILIKE query."""
    term_pattern = f"%{term}%"
    with get_connection() as conn:
        faculty = conn.execute(
            "SELECT * FROM faculty WHERE org_id = %s AND name ILIKE %s ORDER BY name",
            (org_id, term_pattern)
        ).fetchall()
        
        subjects = conn.execute(
            """
            SELECT s.*, f.name AS faculty_name
            FROM subjects s
            JOIN faculty f ON s.assigned_faculty_id = f.id
            WHERE s.org_id = %s AND (s.name ILIKE %s OR f.name ILIKE %s)
            ORDER BY s.name
            """,
            (org_id, term_pattern, term_pattern)
        ).fetchall()
        
        divisions = conn.execute(
            "SELECT * FROM divisions WHERE org_id = %s AND (name ILIKE %s OR program ILIKE %s) ORDER BY name",
            (org_id, term_pattern, term_pattern)
        ).fetchall()
        
    return {
        "faculty": [_serialize_dict(dict(r)) for r in faculty],
        "subjects": [_serialize_dict(dict(r)) for r in subjects],
        "divisions": [_serialize_dict(dict(r)) for r in divisions]
    }

# ---------------------------------------------------------------------------
# Reports
# ---------------------------------------------------------------------------
def get_report_data(org_id: int, generation_id: str, days: list[str], teaching_slot_count: int) -> dict:
    """Returns {total_lectures, faculty_utilization, student_free_slots, day_counts, peak_day}"""
    if not generation_id:
        return {
            "total_lectures": 0,
            "faculty_utilization": "0%",
            "student_free_slots": 0,
            "day_counts": {},
            "peak_day": "None",
        }

    with get_connection() as conn:
        total_lectures = conn.execute(
            "SELECT COUNT(*) as c FROM timetable WHERE generation_id = %s AND org_id = %s",
            (generation_id, org_id)
        ).fetchone()["c"]
        
        faculty_count = conn.execute(
            "SELECT COUNT(DISTINCT faculty_id) as c FROM timetable WHERE generation_id = %s AND org_id = %s",
            (generation_id, org_id)
        ).fetchone()["c"]
        
        division_count = conn.execute(
            "SELECT COUNT(DISTINCT division_id) as c FROM timetable WHERE generation_id = %s AND org_id = %s",
            (generation_id, org_id)
        ).fetchone()["c"]

        total_possible_slots_faculty = faculty_count * len(days) * teaching_slot_count
        fac_util = 0.0
        if total_possible_slots_faculty > 0:
            fac_util = (total_lectures / total_possible_slots_faculty) * 100

        total_possible_slots_students = division_count * len(days) * teaching_slot_count
        student_free_slots = max(0, total_possible_slots_students - total_lectures)

        day_counts_rows = conn.execute(
            """
            SELECT day, COUNT(*) as c 
            FROM timetable 
            WHERE generation_id = %s AND org_id = %s 
            GROUP BY day
            ORDER BY c DESC
            """,
            (generation_id, org_id)
        ).fetchall()
        
    day_counts = {r["day"]: r["c"] for r in day_counts_rows}
    peak_day = day_counts_rows[0]["day"] if day_counts_rows else "None"

    return {
        "total_lectures": total_lectures,
        "faculty_utilization": f"{fac_util:.1f}%",
        "student_free_slots": student_free_slots,
        "day_counts": day_counts,
        "peak_day": peak_day,
    }

# ---------------------------------------------------------------------------
# Conflicts
# ---------------------------------------------------------------------------
def get_conflict_data(org_id: int, generation_id: str) -> dict:
    """Returns raw rows mapped by entity type for the conflict analyzer."""
    if not generation_id:
        return {"timetable": [], "faculty": [], "infrastructure_rooms": []}
        
    with get_connection() as conn:
        timetable = conn.execute(
            "SELECT * FROM timetable WHERE generation_id = %s AND org_id = %s",
            (generation_id, org_id)
        ).fetchall()
        
        faculty = conn.execute(
            "SELECT * FROM faculty WHERE org_id = %s", (org_id,)
        ).fetchall()
        
        rooms = conn.execute(
            "SELECT * FROM infrastructure_rooms WHERE org_id = %s", (org_id,)
        ).fetchall()
        
    return {
        "timetable": [_serialize_dict(dict(r)) for r in timetable],
        "faculty": [_serialize_dict(dict(r)) for r in faculty],
        "infrastructure_rooms": [_serialize_dict(dict(r)) for r in rooms]
    }


# ---------------------------------------------------------------------------
# Share Tokens
# ---------------------------------------------------------------------------

def create_share_token(org_id: int, generation_id: str, created_by: int | None = None, expires_at: datetime | None = None) -> str:
    """Create a public share token for a given generation and return the token string."""
    with get_connection() as conn:
        row = conn.execute(
            """
            INSERT INTO share_tokens (org_id, generation_id, created_by, expires_at)
            VALUES (%s, %s, %s, %s)
            RETURNING token
            """,
            (org_id, generation_id, created_by, expires_at),
        ).fetchone()
        conn.commit()
    return row["token"] if isinstance(row, dict) else row[0]


def get_share_token_row(token: str) -> dict | None:
    """Retrieve the share_token row for a given token string, or None if invalid/expired."""
    with get_connection() as conn:
        row = conn.execute(
            """
            SELECT * FROM share_tokens
            WHERE token = %s
              AND (expires_at IS NULL OR expires_at > now())
            """,
            (token,),
        ).fetchone()
    return _serialize_dict(dict(row)) if row else None

