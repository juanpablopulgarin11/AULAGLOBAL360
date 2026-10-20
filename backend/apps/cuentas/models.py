import base64
import hashlib

from django.conf import settings
from django.contrib.auth.models import AbstractUser
from django.db import models


def _fernet():
    """Cifrado simétrico derivado de SECRET_KEY: la clave de Gemini del docente no se guarda en claro."""
    from cryptography.fernet import Fernet

    return Fernet(base64.urlsafe_b64encode(hashlib.sha256(f"gemini:{settings.SECRET_KEY}".encode()).digest()))


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
    configuracion_clase = models.JSONField(
        "configuración de clase", default=dict, blank=True,
        help_text="Valores por defecto de «Configurar clase»: grado, formato, metodología, período, duración, "
                  "número de clases, materiales, estudiantes por clase y motor de análisis.",
    )
    gemini_clave_cifrada = models.TextField("clave de Gemini (cifrada)", blank=True, editable=False)
    gemini_modelo = models.CharField("modelo de Gemini", max_length=80, blank=True,
                                     help_text="Vacío = automático (el mejor modelo flash disponible en la cuenta).")

    class Meta:
        verbose_name = "docente"
        verbose_name_plural = "docentes"

    def __str__(self) -> str:
        return self.get_full_name() or self.username

    # Campos de «Configurar clase» que son preferencias de la unidad didáctica (PreferenciasForm)
    CAMPOS_UNIDAD = ("formato", "metodologia", "periodo", "duracion_min", "total_clases", "materiales")

    @property
    def preferencias_unidad(self) -> dict:
        return {k: v for k, v in self.configuracion_clase.items() if k in self.CAMPOS_UNIDAD}

    @property
    def gemini_clave(self) -> str:
        if not self.gemini_clave_cifrada:
            return ""
        from cryptography.fernet import InvalidToken

        try:
            return _fernet().decrypt(self.gemini_clave_cifrada.encode()).decode()
        except InvalidToken:   # cambió SECRET_KEY: hay que volver a conectar la clave
            return ""

    @gemini_clave.setter
    def gemini_clave(self, clave: str) -> None:
        clave = (clave or "").strip()
        self.gemini_clave_cifrada = _fernet().encrypt(clave.encode()).decode() if clave else ""

    @property
    def gemini_clave_oculta(self) -> str:
        clave = self.gemini_clave
        return f"{clave[:6]}••••{clave[-4:]}" if len(clave) > 12 else ("••••" if clave else "")

    def recordar_preferencias(self, datos: dict) -> None:
        """Guarda lo elegido al generar una unidad como nueva configuración de clase."""
        self.configuracion_clase = {**self.configuracion_clase, **{k: datos[k] for k in self.CAMPOS_UNIDAD if k in datos}}
        self.save(update_fields=["configuracion_clase"])
