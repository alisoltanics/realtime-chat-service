"""Structured logging helpers: JSON lines with timestamp, level and request id."""
import json
import logging
import time
import uuid

from django.conf import settings

RESERVED = frozenset(
    vars(logging.LogRecord("", 0, "", 0, "", (), None)).keys()
) | {"message", "asctime", "taskName"}


class RequestIdFilter(logging.Filter):
    """Attach the current request id (set by RequestIdMiddleware) to records."""

    def filter(self, record):
        from chat.logging_context import get_request_id

        record.request_id = get_request_id() or "-"
        return True


class StructuredFormatter(logging.Formatter):
    """Render a LogRecord as a single JSON object."""

    def format(self, record):
        payload = {
            "ts": time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime(record.created))
            + f".{int(record.msecs):03d}Z",
            "level": record.levelname,
            "service": getattr(settings, "SERVICE_NAME", "django-api"),
            "logger": record.name,
            "request_id": getattr(record, "request_id", "-"),
            "msg": record.getMessage(),
        }
        extra = {
            key: value
            for key, value in record.__dict__.items()
            if key not in RESERVED and not key.startswith("_")
        }
        payload.update(extra)
        if record.exc_info:
            payload["exc"] = self.formatException(record.exc_info)
        return json.dumps(payload, default=str, ensure_ascii=False)


def new_request_id():
    return uuid.uuid4().hex[:16]


def get_logger(name=None):
    return logging.getLogger(name or settings.SERVICE_NAME)