from django.conf import settings
from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from chat.models import Membership, Message, Room
from chat.settings import MembershipRole

# Read from settings so the suite passes whatever INTERNAL_SERVICE_TOKEN the
# environment provides instead of hardcoding one value.
SERVICE_HEADERS = {"HTTP_X_SERVICE_TOKEN": settings.INTERNAL_SERVICE_TOKEN}


class AuthApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()

    def test_register_returns_token_pair(self):
        response = self.client.post(
            "/api/auth/register/",
            {"username": "ali", "password": "sup3rsecret", "display_name": "Ali"},
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        self.assertIn("access", response.data)
        self.assertEqual(response.data["user"]["username"], "ali")

    def test_duplicate_username_conflict(self):
        self.client.post(
            "/api/auth/register/", {"username": "ali", "password": "sup3rsecret"}, format="json"
        )
        response = self.client.post(
            "/api/auth/register/", {"username": "ali", "password": "sup3rsecret"}, format="json"
        )
        self.assertEqual(response.status_code, 409)

    def test_me_requires_token(self):
        self.assertEqual(self.client.get("/api/auth/me/").status_code, 401)
        user = get_user_model().objects.create_user("sara", password="sup3rsecret")
        token = str(RefreshToken.for_user(user).access_token)
        response = self.client.get(
            "/api/auth/me/", HTTP_AUTHORIZATION=f"Bearer {token}"
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["username"], "sara")

    def test_login_returns_token_pair(self):
        get_user_model().objects.create_user("ali", password="sup3rsecret")
        response = self.client.post(
            "/api/auth/login/", {"username": "ali", "password": "sup3rsecret"}, format="json"
        )
        self.assertEqual(response.status_code, 200)
        self.assertIn("access", response.data)
        self.assertIn("refresh", response.data)
        self.assertEqual(response.data["user"]["username"], "ali")

    def test_login_with_wrong_password(self):
        get_user_model().objects.create_user("ali", password="sup3rsecret")
        response = self.client.post(
            "/api/auth/login/", {"username": "ali", "password": "nope"}, format="json"
        )
        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.data["error"]["code"], "invalid_credentials")

    def test_token_obtain_pair_endpoint(self):
        get_user_model().objects.create_user("ali", password="sup3rsecret")
        response = self.client.post(
            "/api/auth/token/", {"username": "ali", "password": "sup3rsecret"}, format="json"
        )
        self.assertEqual(response.status_code, 200)
        self.assertIn("access", response.data)

    def test_refresh_token_endpoint(self):
        user = get_user_model().objects.create_user("ali", password="sup3rsecret")
        refresh = str(RefreshToken.for_user(user))
        response = self.client.post("/api/auth/refresh/", {"refresh": refresh}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertIn("access", response.data)


class ErrorEnvelopeTests(TestCase):
    """Every error the API can return uses the same {"error": {code, detail}} shape."""

    def setUp(self):
        self.ali = get_user_model().objects.create_user("ali", password="sup3rsecret")
        self.room = Room.objects.create(name="Public", slug="public", is_public=True)
        self.client = APIClient()
        token = str(RefreshToken.for_user(self.ali).access_token)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")

    def assert_envelope(self, response, status, code):
        self.assertEqual(response.status_code, status)
        self.assertEqual(list(response.data), ["error"], f"unexpected body: {response.data}")
        self.assertEqual(response.data["error"]["code"], code)
        self.assertIn("detail", response.data["error"])

    def test_unauthenticated_is_enveloped(self):
        self.assert_envelope(APIClient().get("/api/rooms/"), 401, "not_authenticated")

    def test_not_found_is_enveloped(self):
        self.assert_envelope(self.client.get("/api/rooms/missing/messages/"), 404, "not_found")

    def test_serializer_error_is_enveloped(self):
        response = self.client.post(
            f"/api/rooms/{self.room.slug}/messages/", {"text": "  "}, format="json"
        )
        self.assert_envelope(response, 400, "validation_error")

    def test_manual_error_is_left_alone(self):
        response = self.client.get(f"/api/rooms/{self.room.slug}/messages/?before_id=abc")
        self.assert_envelope(response, 400, "invalid_cursor")

    def test_service_token_error_is_enveloped(self):
        response = self.client.post(
            "/api/internal/verify-token/",
            {"token": "x"},
            format="json",
            HTTP_X_SERVICE_TOKEN="wrong",
        )
        self.assert_envelope(response, 403, "service_token_invalid")


class RoomApiTests(TestCase):
    def setUp(self):
        user_model = get_user_model()
        self.ali = user_model.objects.create_user("ali", password="sup3rsecret")
        self.sara = user_model.objects.create_user("sara", password="sup3rsecret")
        self.mona = user_model.objects.create_user("mona", password="sup3rsecret")
        self.public = Room.objects.create(name="Public", slug="public", is_public=True)
        self.private = Room.objects.create(name="Private", slug="private", is_public=False)
        Membership.objects.create(room=self.private, user=self.sara)

        self.client = APIClient()
        token = str(RefreshToken.for_user(self.ali).access_token)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")

    def test_create_room_makes_creator_admin(self):
        response = self.client.post("/api/rooms/", {"name": "New Room"}, format="json")
        self.assertEqual(response.status_code, 201)
        room = Room.objects.get(slug=response.data["slug"])
        membership = Membership.objects.get(room=room, user=self.ali)
        self.assertEqual(membership.role, MembershipRole.ADMIN)

    def test_admin_can_add_member_to_private_room(self):
        created = self.client.post(
            "/api/rooms/",
            {"name": "Secret", "is_public": False, "member_usernames": ["sara"]},
            format="json",
        )
        self.assertEqual(created.status_code, 201)
        self.assertFalse(created.data["is_public"], "room must really be private")
        slug = created.data["slug"]

        added = self.client.post(f"/api/rooms/{slug}/members/", {"username": "mona"}, format="json")
        self.assertEqual(added.status_code, 201)
        self.assertEqual(added.data["user"]["username"], "mona")
        self.assertTrue(Membership.objects.filter(room__slug=slug, user=self.mona).exists())

        # Adding the same member twice is idempotent, not a duplicate row.
        again = self.client.post(f"/api/rooms/{slug}/members/", {"username": "mona"}, format="json")
        self.assertEqual(again.status_code, 200)
        self.assertEqual(Membership.objects.filter(room__slug=slug).count(), 3)

    def test_non_admin_cannot_add_members(self):
        response = self.client.post(
            f"/api/rooms/{self.public.slug}/members/", {"username": "sara"}, format="json"
        )
        self.assertEqual(response.status_code, 403)
        self.assertEqual(Membership.objects.filter(room=self.public).count(), 0)

    def test_add_member_unknown_user_is_404(self):
        created = self.client.post("/api/rooms/", {"name": "Secret 3"}, format="json")
        response = self.client.post(
            f"/api/rooms/{created.data['slug']}/members/", {"username": "ghost"}, format="json"
        )
        self.assertEqual(response.status_code, 404)

    def test_added_member_can_read_private_room(self):
        created = self.client.post(
            "/api/rooms/",
            {"name": "Secret 2", "is_public": False, "member_usernames": ["mona"]},
            format="json",
        )
        slug = created.data["slug"]
        self.assertFalse(created.data["is_public"])
        self.client.post(f"/api/rooms/{slug}/members/", {"username": "sara"}, format="json")

        sara_client = APIClient()
        token = str(RefreshToken.for_user(self.sara).access_token)
        sara_client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")

        self.assertEqual(sara_client.get(f"/api/rooms/{slug}/").status_code, 200)
        self.assertIn(slug, [r["slug"] for r in sara_client.get("/api/rooms/").data["results"]])

    def test_private_room_hidden_from_non_members(self):
        slugs = [r["slug"] for r in self.client.get("/api/rooms/").data["results"]]
        self.assertIn("public", slugs)
        self.assertNotIn("private", slugs)

    def test_private_room_detail_forbidden(self):
        response = self.client.get("/api/rooms/private/")
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.data["error"]["code"], "permission_denied")

    def test_join_public_room_creates_membership(self):
        response = self.client.post("/api/rooms/public/join/")
        self.assertEqual(response.status_code, 201)
        self.assertTrue(Membership.objects.filter(room=self.public, user=self.ali).exists())

    def test_join_private_room_forbidden(self):
        response = self.client.post("/api/rooms/private/join/")
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.data["error"]["code"], "room_private")


