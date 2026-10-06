"""Room, membership, and message history endpoints."""

from django.contrib.auth import get_user_model
from django.db import transaction
from django.db.models import Count, Q
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from ...logging import get_logger
from ...models import Membership, Message, Room
from ...permissions import HasRoomReadAccess, can_read_room
from ...serializers import (
    MembershipSerializer,
    MessageCreateSerializer,
    MessageSerializer,
    RoomCreateSerializer,
    RoomSerializer,
    latest_message_prefetch,
)
from ...services import persist_message
from ...settings import MembershipRole
from .common import (
    MAX_MESSAGE_PAGE_SIZE,
    MESSAGE_PAGE_SIZE,
    ROOM_ACCESS_ERROR,
    ROOM_PRIVATE_ERROR,
    _error_response,
    _message_page,
)

logger = get_logger("django-api.chat")


def room_queryset_with_annotations():
    return Room.objects.annotate(
        member_count=Count("memberships", distinct=True),
    ).prefetch_related(latest_message_prefetch())


def _get_room_or_404(slug):
    return get_object_or_404(Room, slug=slug)


class RoomListCreateView(APIView):
    def get(self, request):
        rooms = room_queryset_with_annotations().filter(
            Q(is_public=True) | Q(memberships__user=request.user)
        ).distinct()
        return Response({"results": RoomSerializer(rooms, many=True).data})

    def post(self, request):
        serializer = RoomCreateSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        invitees = serializer.validated_data.get("member_usernames", [])
        with transaction.atomic():
            room = serializer.save(created_by=request.user)
            Membership.objects.create(
                room=room,
                user=request.user,
                role=MembershipRole.ADMIN,
            )
            Membership.objects.bulk_create(
                [
                    Membership(room=room, user=user, role=MembershipRole.MEMBER)
                    for user in invitees
                ]
            )
        logger.info("room.created", extra={"room_id": room.id, "room_slug": room.slug})
        return Response(
            RoomSerializer(room_queryset_with_annotations().get(pk=room.pk)).data,
            status=status.HTTP_201_CREATED,
        )


class RoomDetailView(APIView):
    permission_classes = [IsAuthenticated, HasRoomReadAccess]

    def get(self, request, slug):
        room = _get_room_or_404(slug)
        self.check_object_permissions(request, room)
        room = room_queryset_with_annotations().get(pk=room.pk)
        return Response(RoomSerializer(room).data)


class RoomJoinView(APIView):
    def post(self, request, slug):
        room = _get_room_or_404(slug)
        if not room.is_public and not Membership.objects.filter(
            room=room, user=request.user
        ).exists():
            return _error_response(
                "room_private", ROOM_PRIVATE_ERROR, status.HTTP_403_FORBIDDEN
            )
        membership, created = Membership.objects.get_or_create(
            room=room, user=request.user, defaults={"role": MembershipRole.MEMBER}
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
        room = _get_room_or_404(slug)
        deleted, _ = Membership.objects.filter(room=room, user=request.user).delete()
        return Response({"left": bool(deleted)})


class RoomMembersView(APIView):
    def get(self, request, slug):
        room = _get_room_or_404(slug)
        if not can_read_room(request.user, room):
            return _error_response(
                "permission_denied", ROOM_ACCESS_ERROR, status.HTTP_403_FORBIDDEN
            )
        memberships = (
            Membership.objects.filter(room=room)
            .select_related("user")
            .order_by("user_id")
        )
        return Response({"results": MembershipSerializer(memberships, many=True).data})

    def post(self, request, slug):
        """Room admins add members. Without this a private room can never be
        shared: joining one is rejected for non-members, so it would stay
        permanently single-user."""
        room = _get_room_or_404(slug)
        membership = Membership.objects.filter(room=room, user=request.user).first()
        if membership is None or membership.role != MembershipRole.ADMIN:
            return _error_response(
                "permission_denied", "admin only", status.HTTP_403_FORBIDDEN
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
            return _error_response(
                "user_not_found",
                "username or user_id required",
                status.HTTP_404_NOT_FOUND,
            )

        member, created = Membership.objects.get_or_create(
            room=room, user=target, defaults={"role": MembershipRole.MEMBER}
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


class RoomMemberDetailView(APIView):
    def delete(self, request, slug, user_id):
        room = _get_room_or_404(slug)
        membership = Membership.objects.filter(room=room, user=request.user).first()
        if membership is None or membership.role != MembershipRole.ADMIN:
            return _error_response(
                "permission_denied", "admin only", status.HTTP_403_FORBIDDEN
            )

        target = Membership.objects.filter(
            room=room, user_id=user_id, role=MembershipRole.MEMBER
        ).first()
        if target is None:
            return _error_response(
                "member_not_found", "member not found", status.HTTP_404_NOT_FOUND
            )

        target.delete()
        logger.info(
            "room.member_removed",
            extra={"room_id": room.id, "room_slug": room.slug, "user_id": user_id, "removed_by": request.user.id},
        )
        return Response({"removed": True})


class RoomMessagesView(APIView):
    """Keyset pagination: newest-first window, returned oldest-first for rendering."""

    def get(self, request, slug):
        room = _get_room_or_404(slug)
        if not can_read_room(request.user, room):
            return _error_response(
                "permission_denied", ROOM_ACCESS_ERROR, status.HTTP_403_FORBIDDEN
            )
        try:
            limit = int(request.query_params.get("limit", MESSAGE_PAGE_SIZE))
        except (TypeError, ValueError):
            limit = MESSAGE_PAGE_SIZE
        limit = max(1, min(limit, MAX_MESSAGE_PAGE_SIZE))

        queryset = Message.objects.filter(room=room).select_related("sender")
        page, error = _message_page(
            queryset,
            limit=limit,
            before_id=request.query_params.get("before_id"),
        )
        if error is not None:
            return error

        rows, has_more = page
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
            return _error_response(
                "permission_denied", ROOM_ACCESS_ERROR, status.HTTP_403_FORBIDDEN
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
        message, created = persist_message(
            room=room,
            sender=request.user,
            text=serializer.validated_data["text"],
            client_id=client_id,
        )
        return Response(
            MessageSerializer(message).data,
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )
