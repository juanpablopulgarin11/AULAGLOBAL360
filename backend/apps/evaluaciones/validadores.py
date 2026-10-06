from pathlib import Path

from django.conf import settings
from django.core.exceptions import ValidationError

from biomecanica.extraccion import EXTENSIONES_IMAGEN, EXTENSIONES_VIDEO


def validar_evidencia(archivo) -> None:
    """Formato de video/foto admitido y tamaño máximo (``AULA360_MAX_SUBIDA_MB``)."""
    ext = Path(archivo.name).suffix.lower()
    if ext not in EXTENSIONES_VIDEO | EXTENSIONES_IMAGEN:
        raise ValidationError(f"Formato no admitido ({ext or 'sin extensión'}). Usa MP4, MOV, WEBM, JPG o PNG.")
    limite = settings.AULA360_MAX_SUBIDA_MB * 1024 * 1024
    if archivo.size and archivo.size > limite:
        raise ValidationError(f"El archivo supera {settings.AULA360_MAX_SUBIDA_MB} MB. Graba 3 a 5 segundos.")
