from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [("chat", "0002_model_field_integrity")]

    operations = [
        migrations.RemoveIndex(
            model_name="membership",
            name="member_user_idx",
        ),
        migrations.RemoveIndex(
            model_name="message",
            name="msg_room_created_idx",
        ),
    ]
