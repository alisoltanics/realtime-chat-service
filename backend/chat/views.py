"""REST API.

Two audiences are served here:

* ``/api/auth``, ``/api/rooms`` ... - the React frontend, authenticated with a
  JWT access token.
* ``/api/internal/...`` - the Node.js realtime service, authenticated with the
  shared internal service token. The realtime service owns the socket
  connection and presence, so it needs a trusted way to (a) resolve the
  identity behind a token and (b) persist a validated message before it is
  broadcast to the room.
"""
from django.contrib.auth import authenticate, get_user_model
from django.contrib.auth.password_validation import validate_password
from django.db import IntegrityError, transaction
from django.db.models import Count, Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenObtainPairView

from .logging import get_logger
from .models import Membership, Message, Room
from .permissions import HasRoomReadAccess, HasServiceToken
from .serializers import (
    ChatTokenObtainPairSerializer,
    MessageCreateSerializer,
    MessageSerializer,
    MembershipSerializer,
    RegisterSerializer,
    RoomCreateSerializer,
    RoomSerializer,
    UserSerializer,
)

logger = get_logger("django-api.chat")

MESSAGE_PAGE_SIZE = 30
MAX_MESSAGE_PAGE_SIZE = 100


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


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------
class HealthView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request):
        db_ok = True
        try:
            get_user_model().objects.exists()
        except Exception:  # pragma: no cover - only on DB outage
            db_ok = False
        payload = {
            "status": "ok" if db_ok else "degraded",
            "service": "django-api",
            "database": "up" if db_ok else "down",
            "time": timezone.now(),
        }
        code = status.HTTP_200_OK if db_ok else status.HTTP_503_SERVICE_UNAVAILABLE
        return Response(payload, status=code)


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------
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
        return Response(_issue_tokens(user), status=status.HTTP_201_CREATED)


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
            {"error": {"code": "invalid_credentials", "detail": "wrong username or password"}},
            status=status.HTTP_401_UNAUTHORIZED,
        )
    return Response(_issue_tokens(user))


# ---------------------------------------------------------------------------
# Rooms
# ---------------------------------------------------------------------------
def room_queryset_with_annotations():
    return Room.objects.annotate(
        member_count=Count("memberships", distinct=True),
    )


class RoomListCreateView(APIView):
    def get(self, request):
        rooms = room_queryset_with_annotations().filter(
            Q(is_public=True) | Q(memberships__user=request.user)
        ).distinct()
        return Response({"results": RoomSerializer(rooms, many=True).data})

    def post(self, request):
        serializer = RoomCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        room = serializer.save(created_by=request.user)
        Membership.objects.create(room=room, user=request.user, role=Membership.Role.ADMIN)
        logger.info("room.created", extra={"room_id": room.id, "room_slug": room.slug})
        return Response(
            RoomSerializer(room_queryset_with_annotations().get(pk=room.pk)).data,
            status=status.HTTP_201_CREATED,
        )


class RoomDetailView(APIView):
    permission_classes = [IsAuthenticated, HasRoomReadAccess]

    def get(self, request, slug):
        room = get_room_or_404(slug)
        self.check_object_permissions(request, room)
        return Response(RoomSerializer(room_queryset_with_annotations().get(pk=room.pk)).data)


class RoomJoinView(APIView):
    def post(self, request, slug):
        room = get_room_or_404(slug)
        if not room.is_public and not Membership.objects.filter(
            room=room, user=request.user
        ).exists():
            return Response(
                {"error": {"code": "room_private", "detail": "room is private"}},
                status=status.HTTP_403_FORBIDDEN,
            )
        membership, created = Membership.objects.get_or_create(
            room=room, user=request.user, defaults={"role": Membership.Role.MEMBER}
        )
        logger.info(
            "room.member_joined",
            extra={
                "room_id": room.id,
                "room_slug": room.slug,
                "user_id": request.user.id,
                "membership_created": created,
            },
        )
        return Response(
            MembershipSerializer(membership).data,
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )


class RoomLeaveView(APIView):
    def post(self, request, slug):
        room = get_room_or_404(slug)
        deleted, _ = Membership.objects.filter(room=room, user=request.user).delete()
        return Response({"left": bool(deleted)})


