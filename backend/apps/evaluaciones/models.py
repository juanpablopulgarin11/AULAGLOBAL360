from django.conf import settings
from django.core.files.storage import FileSystemStorage
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models

from apps.catalogo.models import GRADO_CHOICES

from .validadores import validar_evidencia


def almacenamiento_privado():
    """Videos y fotogramas de menores: fuera de MEDIA_URL, solo accesibles por vistas autenticadas."""
    return FileSystemStorage(location=settings.PRIVATE_MEDIA_ROOT, base_url=None)


class Motor(models.TextChoices):
    LOCAL = "local", "Local (reglas)"
    GEMINI = "gemini", "Gemini Vision"


class EvaluacionGrupal(models.Model):
    """Registro secuencial de un salón completo (modo grupal)."""

    grupo = models.ForeignKey("estudiantes.Grupo", on_delete=models.CASCADE, related_name="evaluaciones_grupales")
    docente = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="evaluaciones_grupales")
    habilidad = models.ForeignKey("catalogo.Habilidad", null=True, blank=True, on_delete=models.PROTECT, related_name="+")
    estudiantes_objetivo = models.PositiveSmallIntegerField(validators=[MinValueValidator(1), MaxValueValidator(60)])
    creado = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "evaluación grupal"
        verbose_name_plural = "evaluaciones grupales"
        ordering = ["-creado"]

    def __str__(self) -> str:
        return f"{self.grupo} · {self.creado:%Y-%m-%d}"


class Evaluacion(models.Model):
    class Estado(models.TextChoices):
        PENDIENTE = "pendiente", "Pendiente"
        PROCESANDO = "procesando", "Procesando"
        LISTA = "lista", "Lista"
        ERROR = "error", "Error"

    class Estadio(models.TextChoices):
        INICIAL = "Inicial", "Inicial"
        ELEMENTAL = "Elemental", "Elemental"
        MADURO = "Maduro", "Maduro"

    docente = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="evaluaciones")
    estudiante = models.ForeignKey("estudiantes.Estudiante", null=True, blank=True, on_delete=models.SET_NULL, related_name="evaluaciones")
    evaluacion_grupal = models.ForeignKey(EvaluacionGrupal, null=True, blank=True, on_delete=models.SET_NULL, related_name="evaluaciones")

    archivo = models.FileField(upload_to="evidencias/%Y/%m/", storage=almacenamiento_privado, blank=True,
                               validators=[validar_evidencia])
    archivo_purgado = models.DateTimeField(null=True, blank=True, help_text="Fecha en que se borró el video por retención")
    tipo_archivo = models.CharField(max_length=10, choices=[("video", "Video"), ("imagen", "Imagen")], blank=True)
    habilidad_solicitada = models.ForeignKey("catalogo.Habilidad", null=True, blank=True, on_delete=models.PROTECT,
                                             related_name="+", help_text="Vacío = detección automática")
    grado = models.CharField(max_length=12, choices=GRADO_CHOICES, default="7_anos")
    observaciones_docente = models.TextField(blank=True)
    motor = models.CharField(max_length=10, choices=Motor.choices, default=Motor.LOCAL)

    estado = models.CharField(max_length=12, choices=Estado.choices, default=Estado.PENDIENTE)
    mensaje_error = models.TextField(blank=True)
    advertencias = models.JSONField(default=list, blank=True, help_text="Avisos de calidad de la grabación para el docente")
    meta_video = models.JSONField(default=dict, blank=True, help_text="Resolución, fps, duración y ventana analizada")

    # Resultado
    habilidad_detectada = models.ForeignKey("catalogo.Habilidad", null=True, blank=True, on_delete=models.PROTECT, related_name="+")
    es_deteccion_automatica = models.BooleanField(default=False)
    puntaje = models.PositiveSmallIntegerField(null=True, blank=True)
    puntaje_maximo = models.PositiveSmallIntegerField(null=True, blank=True)
    porcentaje_madurez = models.PositiveSmallIntegerField(null=True, blank=True)
    estadio_gallahue = models.CharField(max_length=10, choices=Estadio.choices, blank=True)
    resumen = models.TextField(blank=True)
    analisis_articular = models.JSONField(default=dict, blank=True)
    errores_criticos = models.JSONField(default=list, blank=True)
    frases_profe = models.JSONField(default=list, blank=True)
    telemetria = models.JSONField(default=dict, blank=True)
    fases_fsm = models.JSONField(default=list, blank=True)
    modelo_ia = models.CharField(max_length=60, blank=True)
    version_motor = models.CharField(max_length=30, blank=True, help_text="Para reproducir el resultado si cambian los umbrales")

    creado = models.DateTimeField(auto_now_add=True)
    actualizado = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "evaluación"
        verbose_name_plural = "evaluaciones"
        ordering = ["-creado"]
        indexes = [models.Index(fields=["estudiante", "-creado"]), models.Index(fields=["estado"])]

    def como_diagnostico(self) -> dict:
        """El resultado en el contrato JSON ``Diagnostico`` (docs/02 §10), para planeación y reportes."""
        from biomecanica.habilidades import grado_y_ciclo

        h = self.habilidad_detectada
        return {
            "habilidad_detectada": h.nombre if h else "",
            "es_deteccion_automatica": self.es_deteccion_automatica,
            "componente_hmb": h.componente_etiqueta if h else "",
            "prueba_nro": h.prueba_nro if h else None,
            "puntaje_obtenido": f"{self.puntaje}/{self.puntaje_maximo}",
            "edad_calibrada": grado_y_ciclo(self.grado)["grado"],
            "estadio_gallahue": self.estadio_gallahue,
            "porcentaje_madurez": self.porcentaje_madurez,
            "resumen_biomecanico": self.resumen,
            "criterios": [{"criterio": r.texto, "fase": r.fase, "puntaje": r.puntaje, "medido": r.medido,
                           "umbral": r.umbral, "observacion": r.observacion} for r in self.resultados.all()],
            "analisis_articular": self.analisis_articular,
            "errores_criticos": self.errores_criticos,
            "frases_profe": self.frases_profe,
            "telemetria_medida": self.telemetria,
            "modelo_utilizado": self.modelo_ia,
        }

    def __str__(self) -> str:
        quien = self.estudiante or "Sin estudiante"
        que = self.habilidad_detectada or self.habilidad_solicitada or "auto"
        return f"{quien} · {que} · {self.get_estado_display()}"


