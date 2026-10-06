from .base import *  # noqa: F401,F403
from .base import BASE_DIR

DATABASES = {"default": {"ENGINE": "django.db.backends.sqlite3", "NAME": ":memory:"}}
PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]
PRIVATE_MEDIA_ROOT = BASE_DIR / ".pytest_cache" / "privado"
CELERY_TASK_ALWAYS_EAGER = True
