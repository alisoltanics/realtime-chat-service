from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

from .models import MAX_MESSAGE_LENGTH, Membership, Message, Room


class UserSerializer(serializers.Serializer):
    id = serializers.IntegerField(read_only=True)
    username = serializers.CharField(read_only=True)
    display_name = serializers.SerializerMethodField()

    def get_display_name(self, obj):
        full = obj.get_full_name()
        return full or obj.username


class RegisterSerializer(serializers.Serializer):
    username = serializers.RegexField(
        r"^[A-Za-z0-9_.-]{3,30}$",
        max_length=30,
        error_messages={"invalid": "only letters, digits, _ . - are allowed (3-30 chars)"},
    )
    password = serializers.CharField(min_length=8, max_length=128, write_only=True)
    display_name = serializers.CharField(max_length=80, required=False, allow_blank=True)


class ChatTokenObtainPairSerializer(TokenObtainPairSerializer):
    def validate(self, attrs):
        data = super().validate(attrs)
        data["user"] = UserSerializer(self.user).data
        return data


class RoomSerializer(serializers.ModelSerializer):
    member_count = serializers.IntegerField(read_only=True)
    last_message = serializers.SerializerMethodField()

    class Meta:
        model = Room
        fields = [
            "id",
            "name",
            "slug",
            "is_public",
            "created_at",
            "member_count",
            "last_message",
        ]
        read_only_fields = ["id", "slug", "created_at"]

    def get_last_message(self, obj):
        message = obj.messages.order_by("-id").first()
        if message is None:
            return None
        return {
            "id": message.id,
            "sender": message.sender.username,
            "text": message.text[:120],
            "created_at": message.created_at,
        }


class RoomCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Room
        fields = ["id", "name", "slug", "is_public", "created_at"]
        read_only_fields = ["id", "slug", "created_at"]

    def validate_name(self, value):
        value = value.strip()
        if len(value) < 2:
            raise serializers.ValidationError("name is too short")
        return value


class MessageSerializer(serializers.ModelSerializer):
    sender = UserSerializer(read_only=True)
    sender_username = serializers.CharField(source="sender.username", read_only=True)

    class Meta:
        model = Message
        fields = ["id", "room", "sender", "sender_username", "text", "client_id", "created_at"]
        read_only_fields = ["id", "room", "sender", "sender_username", "created_at"]

    def validate_text(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("text is empty")
        if len(value) > MAX_MESSAGE_LENGTH:
            raise serializers.ValidationError(
                f"text is too long (max {MAX_MESSAGE_LENGTH} chars)"
            )
        return value


class MessageCreateSerializer(serializers.Serializer):
    """Used by the realtime service (internal, service-token authenticated)."""

    room_id = serializers.IntegerField(min_value=1)
    sender_id = serializers.IntegerField(min_value=1)
    text = serializers.CharField(max_length=MAX_MESSAGE_LENGTH, trim_whitespace=True)
    client_id = serializers.CharField(max_length=64, required=False, allow_blank=True, default="")

    def validate_text(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("text is empty")
        return value


class MembershipSerializer(serializers.Serializer):
    id = serializers.IntegerField(read_only=True)
    user = UserSerializer(read_only=True)
    role = serializers.CharField(read_only=True)
    joined_at = serializers.DateTimeField(read_only=True)
    is_online = serializers.SerializerMethodField()

    def get_is_online(self, obj):
        # Presence is owned by the realtime service (in-memory); the REST API
        # simply echoes what the client observed over the socket.
        return False
