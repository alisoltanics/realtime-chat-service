from django.contrib import admin
from django.urls import include, path

from chat.views.v1 import HealthView

urlpatterns = [
    path("admin/", admin.site.urls),
    # Keep unversioned paths as compatibility aliases for older clients.
    path("api/v1/", include("chat.urls")),
    path("api/", include("chat.urls")),
    path("healthz", HealthView.as_view(), name="healthz"),
]
