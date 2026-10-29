"""Pruebas contra MySQL, la base de producción (Cloud SQL):

    DATABASE_URL=mysql://usuario:clave@127.0.0.1:3306/aula .venv/bin/python -m pytest --ds=config.settings.test_mysql
"""
from .base import env
from .test import *  # noqa: F401,F403

DATABASES = {"default": env.db("DATABASE_URL")}
DATABASES["default"]["OPTIONS"] = {"charset": "utf8mb4"}
DATABASES["default"]["TEST"] = {"CHARSET": "utf8mb4", "COLLATION": "utf8mb4_0900_ai_ci"}