class MessagePaginationTests(TestCase):
    def setUp(self):
        self.ali = get_user_model().objects.create_user("ali", password="sup3rsecret")
        self.room = Room.objects.create(name="Public", slug="public", is_public=True)
        for index in range(25):
            Message.objects.create(
                room=self.room, sender=self.ali, text=f"m{index}", client_id=f"c{index}"
            )
        self.other_room = Room.objects.create(name="Other", slug="other", is_public=True)
        Message.objects.create(room=self.other_room, sender=self.ali, text="other-room")

        self.client = APIClient()
        token = str(RefreshToken.for_user(self.ali).access_token)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")

    def test_keyset_pagination_walks_backwards(self):
        first = self.client.get("/api/rooms/public/messages/?limit=10").data
        self.assertEqual(len(first["results"]), 10)
        self.assertTrue(first["has_more"])
        # newest message last
        self.assertEqual(first["results"][-1]["text"], "m24")
        self.assertEqual(first["results"][0]["text"], "m15")

        second = self.client.get(
            f"/api/rooms/public/messages/?limit=10&before_id={first['next_before_id']}"
        ).data
        self.assertEqual(second["results"][0]["text"], "m5")
        self.assertEqual(second["results"][-1]["text"], "m14")

        third = self.client.get(
            f"/api/rooms/public/messages/?limit=10&before_id={second['next_before_id']}"
        ).data
        self.assertEqual(len(third["results"]), 5)
        self.assertFalse(third["has_more"])
        self.assertIsNone(third["next_before_id"])
        self.assertEqual(third["results"][0]["text"], "m0")

    def test_pagination_ignores_other_rooms(self):
        data = self.client.get("/api/rooms/public/messages/?limit=100").data
        self.assertTrue(all(m["text"] != "other-room" for m in data["results"]))

    def test_rest_post_without_client_id_always_creates(self):
        """No client_id means no idempotency key, so every POST is a new row."""
        url = "/api/rooms/public/messages/"
        first = self.client.post(url, {"text": "first"}, format="json")
        second = self.client.post(url, {"text": "second"}, format="json")
        self.assertEqual(first.status_code, 201)
        self.assertEqual(second.status_code, 201)
        self.assertNotEqual(first.data["id"], second.data["id"])
        self.assertEqual(first.data["text"], "first")
        self.assertEqual(second.data["text"], "second")

    def test_rest_post_with_client_id_is_idempotent(self):
        url = "/api/rooms/public/messages/"
        payload = {"text": "retry me", "client_id": "rest-1"}
        first = self.client.post(url, payload, format="json")
        second = self.client.post(url, payload, format="json")
        self.assertEqual(first.status_code, 201)
        self.assertEqual(second.status_code, 200)
        self.assertEqual(first.data["id"], second.data["id"])

    def test_invalid_cursor(self):
        response = self.client.get("/api/rooms/public/messages/?before_id=abc")
        self.assertEqual(response.status_code, 400)


