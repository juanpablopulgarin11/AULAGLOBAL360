from django import forms
from django.contrib.auth.forms import UserCreationForm

from apps.catalogo.models import GRADO_CHOICES
from apps.planeacion.forms import PreferenciasForm

from .models import Docente, Institucion

# Mismos rótulos que el selector de la cabecera de la versión web
MOTORES = [("local", "Análisis rápido (motor local)"), ("gemini", "Análisis detallado (con IA)")]
MODOS = [("individual", "Individual (un estudiante)"), ("colectivo", "Colectivo (salón completo)")]


class RegistroForm(UserCreationForm):
    first_name = forms.CharField(label="Nombres", max_length=150)
    last_name = forms.CharField(label="Apellidos", max_length=150)
    email = forms.EmailField(label="Correo")
    institucion = forms.CharField(label="Institución educativa", max_length=200, required=False)

    class Meta(UserCreationForm.Meta):
        model = Docente
        fields = ["username", "first_name", "last_name", "email"]

    def save(self, commit=True):
        docente = super().save(commit=False)
        nombre = self.cleaned_data.get("institucion", "").strip()
        if nombre:
            docente.institucion, _ = Institucion.objects.get_or_create(nombre=nombre)
        if commit:
            docente.save()
        return docente


class ConfiguracionClaseForm(PreferenciasForm):
    """«Configurar clase» de la versión web: se guarda por docente y precarga evaluación, planeación y montaje."""

    grado = forms.ChoiceField(choices=GRADO_CHOICES, initial="7_anos", label="Edad / grado del estudiante")
    estudiantes = forms.IntegerField(min_value=1, max_value=60, initial=30, label="Número de estudiantes",
                                     help_text="Se usa en la evaluación grupal y en el montaje 3D de las sesiones.")
    motor = forms.ChoiceField(choices=MOTORES, initial="local", widget=forms.HiddenInput, label="Motor de análisis",
                              required=False)
    modo = forms.ChoiceField(choices=MODOS, initial="individual", widget=forms.HiddenInput, label="Modo de evaluación",
                             required=False)

    field_order = ["grado", "formato", "metodologia", "periodo", "duracion_min", "total_clases", "materiales",
                   "estudiantes", "motor", "modo"]

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        for nombre, campo in self.fields.items():
            if nombre not in ("materiales", "motor", "modo"):
                campo.widget.attrs["class"] = "drawer-select"


class GeminiForm(forms.Form):
    """Conexión de la clave de Google AI Studio y elección del modelo (sección Gemini del panel)."""

    accion = forms.ChoiceField(choices=[("conectar", "conectar"), ("modelo", "modelo"), ("desconectar", "desconectar")])
    clave = forms.CharField(required=False, max_length=200, strip=True,
                            widget=forms.PasswordInput(attrs={"placeholder": "AIzaSy…", "autocomplete": "off"}))
    modelo = forms.CharField(required=False, max_length=80)

    def clean(self):
        datos = super().clean()
        if datos.get("accion") == "conectar" and not datos.get("clave"):
            self.add_error("clave", "Pega la clave de Google AI Studio.")
        return datos