class RoomMembersView(APIView):
    def get(self, request, slug):
        room = get_room_or_404(slug)
        if not can_read_room(request.user, room):
            return Response(
                {"error": {"code": "permission_denied", "detail": "not a member"}},
                status=status.HTTP_403_FORBIDDEN,
            )
        memberships = Membership.objects.filter(room=room).select_related("user").order_by("user_id")
        return Response({"results": MembershipSerializer(memberships, many=True).data})

    def post(self, request, slug):
        """Room admins add members. Without this a private room can never be
        shared: joining one is rejected for non-members, so it would stay
        permanently single-user."""
        room = get_room_or_404(slug)
        membership = Membership.objects.filter(room=room, user=request.user).first()
        if membership is None or membership.role != Membership.Role.ADMIN:
            return Response(
                {"error": {"code": "permission_denied", "detail": "admin only"}},
                status=status.HTTP_403_FORBIDDEN,
            )

        username = str(request.data.get("username", "")).strip()
        user_id = request.data.get("user_id")
        if username:
            target = get_user_model().objects.filter(username=username).first()
        elif user_id is not None:
            target = get_user_model().objects.filter(id=user_id).first()
        else:
            target = None
        if target is None:
            return Response(
                {"error": {"code": "user_not_found", "detail": "username or user_id required"}},
                status=status.HTTP_404_NOT_FOUND,
            )

        member, created = Membership.objects.get_or_create(
            room=room, user=target, defaults={"role": Membership.Role.MEMBER}
        )
        logger.info(
            "room.member_added",
            extra={
                "room_id": room.id,
                "room_slug": room.slug,
                "user_id": target.id,
                "added_by": request.user.id,
            },
        )
        return Response(
            MembershipSerializer(member).data,
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )


