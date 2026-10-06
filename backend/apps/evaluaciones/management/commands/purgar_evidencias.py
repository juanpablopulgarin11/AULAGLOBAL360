from django.core.management.base import BaseCommand

from apps.evaluaciones.tasks import purgar_evidencias_vencidas


class Command(BaseCommand):
    help = "Borra videos e imágenes de fotogramas vencidos según AULA360_DIAS_RETENCION_VIDEO."

    def add_arguments(self, parser):
        parser.add_argument("--dias", type=int, default=None, help="Sobrescribe la retención configurada")

    def handle(self, *args, **opts):
        n = purgar_evidencias_vencidas(opts["dias"])
        self.stdout.write(self.style.SUCCESS(f"Evidencias purgadas: {n} evaluaciones."))
