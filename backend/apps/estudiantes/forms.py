import datetime as dt

from django import forms

from .models import Estudiante, Grupo


class GrupoForm(forms.ModelForm):
    class Meta:
        model = Grupo
        fields = ["nombre", "grado", "anio"]
        labels = {"nombre": "Nombre del salón", "anio": "Año lectivo"}
        help_texts = {"nombre": 'Ej.: "2ºB" o "Transición A"'}

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields["anio"].initial = dt.date.today().year


class EstudianteForm(forms.ModelForm):
    class Meta:
        model = Estudiante
        fields = ["nombres", "apellidos", "documento", "fecha_nacimiento", "acudiente",
                  "consentimiento_video", "consentimiento_ia_nube", "fecha_consentimiento"]
        widgets = {"fecha_nacimiento": forms.DateInput(attrs={"type": "date"}),
                   "fecha_consentimiento": forms.DateInput(attrs={"type": "date"})}


class EstudiantesMasivoForm(forms.Form):
    nombres = forms.CharField(
        widget=forms.Textarea(attrs={"rows": 8, "placeholder": "Un estudiante por línea:\nApellidos, Nombres\nGómez Pérez, María José"}),
        label="Lista de estudiantes",
        help_text='Un estudiante por línea. Si usas coma, lo anterior a la coma se toma como apellidos.')

    def estudiantes(self):
        filas = []
        for linea in self.cleaned_data["nombres"].splitlines():
            linea = " ".join(linea.split())
            if not linea:
                continue
            if "," in linea:
                apellidos, nombres = (x.strip() for x in linea.split(",", 1))
            else:
                apellidos, nombres = "", linea
            filas.append((nombres[:120], apellidos[:120]))
        return filas


class EvaluacionGrupalForm(forms.Form):
    estudiantes_objetivo = forms.IntegerField(min_value=1, max_value=60, label="Estudiantes a evaluar")
