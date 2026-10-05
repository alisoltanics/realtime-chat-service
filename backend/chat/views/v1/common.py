"""Shared helpers for the versioned chat API views."""

from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.response import Response
from rest_framework_simplejwt.tokens import RefreshToken

from ...models import Membership, Message, Room
from ...serializers import UserSerializer

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


def _issue_tokens(user):
    refresh = RefreshToken.for_user(user)
    return {
        "access": str(refresh.access_token),
        "refresh": str(refresh),
        "user": UserSerializer(user).data,
    }


def _public_user(user):
    return {
        "id": user.id,
        "username": user.username,
        "display_name": user.get_full_name() or user.username,
    }


def get_room_or_404(slug):
    return get_object_or_404(Room, slug=slug)


def can_read_room(user, room):
    if room.is_public:
        return True
    return Membership.objects.filter(room=room, user=user).exists()


def _persist_message(*, room, sender, text, client_id=""):
    """Persist once, using the client key for safe retries when available."""
    if not client_id:
        return Message.objects.create(room=room, sender=sender, text=text), True

    return Message.objects.get_or_create(
        room=room,
        sender=sender,
        client_id=client_id,
        defaults={"text": text},
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
