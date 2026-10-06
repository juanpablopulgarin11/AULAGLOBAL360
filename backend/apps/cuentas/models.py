from django.contrib.auth.models import AbstractUser
from django.db import models


class Institucion(models.Model):
    nombre = models.CharField(max_length=200)
    nit = models.CharField("NIT", max_length=30, blank=True)
    municipio = models.CharField(max_length=100, blank=True)
    usa_ia_nube = models.BooleanField(
        "permite IA en la nube", default=False,
        help_text="Autoriza enviar fotogramas a Gemini. Además se exige el consentimiento de cada estudiante.",
    )

    class Meta:
        verbose_name = "institución"
        verbose_name_plural = "instituciones"
        ordering = ["nombre"]

    def __str__(self) -> str:
        return self.nombre


class Docente(AbstractUser):
    """Usuario del sistema. Se define desde el inicio para no tener que migrar el modelo de usuario después."""

    institucion = models.ForeignKey(Institucion, null=True, blank=True, on_delete=models.SET_NULL, related_name="docentes")

    class Meta:
        verbose_name = "docente"
        verbose_name_plural = "docentes"

    def __str__(self) -> str:
        return self.get_full_name() or self.username
