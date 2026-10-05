"""Message persistence and idempotency operations."""

from ..models import Message


def persist_message(*, room, sender, text, client_id=""):
    """Persist a message, deduplicating retries that reuse their client ID."""
    if not client_id:
        return Message.objects.create(room=room, sender=sender, text=text), True

    return Message.objects.get_or_create(
        room=room,
        sender=sender,
        client_id=client_id,
        defaults={"text": text},
    )
