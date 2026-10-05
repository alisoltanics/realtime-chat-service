"""Token operations shared by the authentication and realtime API views."""

from django.contrib.auth import get_user_model
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import AccessToken, RefreshToken


def issue_token_pair(user):
    """Create an access/refresh pair for an authenticated user."""
    refresh = RefreshToken.for_user(user)
    return {
        "access": str(refresh.access_token),
        "refresh": str(refresh),
    }


def resolve_access_token(token):
    """Return the decoded token and active user, or ``(None, None)``."""
    try:
        access = AccessToken(token)
    except TokenError:
        return None, None

    user = get_user_model().objects.filter(
        pk=access["user_id"],
        is_active=True,
    ).first()
    return access, user