class RoomMessagesView(APIView):
    """Keyset pagination: newest-first window, returned oldest-first for rendering."""

    def get(self, request, slug):
        room = get_room_or_404(slug)
        if not can_read_room(request.user, room):
            return Response(
                {"error": {"code": "permission_denied", "detail": "not a member"}},
                status=status.HTTP_403_FORBIDDEN,
            )
        try:
            limit = int(request.query_params.get("limit", MESSAGE_PAGE_SIZE))
        except (TypeError, ValueError):
            limit = MESSAGE_PAGE_SIZE
        limit = max(1, min(limit, MAX_MESSAGE_PAGE_SIZE))

        queryset = Message.objects.filter(room=room).select_related("sender", "room")
        before_id = request.query_params.get("before_id")
        if before_id:
            try:
                queryset = queryset.filter(id__lt=int(before_id))
            except (TypeError, ValueError):
                return Response(
                    {"error": {"code": "invalid_cursor", "detail": "before_id must be an integer"}},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        rows = list(queryset.order_by("-id")[: limit + 1])
        has_more = len(rows) > limit
        rows = rows[:limit]
        rows.reverse()  # oldest -> newest
        payload = {
            "results": MessageSerializer(rows, many=True).data,
            "has_more": has_more,
            "next_before_id": rows[0].id if (has_more and rows) else None,
        }
        return Response(payload)

    def post(self, request, slug):
        """REST fallback for clients without a socket (also used by the smoke test)."""
        room = get_room_or_404(slug)
        if not can_read_room(request.user, room):
            return Response(
                {"error": {"code": "permission_denied", "detail": "not a member"}},
                status=status.HTTP_403_FORBIDDEN,
            )
        serializer = MessageCreateSerializer(
            data={
                "room_id": room.id,
                "sender_id": request.user.id,
                "text": request.data.get("text", ""),
                "client_id": request.data.get("client_id", ""),
            }
        )
        serializer.is_valid(raise_exception=True)
        client_id = serializer.validated_data.get("client_id", "")
        # The unique constraint on (room, sender, client_id) only applies to a
        # non-empty client_id, so without one every POST must create a new row
        # instead of reusing an existing message.
        if client_id:
            message, created = Message.objects.get_or_create(
                room=room,
                sender=request.user,
                client_id=client_id,
                defaults={"text": serializer.validated_data["text"]},
            )
        else:
            message = Message.objects.create(
                room=room,
                sender=request.user,
                text=serializer.validated_data["text"],
            )
            created = True
        return Response(
            MessageSerializer(message).data,
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )


# ---------------------------------------------------------------------------
# Internal API (realtime service only, service-token authenticated)
# ---------------------------------------------------------------------------
def _decode_access_token(token):
    from rest_framework_simplejwt.exceptions import TokenError
    from rest_framework_simplejwt.tokens import AccessToken

    try:
        return AccessToken(token), None
    except TokenError:
        return None, Response(
            {"error": {"code": "invalid_token", "detail": "token is invalid or expired"}},
            status=status.HTTP_401_UNAUTHORIZED,
        )


class InternalAPIView(APIView):
    """Base for the realtime service endpoints: service-token only, no JWT auth."""

    authentication_classes = []
    permission_classes = [HasServiceToken]


class InternalVerifyTokenView(InternalAPIView):
    """Resolve a browser JWT into the authenticated user (trusted identity source)."""

    def post(self, request):
        token = str(request.data.get("token", "")).strip()
        if not token:
            return Response(
                {"error": {"code": "invalid_token", "detail": "token is required"}},
                status=status.HTTP_400_BAD_REQUEST,
            )
        access, error = _decode_access_token(token)
        if error is not None:
            return error
        user = get_user_model().objects.filter(pk=access["user_id"]).first()
        if user is None or not user.is_active:
            return Response(
                {"error": {"code": "invalid_token", "detail": "user not found or inactive"}},
                status=status.HTTP_401_UNAUTHORIZED,
            )
        return Response({"user": _public_user(user)})


class InternalAuthorizeRoomView(InternalAPIView):
    """Authorize a socket room join: token + room slug -> user + permissions."""

    def post(self, request):
        token = str(request.data.get("token", "")).strip()
        slug = str(request.data.get("room", "")).strip().lower()
        access, error = _decode_access_token(token)
        if error is not None:
            return error
        user = get_user_model().objects.filter(pk=access["user_id"]).first()
        room = Room.objects.filter(slug=slug).first()
        if user is None or not user.is_active or room is None:
            return Response(
                {"error": {"code": "forbidden", "detail": "unknown user or room"}},
                status=status.HTTP_403_FORBIDDEN,
            )
        membership = Membership.objects.filter(room=room, user=user).first()
        return Response(
            {
                "user": _public_user(user),
                "room": {
                    "id": room.id,
                    "slug": room.slug,
                    "name": room.name,
                    "is_public": room.is_public,
                },
                "access": {
                    "can_read": room.is_public or membership is not None,
                    "is_member": membership is not None,
                },
            }
        )


class InternalCreateMessageView(InternalAPIView):
    """Persist a message on behalf of a socket sender. Idempotent per client_id."""

    def post(self, request):
        serializer = MessageCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        room = Room.objects.filter(pk=data["room_id"]).first()
        sender = get_user_model().objects.filter(pk=data["sender_id"]).first()
        if room is None or sender is None or not sender.is_active:
            return Response(
                {"error": {"code": "not_found", "detail": "room or sender does not exist"}},
                status=status.HTTP_404_NOT_FOUND,
            )
        if not can_read_room(sender, room):
            return Response(
                {"error": {"code": "permission_denied", "detail": "sender cannot post in room"}},
                status=status.HTTP_403_FORBIDDEN,
            )

        client_id = data.get("client_id") or ""
        if client_id:
            existing = Message.objects.filter(
                room=room, sender=sender, client_id=client_id
            ).first()
            if existing is not None:
                return Response({"message": MessageSerializer(existing).data, "created": False})

        try:
            with transaction.atomic():
                message = Message.objects.create(
                    room=room, sender=sender, text=data["text"], client_id=client_id
                )
        except IntegrityError:
            # Concurrent send with the same client_id: return the winner.
            message = Message.objects.get(room=room, sender=sender, client_id=client_id)
            return Response({"message": MessageSerializer(message).data, "created": False})

        logger.info(
            "message.stored",
            extra={
                "message_id": message.pk,
                "room_id": room.id,
                "room_slug": room.slug,
                "sender_id": sender.id,
                "text_length": len(message.text),
            },
        )
        return Response(
            {"message": MessageSerializer(message).data, "created": True},
            status=status.HTTP_201_CREATED,
        )


class InternalRoomMembersView(InternalAPIView):
    """Member user ids of a room (used by the realtime service for presence fan-out)."""

    def get(self, request):
        room = Room.objects.filter(slug=str(request.query_params.get("room", "")).strip()).first()
        if room is None:
            return Response(
                {"error": {"code": "not_found", "detail": "room not found"}},
                status=status.HTTP_404_NOT_FOUND,
            )
        member_ids = list(
            Membership.objects.filter(room=room).values_list("user_id", flat=True)
        )
        return Response({"room_id": room.id, "member_ids": member_ids})
