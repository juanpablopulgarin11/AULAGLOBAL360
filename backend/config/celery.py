"""Aplicación Celery: procesa videos y llamadas a Gemini fuera del ciclo de la petición."""
import os

from celery import Celery

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")

app = Celery("aulaglobal360")
app.config_from_object("django.conf:settings", namespace="CELERY")
app.autodiscover_tasks()
