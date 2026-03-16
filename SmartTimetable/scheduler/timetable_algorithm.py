from __future__ import annotations

from collections import defaultdict
from datetime import datetime
import re


DEFAULT_DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]
DEFAULT_TIME_SLOTS = [
    "9:00 AM-10:00 AM",
    "10:00 AM-11:00 AM",
    "11:00 AM-12:00 PM",
    "12:00 PM-1:00 PM",
    "1:00 PM-2:00 PM (Lunch Break)",
    "2:00 PM-3:00 PM",
    "3:00 PM-4:00 PM",
    "4:00 PM-5:00 PM",
]


def _is_teaching_slot(slot_label: str) -> bool:
    label = slot_label.lower()
    return "lunch" not in label and "break" not in label


def _get_teaching_slot_indexes(time_slots: list[str]) -> list[int]:
    return [i for i, slot in enumerate(time_slots) if _is_teaching_slot(slot)]


def _time_to_minutes(t: str) -> int:
    text = t.strip().upper().replace(".", "")
    match = re.match(r"^(\d{1,2}):(\d{2})(?:\s*([AP]M))?$", text)
    if not match:
        raise ValueError(f"Invalid time format: {t}")

    hour = int(match.group(1))
    minute = int(match.group(2))
    am_pm = match.group(3)

    if am_pm:
        if hour < 1 or hour > 12:
            raise ValueError(f"Invalid hour in 12-hour time: {t}")
        if hour == 12:
            hour = 0
        if am_pm == "PM":
            hour += 12
    else:
        if hour < 0 or hour > 23:
            raise ValueError(f"Invalid hour in 24-hour time: {t}")

    return hour * 60 + minute


