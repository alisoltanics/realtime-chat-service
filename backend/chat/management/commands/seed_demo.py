"""Seed demo users/rooms/messages so two-browser testing is quick."""
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.db import transaction

from chat.models import Membership, Message, Room

DEMO_USERS = [
    ("ali", "Ali", "ali12345"),
    ("sara", "Sara", "sara12345"),
]
DEMO_ROOMS = [("general", "عمومی"), ("frontend", "فرانت‌اند"), ("random", "تست")]


class Command(BaseCommand):
    help = "Create demo users, public rooms and a bit of history."

    def add_arguments(self, parser):
        parser.add_argument("--messages", type=int, default=0, help="messages to seed per room")

    @transaction.atomic
    def handle(self, *args, **options):
        user_model = get_user_model()
        users = []
        for username, first_name, password in DEMO_USERS:
            user, created = user_model.objects.get_or_create(
                username=username, defaults={"first_name": first_name}
            )
            if created:
                user.set_password(password)
                user.save(update_fields=["password"])
            users.append(user)
            self.stdout.write(f"user {username} / {password} ready")

        samples = [
            "سلام، این نسخه اول چت است.",
            "پیام باید بدون رفرش صفحه نمایش داده شود.",
            "وضعیت آنلاین از سرویس Node می‌آید.",
            "تست تکرار نمایش پیام (dedupe).",
        ]

        for slug, name in DEMO_ROOMS:
            room, _ = Room.objects.get_or_create(
                slug=slug, defaults={"name": name, "is_public": True, "created_by": users[0]}
            )
            for user in users:
                Membership.objects.get_or_create(room=room, user=user)
            self.stdout.write(f"room {slug} ready")
            # Idempotent: (room, sender, client_id) is unique, so re-running the
            # command only fills in what is missing.
            for index in range(options["messages"]):
                sender = users[index % len(users)]
                Message.objects.get_or_create(
                    room=room,
                    sender=sender,
                    client_id=f"seed-{room.slug}-{index}",
                    defaults={"text": samples[index % len(samples)]},
                )
        self.stdout.write(self.style.SUCCESS("demo data ready"))
