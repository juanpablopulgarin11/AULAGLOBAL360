#!/bin/sh
# Prepara la base de datos, el catálogo y el modelo de pose antes de iniciar el proceso.
set -e
if [ "${AULA360_PREPARAR:-1}" = "1" ]; then
    python manage.py migrate --noinput
    python manage.py cargar_catalogo
    python manage.py descargar_modelo_pose
fi
exec "$@"