def _minutes_to_12h(total_minutes: int) -> str:
    hour = (total_minutes // 60) % 24
    minute = total_minutes % 60
    suffix = "AM" if hour < 12 else "PM"
    display_hour = hour % 12
    if display_hour == 0:
        display_hour = 12
    return f"{display_hour}:{minute:02d} {suffix}"


def _slot_range(slot_label: str) -> tuple[int, int]:
    pure_label = slot_label.split("(")[0].strip()
    start, end = pure_label.split("-")
    return _time_to_minutes(start), _time_to_minutes(end)


def normalize_availability_text(available_time: str) -> str:
    windows = []
    for block in available_time.split(","):
        block = block.strip()
        if not block or "-" not in block:
            continue

        start, end = [x.strip() for x in block.split("-", 1)]
        start_min = _time_to_minutes(start)
        end_min = _time_to_minutes(end)
        if end_min <= start_min:
            raise ValueError("End time must be after start time.")

        windows.append(f"{_minutes_to_12h(start_min)}-{_minutes_to_12h(end_min)}")

    if not windows:
        raise ValueError("No valid availability windows found.")

    return ", ".join(windows)


def _parse_availability(available_time: str) -> list[tuple[int, int]]:
    windows = []
    for block in available_time.split(","):
        block = block.strip()
        if not block:
            continue
        if "-" not in block:
            continue
        start, end = [x.strip() for x in block.split("-", 1)]
        start_min = _time_to_minutes(start)
        end_min = _time_to_minutes(end)
        if end_min <= start_min:
            continue
        windows.append((start_min, end_min))
    return windows


def _faculty_is_available_for_slot(
    availability_windows: list[tuple[int, int]],
    slot_index: int,
    time_slots: list[str],
) -> bool:
    slot_start, slot_end = _slot_range(time_slots[slot_index])
    for start, end in availability_windows:
        if start <= slot_start and slot_end <= end:
            return True
    return False


def _sessions_for_subject(subject_type: str) -> int:
    if subject_type == "Class":
        return 3
    if subject_type == "Tutorial":
        return 2
    return 2


def generate_timetable(
    faculty: list,
    subjects: list,
    divisions: list,
    semester_type: str,
    program: str,
    days: list[str] | None = None,
    time_slots: list[str] | None = None,
) -> dict:
    active_days = days or DEFAULT_DAYS
    active_time_slots = time_slots or DEFAULT_TIME_SLOTS
    teaching_slots = _get_teaching_slot_indexes(active_time_slots)

    faculty_map = {f["id"]: f for f in faculty}
    if not faculty_map:
        return {"success": False, "reason": "No faculty found.", "records": []}

    filtered_subjects = [s for s in subjects if s["assigned_faculty_id"] in faculty_map]
    if not filtered_subjects:
        return {
            "success": False,
            "reason": "No subjects with assigned faculty found.",
            "records": [],
        }

    # Full schedule container: division -> day -> slot index -> assignment
    division_schedule = {
        d["id"]: {day: {slot: None for slot in teaching_slots} for day in active_days}
        for d in divisions
    }

    faculty_busy = set()  # (faculty_id, day, slot_index)
    faculty_daily_count = defaultdict(int)  # (faculty_id, day) -> count

    availability_cache = {
        f_id: _parse_availability(faculty_map[f_id]["available_time"]) for f_id in faculty_map
    }

    assignments = []
    for division in divisions:
        for subject in filtered_subjects:
            sessions = _sessions_for_subject(subject["subject_type"])
            for n in range(sessions):
                assignments.append(
                    {
                        "division": division,
                        "subject": subject,
                        "session_idx": n,
                    }
                )

    # Greedy ordering: subjects taught by less-available faculty are placed first.
    def assignment_difficulty(item: dict) -> tuple:
        subject = item["subject"]
        f_id = subject["assigned_faculty_id"]
        available_slot_count = sum(
            1
            for slot in teaching_slots
            if _faculty_is_available_for_slot(availability_cache[f_id], slot, active_time_slots)
        )
        return (available_slot_count, subject["subject_type"] == "Lab")

    assignments.sort(key=assignment_difficulty)

    def can_place(division_id: int, day: str, slot: int, subject_row) -> bool:
        faculty_id = subject_row["assigned_faculty_id"]
        faculty_row = faculty_map[faculty_id]
        max_per_day = int(faculty_row["max_lectures_per_day"])

        if division_schedule[division_id][day][slot] is not None:
            return False

        if (faculty_id, day, slot) in faculty_busy:
            return False

        # No back-to-back lectures for same faculty.
        if (faculty_id, day, slot - 1) in faculty_busy or (faculty_id, day, slot + 1) in faculty_busy:
            return False

        if faculty_daily_count[(faculty_id, day)] >= max_per_day:
            return False

        if not _faculty_is_available_for_slot(
            availability_cache[faculty_id],
            slot,
            active_time_slots,
        ):
            return False

        return True

    def place(division_id: int, day: str, slot: int, subject_row) -> None:
        faculty_id = subject_row["assigned_faculty_id"]
        division_schedule[division_id][day][slot] = subject_row
        faculty_busy.add((faculty_id, day, slot))
        faculty_daily_count[(faculty_id, day)] += 1

    def unplace(division_id: int, day: str, slot: int, subject_row) -> None:
        faculty_id = subject_row["assigned_faculty_id"]
        division_schedule[division_id][day][slot] = None
        faculty_busy.remove((faculty_id, day, slot))
        faculty_daily_count[(faculty_id, day)] -= 1

    def candidate_positions(division_id: int, subject_row) -> list[tuple[str, int]]:
        candidates = []
        for day in active_days:
            for slot in teaching_slots:
                if can_place(division_id, day, slot, subject_row):
                    candidates.append((day, slot))

        # Greedy tie-breaker: prioritize less-occupied slots inside each division.
        def occupancy_key(item: tuple[str, int]) -> tuple:
            day, slot = item
            occupied = sum(
                1
                for s in teaching_slots
                if division_schedule[division_id][day][s] is not None
            )
            return (occupied, slot)

        candidates.sort(key=occupancy_key)
        return candidates

    def backtrack(index: int) -> bool:
        if index >= len(assignments):
            return True

        current = assignments[index]
        division = current["division"]
        subject = current["subject"]
        division_id = division["id"]

        candidates = candidate_positions(division_id, subject)
        if not candidates:
            return False

        for day, slot in candidates:
            place(division_id, day, slot, subject)
            if backtrack(index + 1):
                return True
            unplace(division_id, day, slot, subject)

        return False

    success = backtrack(0)
    if not success:
        return {
            "success": False,
            "reason": "Could not satisfy all constraints. Try reducing load or adding faculty availability.",
            "records": [],
        }

    records = []
    generation_stamp = datetime.now().isoformat()
    for division in divisions:
        division_id = division["id"]
        for day in active_days:
            for slot in teaching_slots:
                subject_row = division_schedule[division_id][day][slot]
                if subject_row is None:
                    continue
                faculty_row = faculty_map[subject_row["assigned_faculty_id"]]
                records.append(
                    {
                        "division_id": division_id,
                        "semester": division["semester"],
                        "program": program,
                        "day": day,
                        "slot_index": slot,
                        "time_slot": active_time_slots[slot],
                        "subject_id": subject_row["id"],
                        "faculty_id": subject_row["assigned_faculty_id"],
                        "subject_name": subject_row["name"],
                        "faculty_name": faculty_row["name"],
                        "subject_type": subject_row["subject_type"],
                        "scheduler_version": generation_stamp,
                    }
                )

    return {"success": True, "reason": "", "records": records}