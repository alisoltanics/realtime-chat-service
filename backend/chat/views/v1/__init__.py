"""Version 1 REST API views, grouped by domain."""

from .auth import (
    ChatTokenObtainPairView,
    RegisterView,
    authenticate_view,
    me_view,
    refresh_token_view,
)
from .health import HealthView
from .internal import (
    InternalAuthorizeRoomView,
    InternalCreateMessageView,
    InternalRoomMembersView,
    InternalVerifyTokenView,
)
from .rooms import (
    RoomDetailView,
    RoomJoinView,
    RoomLeaveView,
    RoomListCreateView,
    RoomMemberDetailView,
    RoomMembersView,
    RoomMessagesView,
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
    "RoomMemberDetailView",
    "RoomMembersView",
    "RoomMessagesView",
    "authenticate_view",
    "me_view",
    "refresh_token_view",
]
