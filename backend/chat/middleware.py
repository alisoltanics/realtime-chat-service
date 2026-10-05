import time

from chat.logging import get_logger, new_request_id
from chat.logging_context import set_request_id


class RequestIdMiddleware:
    """Propagate/assign an id per request and emit one structured access log.

    The id is taken from the incoming ``x-request-id`` header when present, so a
    call can be traced across the Django API, the realtime service and the
    browser. Message bodies and credentials are never logged.
    """

    def __init__(self, get_response):
        self.get_response = get_response
        self.logger = get_logger("django-api.access")

    def __call__(self, request):
        request_id = request.headers.get("x-request-id") or new_request_id()
        set_request_id(request_id)
        request.request_id = request_id
        started = time.perf_counter()
        try:
            response = self.get_response(request)
            response["x-request-id"] = request_id
            self.logger.info(
                "request.completed",
                extra={
                    "method": request.method,
                    "path": request.path,
                    "status": response.status_code,
                    "duration_ms": round((time.perf_counter() - started) * 1000, 2),
                    "client_ip": request.META.get("REMOTE_ADDR", ""),
                },
            )
        except Exception:
            self.logger.exception(
                "request.failed",
                extra={
                    "method": request.method,
                    "path": request.path,
                    "duration_ms": round((time.perf_counter() - started) * 1000, 2),
                },
            )
            raise
        finally:
            set_request_id(None)
        return response