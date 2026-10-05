"""Registration, login, token refresh, and current-user endpoints."""

from django.contrib.auth import authenticate, get_user_model
from django.contrib.auth.password_validation import validate_password
from django.db import IntegrityError, transaction
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.views import TokenObtainPairView

from ...logging import get_logger
from ...serializers import (
    ChatTokenObtainPairSerializer,
    RegisterSerializer,
    UserSerializer,
)
from ...services import issue_token_pair
from .common import _error_response

logger = get_logger("django-api.chat")


def _token_response_data(user):
    return {
        **issue_token_pair(user),
        "user": UserSerializer(user).data,
    }


class RegisterView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        serializer = RegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        user_model = get_user_model()
        if user_model.objects.filter(username__iexact=data["username"]).exists():
            return Response(
                {"error": {"code": "conflict", "detail": "username already taken"}},
                status=status.HTTP_409_CONFLICT,
            )
        user = user_model(
            username=data["username"],
            first_name=(data.get("display_name") or "").strip()[:150],
        )
        validate_password(data["password"])
        user.set_password(data["password"])
        try:
            with transaction.atomic():
                user.save()
        except IntegrityError:
            return Response(
                {"error": {"code": "conflict", "detail": "username already taken"}},
                status=status.HTTP_409_CONFLICT,
            )
        logger.info("user.registered", extra={"user_id": user.id})
        return Response(_token_response_data(user), status=status.HTTP_201_CREATED)


class ChatTokenObtainPairView(TokenObtainPairView):
    serializer_class = ChatTokenObtainPairSerializer


@api_view(["POST"])
@permission_classes([AllowAny])
def refresh_token_view(request):
    """Exchange a refresh token for a new access token."""
    from rest_framework_simplejwt.serializers import TokenRefreshSerializer

    serializer = TokenRefreshSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    return Response(serializer.validated_data, status=status.HTTP_200_OK)


@api_view(["GET"])
def me_view(request):
    return Response(UserSerializer(request.user).data)


@api_view(["POST"])
@permission_classes([AllowAny])
def authenticate_view(request):
    """Username/password login returning the JWT pair (used by the login form)."""
    username = str(request.data.get("username", "")).strip()
    password = str(request.data.get("password", ""))
    user = authenticate(request, username=username, password=password)
    if user is None:
        return Response(
            {
                "error": {
                    "code": "invalid_credentials",
                    "detail": "wrong username or password",
                }
            },
            status=status.HTTP_401_UNAUTHORIZED,
        )
    return Response(_token_response_data(user))
