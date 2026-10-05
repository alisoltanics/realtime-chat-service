"""Health endpoint."""

from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView


class HealthView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request):
        db_ok = True
        try:
            get_user_model().objects.exists()
        except Exception:  # pragma: no cover - only on DB outage
            db_ok = False
        payload = {
            "status": "ok" if db_ok else "degraded",
            "service": "django-api",
            "database": "up" if db_ok else "down",
            "time": timezone.now(),
        }
        code = status.HTTP_200_OK if db_ok else status.HTTP_503_SERVICE_UNAVAILABLE
        return Response(payload, status=code)
