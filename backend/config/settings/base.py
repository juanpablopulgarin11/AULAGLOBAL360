"""Configuración común de AULA GLOBAL 360. Los valores sensibles vienen de variables de entorno."""
import sys
from pathlib import Path

import environ

BASE_DIR = Path(__file__).resolve().parent.parent.parent          # backend/
REPO_DIR = BASE_DIR.parent                                        # raíz del repositorio

env = environ.Env()
environ.Env.read_env(BASE_DIR / ".env", overwrite=False)

SECRET_KEY = env("DJANGO_SECRET_KEY", default="solo-para-desarrollo-no-usar-en-produccion")
DEBUG = env.bool("DJANGO_DEBUG", default=False)
ALLOWED_HOSTS = env.list("DJANGO_ALLOWED_HOSTS", default=[])

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "apps.cuentas",
    "apps.catalogo",
    "apps.estudiantes",
    "apps.evaluaciones",
    "apps.planeacion",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"
WSGI_APPLICATION = "config.wsgi.application"
ASGI_APPLICATION = "config.asgi.application"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [BASE_DIR / "templates"],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

DATABASES = {"default": env.db("DATABASE_URL", default=f"sqlite:///{BASE_DIR / 'db.sqlite3'}")}
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

AUTH_USER_MODEL = "cuentas.Docente"
AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

LANGUAGE_CODE = "es-co"
TIME_ZONE = "America/Bogota"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
STATICFILES_DIRS = [BASE_DIR / "static"]
STORAGES = {
    "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
    "staticfiles": {"BACKEND": env("DJANGO_STATICFILES_BACKEND",
                                   default="django.contrib.staticfiles.storage.StaticFilesStorage")},
}

LOGIN_URL = "ingresar"
LOGIN_REDIRECT_URL = "panel"
LOGOUT_REDIRECT_URL = "inicio"

# Videos y fotogramas de menores: almacenamiento privado, nunca bajo MEDIA_URL público.
# Se sirven solo mediante vistas autenticadas.
PRIVATE_MEDIA_ROOT = Path(env("AULA360_PRIVATE_MEDIA_ROOT", default=str(BASE_DIR / "privado")))
AULA360_DIAS_RETENCION_VIDEO = env.int("AULA360_DIAS_RETENCION_VIDEO", default=30)
AULA360_MAX_SUBIDA_MB = env.int("AULA360_MAX_SUBIDA_MB", default=60)

# Detección de pose (MediaPipe). En macOS solo funciona con GPU (Metal); en Linux, CPU.
AULA360_MODELO_POSE = Path(env("AULA360_MODELO_POSE", default=str(BASE_DIR / "modelos" / "pose_landmarker_lite.task")))
AULA360_POSE_GPU = env.bool("AULA360_POSE_GPU", default=sys.platform == "darwin")

# Datos de referencia (reglas y plantillas extraídas de script.js)
AULA360_DATOS_DIR = REPO_DIR / "docs" / "datos"

# Gemini (fase 7): la clave vive solo en el servidor
GEMINI_API_KEY = env("GEMINI_API_KEY", default="")
GEMINI_MODEL = env("GEMINI_MODEL", default="")

# Celery: sin broker configurado las tareas corren en el mismo proceso
CELERY_BROKER_URL = env("CELERY_BROKER_URL", default="memory://")
CELERY_RESULT_BACKEND = env("CELERY_RESULT_BACKEND", default=None)
CELERY_TASK_ALWAYS_EAGER = env.bool("CELERY_TASK_ALWAYS_EAGER", default=True)
CELERY_TASK_EAGER_PROPAGATES = True
CELERY_TIMEZONE = TIME_ZONE
CELERY_BEAT_SCHEDULE = {
    "purgar-evidencias-vencidas": {"task": "evaluaciones.purgar_evidencias_vencidas", "schedule": 60 * 60 * 24},
}
CELERY_TASK_TIME_LIMIT = 5 * 60
