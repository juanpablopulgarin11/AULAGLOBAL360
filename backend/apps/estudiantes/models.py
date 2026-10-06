from django.conf import settings
from django.db import models

from apps.catalogo.models import GRADO_CHOICES


class Grupo(models.Model):
    """Un salón de clase (p. ej. "2ºB") de un año lectivo."""

    institucion = models.ForeignKey("cuentas.Institucion", on_delete=models.CASCADE, related_name="grupos")
    docente = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="grupos")
    nombre = models.CharField(max_length=60)
    grado = models.CharField(max_length=12, choices=GRADO_CHOICES)
    anio = models.PositiveSmallIntegerField("año")

    class Meta:
        ordering = ["-anio", "nombre"]
        constraints = [models.UniqueConstraint(fields=["institucion", "nombre", "anio"], name="grupo_unico_por_anio")]

    def __str__(self) -> str:
        return f"{self.nombre} ({self.anio})"


class Estudiante(models.Model):
    grupo = models.ForeignKey(Grupo, on_delete=models.CASCADE, related_name="estudiantes")
    nombres = models.CharField(max_length=120)
    apellidos = models.CharField(max_length=120, blank=True)
    documento = models.CharField(max_length=30, blank=True)
    fecha_nacimiento = models.DateField(null=True, blank=True)

    # Ley 1581 de 2012: el acudiente autoriza el tratamiento de imágenes del menor
    acudiente = models.CharField(max_length=150, blank=True)
    consentimiento_video = models.BooleanField("autoriza grabar y analizar video", default=False)
    consentimiento_ia_nube = models.BooleanField("autoriza enviar fotogramas a IA en la nube", default=False)
    fecha_consentimiento = models.DateField(null=True, blank=True)

    class Meta:
        ordering = ["apellidos", "nombres"]

    def __str__(self) -> str:
        return f"{self.nombres} {self.apellidos}".strip()
