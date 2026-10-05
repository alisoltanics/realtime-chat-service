from django.contrib import admin
from django.urls import include, path

from chat.views import HealthView

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/", include("chat.urls")),
    path("healthz", HealthView.as_view(), name="healthz"),
]