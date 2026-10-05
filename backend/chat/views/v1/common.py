"""Shared helpers for the versioned chat API views."""

from rest_framework import status
from rest_framework.response import Response

MESSAGE_PAGE_SIZE = 30
MAX_MESSAGE_PAGE_SIZE = 100
ROOM_PRIVATE_ERROR = "room is private"
ROOM_ACCESS_ERROR = "not a member"


def _error_response(code, detail, http_status):
    """Return the API's stable error envelope for domain-level errors."""
    return Response(
        {"error": {"code": code, "detail": detail}},
        status=http_status,
    )


def _message_page(queryset, *, limit, before_id):
    """Read one keyset page and return oldest-first rows plus its cursor."""
    if before_id:
        try:
            queryset = queryset.filter(id__lt=int(before_id))
        except (TypeError, ValueError):
            return None, _error_response(
                "invalid_cursor",
                "before_id must be an integer",
                status.HTTP_400_BAD_REQUEST,
            )

    rows = list(queryset.order_by("-id")[: limit + 1])
    has_more = len(rows) > limit
    rows = rows[:limit]
    rows.reverse()
    return (rows, has_more), None
