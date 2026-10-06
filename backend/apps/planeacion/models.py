"""Unidad didáctica y sus sesiones. El generador (port de ``generateDidacticPlan``) llega en la fase 4."""
from django.conf import settings
from django.db import models


class Formato(models.TextChoices):
    CUENTO_MOTOR = "Cuento Motor", "Cuento Motor"
    CIRCUITO = "Circuito de Estaciones", "Circuito de Estaciones"
    RETOS = "Retos Cooperativos", "Retos Cooperativos"
    JUEGO_LIBRE = "Juego Libre Dirigido", "Juego Libre Dirigido"


class Metodologia(models.TextChoices):
    DESCUBRIMIENTO = "Descubrimiento Guiado", "Descubrimiento Guiado"
    PROBLEMAS = "Resolución de Problemas", "Resolución de Problemas"
    TAREAS = "Asignación de Tareas", "Asignación de Tareas"


DURACIONES = [(m, f"{m} min") for m in (45, 50, 55, 60, 90)]
TOTAL_CLASES = [(n, f"{n} clase{'s' if n > 1 else ''}") for n in (1, 2, 3, 4, 6, 8, 10, 12)]
MATERIALES = ["Conos", "Aros", "Cuerdas", "Balones", "Colchonetas"]


class UnidadDidactica(models.Model):
    docente = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="unidades")
    evaluacion = models.ForeignKey("evaluaciones.Evaluacion", null=True, blank=True, on_delete=models.SET_NULL, related_name="unidades")
    evaluacion_grupal = models.ForeignKey("evaluaciones.EvaluacionGrupal", null=True, blank=True, on_delete=models.SET_NULL, related_name="unidades")
    habilidad = models.ForeignKey("catalogo.Habilidad", on_delete=models.PROTECT, related_name="+")
    formato = models.CharField(max_length=40, choices=Formato.choices, default=Formato.CIRCUITO)
    metodologia = models.CharField(max_length=40, choices=Metodologia.choices, default=Metodologia.TAREAS)
    materiales = models.JSONField(default=list)
    periodo = models.PositiveSmallIntegerField(choices=[(p, f"Período {p}") for p in range(1, 5)], default=1)
    duracion_min = models.PositiveSmallIntegerField(choices=DURACIONES, default=50)
    total_clases = models.PositiveSmallIntegerField(choices=TOTAL_CLASES, default=12)
    contenido = models.JSONField(default=dict, blank=True, help_text="Objeto UnidadDidactica completo (docs/04 §2.5)")
    creado = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "unidad didáctica"
        verbose_name_plural = "unidades didácticas"
        ordering = ["-creado"]

    def __str__(self) -> str:
        return f"{self.habilidad.nombre} · Período {self.periodo} · {self.total_clases} clases"

    def get_absolute_url(self) -> str:
        from django.urls import reverse

        return reverse("unidad", args=[self.pk])


class Sesion(models.Model):
    unidad = models.ForeignKey(UnidadDidactica, on_delete=models.CASCADE, related_name="sesiones")
    numero = models.PositiveSmallIntegerField()
    plantilla = models.ForeignKey("catalogo.PlantillaSesion", null=True, blank=True, on_delete=models.SET_NULL)
    es_refuerzo = models.BooleanField(default=False)
    error_reforzado = models.CharField(max_length=200, blank=True)
    # Copia editable por el docente
    titulo = models.CharField(max_length=220)
    fase_pedagogica = models.CharField(max_length=80, blank=True)
    objetivo = models.TextField()
    distribucion = models.TextField(blank=True)
    actividad_inicial = models.TextField()
    actividad_central = models.TextField()
    actividad_final = models.TextField()
    consigna = models.TextField(blank=True)
    criterio_eval = models.TextField(blank=True)

    class Meta:
        verbose_name = "sesión"
        verbose_name_plural = "sesiones"
        ordering = ["unidad", "numero"]
        constraints = [models.UniqueConstraint(fields=["unidad", "numero"], name="sesion_unica_por_numero")]

    def __str__(self) -> str:
        return f"Sesión {self.numero}: {self.titulo}"
