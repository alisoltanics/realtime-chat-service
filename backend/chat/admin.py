from django.contrib import admin

from .models import Membership, Message, Room


@admin.register(Room)
class RoomAdmin(admin.ModelAdmin):
    list_display = ("id", "name", "slug", "is_public", "created_at")
    search_fields = ("name", "slug")
    list_filter = ("is_public",)


@admin.register(Membership)
class MembershipAdmin(admin.ModelAdmin):
    list_display = ("id", "room", "user", "role", "joined_at")
    list_filter = ("role",)
    search_fields = ("user__username", "room__slug")


@admin.register(Message)
class MessageAdmin(admin.ModelAdmin):
    list_display = ("id", "room", "sender", "created_at")
    list_filter = ("room",)
    search_fields = ("sender__username",)
    # Message bodies are intentionally not searchable/logged in admin listings.
    date_hierarchy = "created_at"