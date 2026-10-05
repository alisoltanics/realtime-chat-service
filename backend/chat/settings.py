"""Shared domain choices and application-level limits."""

from django.db import models


class MembershipRole(models.TextChoices):
    MEMBER = "member", "Member"
    ADMIN = "admin", "Admin"


MAX_MESSAGE_LENGTH = 4000
