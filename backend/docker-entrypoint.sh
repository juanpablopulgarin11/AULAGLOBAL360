#!/bin/sh
# Prepara la base de datos, el catálogo y el modelo de pose antes de iniciar el proceso.
set -e
if [ "${AULA360_PREPARAR:-1}" = "1" ]; then
    python manage.py migrate --noinput
    python manage.py cargar_catalogo
    python manage.py descargar_modelo_pose
    python -c "import os, django; django.setup(); from apps.cuentas.models import Docente, Institucion; inst, _ = Institucion.objects.get_or_create(nombre='Colegio San Jose'); u, creado = Docente.objects.get_or_create(username=os.environ.get('AULA360_DEMO_USER', 'profesor_juan'), defaults={'first_name': 'Juan Pablo', 'last_name': 'Pulgarin', 'email': 'juanpablo@example.com', 'institucion': inst, 'is_active': True}); (u.set_password(os.environ.get('AULA360_DEMO_PASSWORD', 'AulaGlobal2026*')), u.save()) if creado else None"
fi
exec "$@"
