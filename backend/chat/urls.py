from django.urls import path

from .views import v1 as views

urlpatterns = [
    # health
    path("healthz", views.HealthView.as_view(), name="api-healthz"),
    # auth
    path("auth/register/", views.RegisterView.as_view(), name="register"),
    path("auth/token/", views.ChatTokenObtainPairView.as_view(), name="token-obtain"),
    path("auth/login/", views.authenticate_view, name="login"),
    path("auth/refresh/", views.refresh_token_view, name="token-refresh"),
    path("auth/me/", views.me_view, name="me"),
    # rooms
    path("rooms/", views.RoomListCreateView.as_view(), name="room-list"),
    path("rooms/<slug:slug>/", views.RoomDetailView.as_view(), name="room-detail"),
    path("rooms/<slug:slug>/join/", views.RoomJoinView.as_view(), name="room-join"),
    path("rooms/<slug:slug>/leave/", views.RoomLeaveView.as_view(), name="room-leave"),
    path("rooms/<slug:slug>/members/", views.RoomMembersView.as_view(), name="room-members"),
    path("rooms/<slug:slug>/messages/", views.RoomMessagesView.as_view(), name="room-messages"),
    # internal (realtime service)
    path(
        "internal/verify-token/",
        views.InternalVerifyTokenView.as_view(),
        name="internal-verify-token",
    ),
    path(
        "internal/authorize-room/",
        views.InternalAuthorizeRoomView.as_view(),
        name="internal-authorize-room",
    ),
    path(
        "internal/messages/",
        views.InternalCreateMessageView.as_view(),
        name="internal-messages",
    ),
    path(
        "internal/room-members/",
        views.InternalRoomMembersView.as_view(),
        name="internal-room-members",
    ),
]
