"""Domain models: rooms, memberships and messages.

Users reuse ``django.contrib.auth.models.User`` (no custom user model needed for
the MVP scope).
"""
from django.conf import settings
from django.core.validators import MaxLengthValidator, MinLengthValidator
from django.db import models
from django.db.models import Q
from django.db.models.functions import Length, Trim
from django.utils.text import slugify


MAX_MESSAGE_LENGTH = 4000


class Room(models.Model):
    name = models.CharField(max_length=80, validators=[MinLengthValidator(2)])
    slug = models.SlugField(max_length=90, unique=True)
    is_public = models.BooleanField(default=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="created_rooms",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["-created_at"], name="room_created_idx")]
        constraints = [
            models.CheckConstraint(
                condition=Length(Trim("name")) >= 2,
                name="room_name_trimmed_min_2",
            ),
            models.CheckConstraint(
                condition=Length(Trim("slug")) > 0,
                name="room_slug_not_blank",
            ),
        ]

    def save(self, *args, **kwargs):
        self.name = self.name.strip()
        if not self.slug:
            base = slugify(self.name, allow_unicode=False) or "room"
            candidate = base
            suffix = 1
            while Room.objects.filter(slug=candidate).exclude(pk=self.pk).exists():
                suffix += 1
                candidate = f"{base}-{suffix}"
            self.slug = candidate
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.name} ({self.slug})"


class Membership(models.Model):
    class Role(models.TextChoices):
        MEMBER = "member", "Member"
        ADMIN = "admin", "Admin"

    room = models.ForeignKey(
        Room,
        on_delete=models.CASCADE,
        related_name="memberships",
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="memberships",
    )
    role = models.CharField(
        max_length=10,
        choices=Role.choices,
        default=Role.MEMBER,
    )
    joined_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["room", "user"], name="uniq_membership_room_user"
            ),
            models.CheckConstraint(
                condition=Q(role__in=[Role.MEMBER, Role.ADMIN]),
                name="membership_role_valid",
            ),
        ]
        indexes = [models.Index(fields=["user", "-joined_at"], name="member_user_idx")]

    def __str__(self):
        return f"{self.user_id}@{self.room_id}"


class Message(models.Model):
    room = models.ForeignKey(
        Room, on_delete=models.CASCADE, related_name="messages"
    )
    sender = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="messages",
    )
    text = models.TextField(
        validators=[MaxLengthValidator(MAX_MESSAGE_LENGTH)],
    )
    # Client generated id, used to make sends idempotent and to let the UI
    # reconcile its optimistic bubble with the stored message.
    client_id = models.CharField(
        max_length=64,
        blank=True,
        default="",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["id"]
        indexes = [
            # Room history is always read newest-first/oldest-first per room,
            # this index serves the keyset pagination on (room_id, id).
            models.Index(fields=["room", "-created_at", "-id"], name="msg_room_created_idx"),
            models.Index(fields=["room", "-id"], name="msg_room_id_idx"),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["room", "sender", "client_id"],
                condition=~Q(client_id=""),
                name="uniq_message_client_id",
            ),
            models.CheckConstraint(
                condition=(Length(Trim("text")) >= 1)
                & (Length("text") <= MAX_MESSAGE_LENGTH),
                name="message_text_trimmed_length_valid",
            ),
        ]

    def save(self, *args, **kwargs):
        self.text = self.text.strip()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"msg#{self.pk} room={self.room_id} sender={self.sender_id}"
