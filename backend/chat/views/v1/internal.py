"""Service-token protected endpoints used by the realtime service."""

from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from ..logging import get_logger
from ..models import Membership, Message, Room
from ..permissions import HasServiceToken
from ..serializers import MessageCreateSerializer, MessageSerializer
from .common import _error_response, _persist_message, _public_user, can_read_room

logger = get_logger("django-api.chat")


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
            return _error_response(
                "invalid_token", "token is required", status.HTTP_400_BAD_REQUEST
            )
        access, error = _decode_access_token(token)
        if error is not None:
            return error
        user = get_user_model().objects.filter(pk=access["user_id"]).first()
        if user is None or not user.is_active:
            return _error_response(
                "invalid_token",
                "user not found or inactive",
                status.HTTP_401_UNAUTHORIZED,
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
            return _error_response(
                "forbidden", "unknown user or room", status.HTTP_403_FORBIDDEN
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
            return _error_response(
                "not_found",
                "room or sender does not exist",
                status.HTTP_404_NOT_FOUND,
            )
        if not can_read_room(sender, room):
            return _error_response(
                "permission_denied",
                "sender cannot post in room",
                status.HTTP_403_FORBIDDEN,
            )

        client_id = data.get("client_id") or ""
        message, created = _persist_message(
            room=room,
            sender=sender,
            text=data["text"],
            client_id=client_id,
        )

        if created:
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
            {"message": MessageSerializer(message).data, "created": created},
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )


class InternalRoomMembersView(InternalAPIView):
    """Member user ids of a room (used by the realtime service for presence fan-out)."""

    def get(self, request):
        room = Room.objects.filter(slug=str(request.query_params.get("room", "")).strip()).first()
        if room is None:
            return _error_response(
                "not_found", "room not found", status.HTTP_404_NOT_FOUND
            )
        member_ids = list(
            Membership.objects.filter(room=room).values_list("user_id", flat=True)
        )
        return Response({"room_id": room.id, "member_ids": member_ids})
