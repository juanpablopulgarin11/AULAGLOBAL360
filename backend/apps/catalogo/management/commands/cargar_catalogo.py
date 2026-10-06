"""Sincroniza el catálogo (habilidades, criterios y plantillas de sesiones).

    python manage.py cargar_catalogo

Es idempotente: se puede ejecutar después de cada despliegue.

- Habilidades y criterios: desde ``biomecanica.reglas`` (fuente única, cubierta por las pruebas de paridad).
- Plantillas de sesiones: desde ``docs/datos/plantillas_progresion.json``.
"""
import json
import re
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from apps.catalogo.models import CriterioHMB, Habilidad, PlantillaSesion
from biomecanica.habilidades import CODIGO_A_HABILIDAD
from biomecanica.reglas import REGLAS

ICONOS = {
    "carrera": "🏃", "salto": "🦘", "marcha": "🚶", "salto_unipodal": "🦿", "lanzar": "⚾",
    "atrapar": "🧤", "patear": "⚽", "equilibrio": "🧘", "equilibrio_estatico": "🦩",
}
CAMPOS_PLANTILLA = ["titulo", "fase_pedagogica", "objetivo", "distribucion", "actividad_inicial",
                    "actividad_central", "actividad_final", "consigna", "criterio_eval"]


def codigo_componente(etiqueta: str) -> str:
    m = re.match(r"\[(HMB-[LME])\]", etiqueta)
    if not m:
        raise CommandError(f"Componente no reconocido: {etiqueta!r}")
    return m.group(1)


class Command(BaseCommand):
    help = "Carga o actualiza habilidades, criterios HMB y plantillas de sesiones."

    def add_arguments(self, parser):
        parser.add_argument("--plantillas", type=Path,
                            default=Path(settings.AULA360_DATOS_DIR) / "plantillas_progresion.json",
                            help="Ruta del JSON de plantillas de progresión")

    @transaction.atomic
    def handle(self, *args, **opts):
        ruta = opts["plantillas"]
        if not ruta.exists():
            raise CommandError(f"No existe {ruta}")
        plantillas = json.loads(ruta.read_text(encoding="utf-8"))["plantillas"]

        n_crit = n_plant = 0
        for orden, (codigo, nombre) in enumerate(CODIGO_A_HABILIDAD.items(), start=1):
            regla = REGLAS[nombre]
            habilidad, _ = Habilidad.objects.update_or_create(
                codigo=codigo,
                defaults={
                    "nombre": nombre,
                    "componente": codigo_componente(regla.componente),
                    "prueba_nro": regla.prueba_nro,
                    "protocolo": regla.protocolo,
                    "icono": ICONOS.get(codigo, ""),
                    "frases_profe": list(regla.frases),
                    "orden": orden,
                },
            )
            for i, c in enumerate(regla.criterios, start=1):
                CriterioHMB.objects.update_or_create(
                    habilidad=habilidad, orden=i,
                    defaults={"texto": c.texto, "fase": c.fase, "umbral_texto": c.umbral, "error_titulo": c.error},
                )
                n_crit += 1
            habilidad.criterios.filter(orden__gt=len(regla.criterios)).delete()

            sesiones = plantillas.get(nombre, [])
            for s in sesiones:
                PlantillaSesion.objects.update_or_create(
                    habilidad=habilidad, orden=s["orden"],
                    defaults={campo: s[campo] for campo in CAMPOS_PLANTILLA},
                )
                n_plant += 1
            habilidad.plantillas.filter(orden__gt=len(sesiones)).delete()

        sin_plantillas = list(Habilidad.objects.filter(plantillas__isnull=True).values_list("nombre", flat=True))
        self.stdout.write(self.style.SUCCESS(
            f"Catálogo sincronizado: {len(CODIGO_A_HABILIDAD)} habilidades, {n_crit} criterios, {n_plant} plantillas."))
        if sin_plantillas:
            self.stdout.write(self.style.WARNING(
                "Sin plantillas propias (usarán las de Carrera): " + ", ".join(sin_plantillas)))
