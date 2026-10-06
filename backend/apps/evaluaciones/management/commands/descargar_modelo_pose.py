"""Descarga el modelo de MediaPipe Pose (el mismo que usa la versión web) y verifica su huella.

    python manage.py descargar_modelo_pose
"""
import hashlib
import tempfile
import urllib.request
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

URL = "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task"
SHA256 = "59929e1d1ee95287735ddd833b19cf4ac46d29bc7afddbbf6753c459690d574a"


def sha256(ruta: Path) -> str:
    h = hashlib.sha256()
    with ruta.open("rb") as f:
        for bloque in iter(lambda: f.read(1 << 20), b""):
            h.update(bloque)
    return h.hexdigest()


class Command(BaseCommand):
    help = "Descarga pose_landmarker_lite.task en AULA360_MODELO_POSE y verifica su SHA-256."

    def add_arguments(self, parser):
        parser.add_argument("--forzar", action="store_true", help="Descargar aunque ya exista")

    def handle(self, *args, **opts):
        destino = Path(settings.AULA360_MODELO_POSE)
        if destino.exists() and not opts["forzar"]:
            if sha256(destino) == SHA256:
                self.stdout.write(self.style.SUCCESS(f"El modelo ya está en {destino} y es válido."))
                return
            self.stdout.write(self.style.WARNING("El modelo existente no coincide con la huella esperada; se descarga de nuevo."))
        destino.parent.mkdir(parents=True, exist_ok=True)
        with tempfile.NamedTemporaryFile(dir=destino.parent, delete=False, suffix=".part") as tmp:
            tmp_path = Path(tmp.name)
        try:
            urllib.request.urlretrieve(URL, tmp_path)   # noqa: S310 (URL fija de Google)
            obtenido = sha256(tmp_path)
            if obtenido != SHA256:
                raise CommandError(f"Huella SHA-256 inesperada: {obtenido}")
            tmp_path.replace(destino)
        finally:
            tmp_path.unlink(missing_ok=True)
        self.stdout.write(self.style.SUCCESS(f"Modelo descargado en {destino}."))
