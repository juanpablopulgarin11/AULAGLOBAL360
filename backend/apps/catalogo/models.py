"""Catálogo de la Batería HMB: habilidades, criterios y plantillas de sesiones.

La **lógica** de cada criterio (condición y textos con valores medidos) vive en
``biomecanica.reglas`` y está cubierta por las pruebas de paridad con el JS. Estos modelos
guardan los datos descriptivos para el admin, las relaciones y los reportes; se sincronizan
con ``manage.py cargar_catalogo``.
"""
from django.db import models

from biomecanica.habilidades import GRADOS


class Componente(models.TextChoices):
    LOCOMOCION = "HMB-L", "Locomoción"
    MANIPULACION = "HMB-M", "Manipulación"
    ESTABILIDAD = "HMB-E", "Estabilidad-Equilibrio"


GRADO_CHOICES = [(codigo, datos["grado"]) for codigo, datos in GRADOS.items()]


class Habilidad(models.Model):
    codigo = models.SlugField(max_length=30, unique=True, help_text="Código del selector: carrera, salto, patear…")
    nombre = models.CharField(max_length=60, unique=True, help_text="Nombre canónico usado por el motor")
    componente = models.CharField(max_length=5, choices=Componente.choices)
    prueba_nro = models.PositiveSmallIntegerField("prueba n.º en la batería")
    protocolo = models.TextField()
    icono = models.CharField(max_length=8, blank=True)
    frases_profe = models.JSONField("frases del profe", default=list)
    orden = models.PositiveSmallIntegerField(default=0)

    class Meta:
        verbose_name = "habilidad"
        verbose_name_plural = "habilidades"
        ordering = ["orden"]

    def __str__(self) -> str:
        return f"{self.icono} {self.nombre}".strip()

    @property
    def componente_etiqueta(self) -> str:
        """Formato del diagnóstico: "[HMB-L] Locomoción"."""
        return f"[{self.componente}] {self.get_componente_display()}"

    @property
    def tiene_plantillas_propias(self) -> bool:
        return self.plantillas.exists()


class CriterioHMB(models.Model):
    habilidad = models.ForeignKey(Habilidad, on_delete=models.CASCADE, related_name="criterios")
    orden = models.PositiveSmallIntegerField()
    texto = models.TextField()
    fase = models.CharField(max_length=40)
    umbral_texto = models.CharField("umbral mostrado", max_length=120)
    error_titulo = models.CharField("error si no se logra", max_length=200)

    class Meta:
        verbose_name = "criterio HMB"
        verbose_name_plural = "criterios HMB"
        ordering = ["habilidad__orden", "orden"]
        constraints = [models.UniqueConstraint(fields=["habilidad", "orden"], name="criterio_unico_por_habilidad")]

    def __str__(self) -> str:
        return f"{self.habilidad.nombre} #{self.orden} · {self.fase}"


class PlantillaSesion(models.Model):
    """Sesión del banco de progresión (12 por habilidad). Admite los marcadores
    ``{materiales}``, ``{formato}`` y ``{metodologia}``."""

    habilidad = models.ForeignKey(Habilidad, on_delete=models.CASCADE, related_name="plantillas")
    orden = models.PositiveSmallIntegerField()
    titulo = models.CharField(max_length=200)
    fase_pedagogica = models.CharField(max_length=80)
    objetivo = models.TextField()
    distribucion = models.TextField()
    actividad_inicial = models.TextField()
    actividad_central = models.TextField()
    actividad_final = models.TextField()
    consigna = models.TextField()
    criterio_eval = models.TextField("criterio de evaluación")

    class Meta:
        verbose_name = "plantilla de sesión"
        verbose_name_plural = "plantillas de sesión"
        ordering = ["habilidad__orden", "orden"]
        constraints = [models.UniqueConstraint(fields=["habilidad", "orden"], name="plantilla_unica_por_habilidad")]

    def __str__(self) -> str:
        return f"{self.habilidad.nombre} · {self.orden}. {self.titulo}"
