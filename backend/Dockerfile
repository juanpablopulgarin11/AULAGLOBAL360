# AULA GLOBAL 360 · imagen para web (gunicorn), worker y beat de Celery.
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    DJANGO_SETTINGS_MODULE=config.settings.prod \
    AULA360_POSE_GPU=false

# Bibliotecas de sistema que usan OpenCV/MediaPipe en Linux (sin interfaz gráfica)
RUN apt-get update && apt-get install -y --no-install-recommends \
        libgl1 libglib2.0-0 libegl1 libgles2 ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements/ requirements/
RUN pip install -r requirements/prod.txt

COPY . .
# Los datos de referencia (plantillas) viven en docs/datos del repositorio
COPY --from=datos . /app/datos
ENV AULA360_DATOS_DIR=/app/datos

RUN useradd --create-home aula && mkdir -p /app/privado /app/modelos /app/staticfiles && chown -R aula /app
USER aula

RUN DJANGO_SECRET_KEY=solo-para-compilar DJANGO_ALLOWED_HOSTS=localhost python manage.py collectstatic --noinput

EXPOSE 8000
ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["gunicorn", "config.wsgi:application", "--bind", "0.0.0.0:8000", "--workers", "3", "--timeout", "120"]
