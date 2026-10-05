"""Authorization helpers for rooms and the internal (service-to-service) API."""
from django.conf import settings
from rest_framework import exceptions, status
from rest_framework.permissions import BasePermission

from .models import Membership


def can_read_room(user, room):
    """Return whether an authenticated user may read a room."""
    if not user or not user.is_authenticated:
        return False
    if room.is_public:
        return True
    return Membership.objects.filter(room=room, user=user).exists()


class HasRoomReadAccess(BasePermission):
    """Public rooms are readable by any authenticated user; private rooms only by members."""

    def has_permission(self, request, view):
        return request.user and request.user.is_authenticated

    def has_object_permission(self, request, view, obj):
        return can_read_room(request.user, obj)


class IsRoomMember(HasRoomReadAccess):
    """Compatibility alias for the room read-access permission."""


class ServiceTokenError(exceptions.APIException):
    """Raised instead of returning False so the error carries a stable code."""

    status_code = status.HTTP_403_FORBIDDEN
    default_detail = "invalid or missing service token"
    default_code = "service_token_invalid"


class HasServiceToken(BasePermission):
    """Shared-secret check for the realtime service (X-Service-Token header)."""

    def has_permission(self, request, view):
        expected = getattr(settings, "INTERNAL_SERVICE_TOKEN", "")
        provided = request.headers.get("x-service-token", "")
        if not expected or provided != expected:
            raise ServiceTokenError()
        return True
