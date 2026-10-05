"""Compatibility exports for the current API view set."""

from .v1 import (
    ChatTokenObtainPairView,
    HealthView,
    InternalAuthorizeRoomView,
    InternalCreateMessageView,
    InternalRoomMembersView,
    InternalVerifyTokenView,
    RegisterView,
    RoomDetailView,
    RoomJoinView,
    RoomLeaveView,
    RoomListCreateView,
    RoomMembersView,
    RoomMessagesView,
    authenticate_view,
    me_view,
    refresh_token_view,
)

__all__ = [
    "ChatTokenObtainPairView",
    "HealthView",
    "InternalAuthorizeRoomView",
    "InternalCreateMessageView",
    "InternalRoomMembersView",
    "InternalVerifyTokenView",
    "RegisterView",
    "RoomDetailView",
    "RoomJoinView",
    "RoomLeaveView",
    "RoomListCreateView",
    "RoomMembersView",
    "RoomMessagesView",
    "authenticate_view",
    "me_view",
    "refresh_token_view",
]
