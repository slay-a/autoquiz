"""
Structured logging helper for AutoQuiz backend.

Per DESIGN.md §14, every server-side log line is a structured JSON record.
All log lines must use log_event() — no ad-hoc logger.info("...") calls.

Event envelope (§14.1):
{
  "timestamp": "ISO8601",
  "event": "dot.separated.name",
  "level": "INFO | WARNING | ERROR | DEBUG",
  "actor_id": "uuid | null",
  "actor_role": "instructor | student | system | null",
  "resource_type": "file | job | quiz | note | class | flashcard_set | null",
  "resource_id": "string | null",
  "request_id": "uuid | null",
  "duration_ms": "int | null",
  "outcome": "success | failure",
  "error_code": "string | null",
  "meta": { "feature-specific non-PII fields" }
}
"""

import json
import logging
import datetime
from typing import Optional, Any

logger = logging.getLogger("autoquiz")


def log_event(
    event: str,
    level: str = "INFO",
    outcome: str = "success",
    actor_id: Optional[str] = None,
    actor_role: Optional[str] = None,
    resource_type: Optional[str] = None,
    resource_id: Optional[str] = None,
    request_id: Optional[str] = None,
    duration_ms: Optional[int] = None,
    error_code: Optional[str] = None,
    meta: Optional[dict] = None,
) -> None:
    """
    Emit a structured JSON log event per DESIGN.md §14.1.

    Args:
        event:         dot.separated event name (must be in the §14.3 catalog)
        level:         log level string — INFO | WARNING | ERROR | DEBUG
        outcome:       "success" or "failure"
        actor_id:      UUID of the acting user (never email or name)
        actor_role:    instructor | student | system | null
        resource_type: class | quiz | note | file | job | flashcard_set
        resource_id:   the resource's primary key
        request_id:    per-request UUID from middleware
        duration_ms:   elapsed time for *.completed / *.failed events
        error_code:    UPPER_SNAKE_CASE code from error_codes.py
        meta:          non-PII feature-specific context fields
    """
    record = {
        "timestamp": datetime.datetime.utcnow().isoformat() + "Z",
        "event": event,
        "level": level.upper(),
        "actor_id": actor_id,
        "actor_role": actor_role,
        "resource_type": resource_type,
        "resource_id": resource_id,
        "request_id": request_id,
        "duration_ms": duration_ms,
        "outcome": outcome,
        "error_code": error_code,
        "meta": meta or {},
    }

    log_func = getattr(logger, level.lower(), logger.info)
    log_func(json.dumps(record))
