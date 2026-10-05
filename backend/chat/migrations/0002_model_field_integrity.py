from django.core.validators import MaxLengthValidator, MinLengthValidator
from django.db import migrations, models
from django.db.models import Q
from django.db.models.functions import Length, Trim


class Migration(migrations.Migration):
    dependencies = [("chat", "0001_initial")]

    operations = [
        migrations.AlterField(
            model_name="room",
            name="name",
            field=models.CharField(max_length=80, validators=[MinLengthValidator(2)]),
        ),
        migrations.AlterField(
            model_name="message",
            name="text",
            field=models.TextField(validators=[MaxLengthValidator(4000)]),
        ),
        migrations.AddConstraint(
            model_name="room",
            constraint=models.CheckConstraint(
                condition=Length(Trim("name")) >= 2,
                name="room_name_trimmed_min_2",
            ),
        ),
        migrations.AddConstraint(
            model_name="room",
            constraint=models.CheckConstraint(
                condition=Length(Trim("slug")) > 0,
                name="room_slug_not_blank",
            ),
        ),
        migrations.AddConstraint(
            model_name="membership",
            constraint=models.CheckConstraint(
                condition=Q(role__in=["member", "admin"]),
                name="membership_role_valid",
            ),
        ),
        migrations.AddConstraint(
            model_name="message",
            constraint=models.CheckConstraint(
                condition=(Length(Trim("text")) >= 1) & (Length("text") <= 4000),
                name="message_text_trimmed_length_valid",
            ),
        ),
    ]
