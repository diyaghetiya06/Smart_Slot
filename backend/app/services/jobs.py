"""
RQ background job for timetable generation.

This module is imported by the RQ worker process.  It must NOT import Flask
application objects at module level.  All heavy imports happen inside the
job function so the worker can import this file cleanly.
"""
from __future__ import annotations

import logging
from datetime import datetime

logger = logging.getLogger(__name__)


def run_generation_job(org_id: int, payload: dict) -> dict:
    """
    Execute timetable generation and persist the result.

    Parameters
    ----------
    org_id  : The organisation for which we're generating.
    payload : dict with keys faculty, subjects, divisions, rooms,
              semester_type, program, days, time_slots.

    Returns
    -------
    dict with "success", "generation_id", "reason".
    """
    from app.services.timetable_algorithm import generate_timetable
    from app.models.database import save_timetable_records

    logger.info("RQ job: starting generation for org_id=%d", org_id)

    result = generate_timetable(
        faculty=payload["faculty"],
        subjects=payload["subjects"],
        divisions=payload["divisions"],
        rooms=payload.get("rooms", []),
        semester_type=payload["semester_type"],
        program=payload["program"],
        days=payload.get("days"),
        time_slots=payload.get("time_slots"),
    )

    if not result["success"]:
        logger.warning("RQ job: generation failed — %s", result["reason"])
        return {"success": False, "generation_id": None, "reason": result["reason"]}

    generation_id = datetime.now().strftime("GEN-%Y%m%d%H%M%S")
    save_timetable_records(org_id, generation_id, result["records"])

    logger.info("RQ job: generation complete — %s", generation_id)
    return {"success": True, "generation_id": generation_id, "reason": ""}
