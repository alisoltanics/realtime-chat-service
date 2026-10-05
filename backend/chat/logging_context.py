"""Context-local storage for the request id and authenticated subject."""
from contextvars import ContextVar

_request_id = ContextVar("request_id", default=None)
_subject = ContextVar("subject", default=None)


def set_request_id(value):
    _request_id.set(value)


def get_request_id():
    return _request_id.get()


def set_subject(user_id):
    _subject.set(user_id)


def get_subject():
    return _subject.get()
