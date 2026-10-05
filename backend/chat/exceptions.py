"""
One error shape for the whole API.

Hand-written responses already use ``{"error": {"code", "detail"}}``; DRF's built-in
errors (``{"detail": ...}`` and serializer field errors) did not. This handler
wraps the DRF response into the same envelope so clients only parse one format.
"""
import re

from django.core.exceptions import PermissionDenied as DjangoPermissionDenied
from django.http import Http404
from rest_framework import exceptions
from rest_framework.views import exception_handler as drf_exception_handler


def _normalize(exc):
    """DRF rewrites Django's exceptions internally; do it here so the error
    code we report matches the response (Http404 -> not_found)."""
    if isinstance(exc, Http404):
        return exceptions.NotFound(*exc.args)
    if isinstance(exc, DjangoPermissionDenied):
        return exceptions.PermissionDenied(*exc.args)
    return exc


def _default_code(exc):
    """Stable machine code for a DRF/Django exception (NotFound -> not_found)."""
    code = getattr(exc, "default_code", None)
    if isinstance(code, str) and code:
        return code
    codes = exc.get_codes() if hasattr(exc, "get_codes") else None
    if isinstance(codes, str) and codes:
        return codes
    return re.sub(r"(?<!^)(?=[A-Z])", "_", type(exc).__name__).lower()


def exception_handler(exc, context):
    exc = _normalize(exc)
    response = drf_exception_handler(exc, context)
    if response is None:
        return None

    data = response.data
    if not isinstance(data, dict) or "error" in data:
        return response  # already in the project envelope

    if "detail" in data:
        detail = data["detail"]
        response.data = {
            "error": {
                "code": data.get("code") or _default_code(exc),
                # ValidationError puts a per-field dict under "detail".
                "detail": detail if isinstance(detail, str) else {"detail": detail},
            }
        }
        return response

    # Serializer errors: {"text": ["This field is required."], ...}
    response.data = {"error": {"code": "validation_error", "detail": data}}
    return response