class Fotograma(models.Model):
    class TipoHito(models.TextChoices):
        NINGUNO = "", "—"
        INICIAL = "inicial", "Ángulo inicial"
        PICO = "pico", "Pico del gesto"
        SUB = "sub", "Hito secundario"
        FINAL = "final", "Cierre"

    evaluacion = models.ForeignKey(Evaluacion, on_delete=models.CASCADE, related_name="fotogramas")
    orden = models.PositiveSmallIntegerField()
    tiempo_s = models.FloatField()
    fase = models.CharField(max_length=120, blank=True)
    imagen = models.ImageField(upload_to="fotogramas/", storage=almacenamiento_privado, blank=True)
    imagen_esqueleto = models.ImageField(upload_to="fotogramas/", storage=almacenamiento_privado, blank=True)
    landmarks = models.JSONField(null=True, blank=True)
    angulos = models.JSONField(null=True, blank=True)
    es_gatillo = models.BooleanField(default=False)
    hito_tipo = models.CharField(max_length=10, choices=TipoHito.choices, blank=True)
    hito_badge = models.CharField(max_length=60, blank=True)
    hito_titulo = models.CharField(max_length=120, blank=True)
    hito_desc = models.CharField(max_length=200, blank=True)
    hito_color = models.CharField(max_length=9, blank=True)

    class Meta:
        ordering = ["evaluacion", "orden"]
        constraints = [models.UniqueConstraint(fields=["evaluacion", "orden"], name="fotograma_unico_por_orden")]

    def __str__(self) -> str:
        return f"#{self.orden} · {self.tiempo_s:.2f}s"


class ResultadoCriterio(models.Model):
    evaluacion = models.ForeignKey(Evaluacion, on_delete=models.CASCADE, related_name="resultados")
    criterio = models.ForeignKey("catalogo.CriterioHMB", null=True, blank=True, on_delete=models.PROTECT,
                                 help_text="Vacío si el criterio vino como texto libre de la IA")
    orden = models.PositiveSmallIntegerField()
    texto = models.TextField()
    fase = models.CharField(max_length=40, blank=True)
    puntaje = models.PositiveSmallIntegerField(validators=[MaxValueValidator(1)])
    medido = models.CharField(max_length=200, blank=True)
    umbral = models.CharField(max_length=120, blank=True)
    observacion = models.TextField(blank=True)

    class Meta:
        verbose_name = "resultado de criterio"
        verbose_name_plural = "resultados de criterios"
        ordering = ["evaluacion", "orden"]

    def __str__(self) -> str:
        return f"{'✓' if self.puntaje else '✗'} {self.texto[:60]}"
