#!/bin/sh
# Prepara la base de datos, el catálogo y el modelo de pose antes de iniciar el proceso.
# Si la base de datos (p. ej. Cloud SQL) ya tiene el catálogo completo y el usuario demo, omite la recarga para un arranque en frío rápido (~2-3 s).
set -e
if [ "${AULA360_PREPARAR:-1}" = "1" ]; then
    python manage.py descargar_modelo_pose
    python -c "
import os, django
from django.core.management import call_command
django.setup()
from django.db import connection
from apps.catalogo.models import CriterioHMB, PlantillaSesion
from apps.cuentas.models import Docente, Institucion

tablas = set(connection.introspection.table_names())
if 'catalogo_plantillasesion' not in tablas:
    call_command('migrate', interactive=False)
elif len(connection.introspection.django_table_names(only_existing=True)) < 10:
    call_command('migrate', interactive=False)

try:
    n_plantillas = PlantillaSesion.objects.count()
    n_criterios = CriterioHMB.objects.count()
except Exception:
    call_command('migrate', interactive=False)
    n_plantillas, n_criterios = 0, 0

if n_plantillas < 108 or n_criterios < 45:
    call_command('cargar_catalogo')

inst, _ = Institucion.objects.get_or_create(nombre='Colegio San Jose')
u, creado = Docente.objects.get_or_create(
    username=os.environ.get('AULA360_DEMO_USER', 'profesor_juan'),
    defaults={'first_name': 'Juan Pablo', 'last_name': 'Pulgarin', 'email': 'juanpablo@example.com', 'institucion': inst, 'is_active': True},
)
if creado:
    u.set_password(os.environ.get('AULA360_DEMO_PASSWORD', 'AulaGlobal2026*'))
    u.save()
"
fi
exec "$@"