class InternalApiTests(TestCase):
    def setUp(self):
        self.ali = get_user_model().objects.create_user("ali", password="sup3rsecret")
        self.sara = get_user_model().objects.create_user("sara", password="sup3rsecret")
        self.room = Room.objects.create(name="Public", slug="public", is_public=True)
        self.private = Room.objects.create(name="Private", slug="private", is_public=False)
        Membership.objects.create(room=self.private, user=self.sara)
        self.ali_token = str(RefreshToken.for_user(self.ali).access_token)
        self.sara_token = str(RefreshToken.for_user(self.sara).access_token)
        self.client = APIClient()

    def test_internal_requires_service_token(self):
        response = self.client.post(
            "/api/internal/verify-token/", {"token": self.ali_token}, format="json"
        )
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.data["error"]["code"], "service_token_invalid")

    def test_internal_rejects_wrong_service_token(self):
        response = self.client.post(
            "/api/internal/verify-token/",
            {"token": self.ali_token},
            format="json",
            HTTP_X_SERVICE_TOKEN="not-the-secret",
        )
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.data["error"]["code"], "service_token_invalid")

    def test_verify_token_returns_identity(self):
        response = self.client.post(
            "/api/internal/verify-token/",
            {"token": self.ali_token},
            format="json",
            **SERVICE_HEADERS,
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["user"]["id"], self.ali.id)

    def test_verify_token_rejects_garbage(self):
        response = self.client.post(
            "/api/internal/verify-token/",
            {"token": "not-a-token"},
            format="json",
            **SERVICE_HEADERS,
        )
        self.assertEqual(response.status_code, 401)

    def test_authorize_room_public_and_private(self):
        public = self.client.post(
            "/api/internal/authorize-room/",
            {"token": self.ali_token, "room": "public"},
            format="json",
            **SERVICE_HEADERS,
        ).data
        self.assertTrue(public["access"]["can_read"])

        private = self.client.post(
            "/api/internal/authorize-room/",
            {"token": self.ali_token, "room": "private"},
            format="json",
            **SERVICE_HEADERS,
        ).data
        self.assertFalse(private["access"]["can_read"])

        member = self.client.post(
            "/api/internal/authorize-room/",
            {"token": self.sara_token, "room": "private"},
            format="json",
            **SERVICE_HEADERS,
        ).data
        self.assertTrue(member["access"]["can_read"])

    def test_create_message_is_idempotent_per_client_id(self):
        payload = {
            "room_id": self.room.id,
            "sender_id": self.ali.id,
            "text": "hello",
            "client_id": "abc-1",
        }
        first = self.client.post(
            "/api/internal/messages/", payload, format="json", **SERVICE_HEADERS
        )
        self.assertEqual(first.status_code, 201)
        self.assertTrue(first.data["created"])

        second = self.client.post(
            "/api/internal/messages/", payload, format="json", **SERVICE_HEADERS
        )
        self.assertEqual(second.status_code, 200)
        self.assertFalse(second.data["created"])
        self.assertEqual(first.data["message"]["id"], second.data["message"]["id"])
        self.assertEqual(Message.objects.count(), 1)

    def test_create_message_rejects_non_member_of_private_room(self):
        response = self.client.post(
            "/api/internal/messages/",
            {
                "room_id": self.private.id,
                "sender_id": self.ali.id,
                "text": "sneaky",
                "client_id": "x1",
            },
            format="json",
            **SERVICE_HEADERS,
        )
        self.assertEqual(response.status_code, 403)

    def test_create_message_rejects_empty_text(self):
        response = self.client.post(
            "/api/internal/messages/",
            {"room_id": self.room.id, "sender_id": self.ali.id, "text": "   "},
            format="json",
            **SERVICE_HEADERS,
        )
        self.assertEqual(response.status_code, 400)

    def test_room_members_endpoint(self):
        response = self.client.get(
            "/api/internal/room-members/?room=public", **SERVICE_HEADERS
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["member_ids"], [])
