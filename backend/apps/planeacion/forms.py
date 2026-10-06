from django import forms

from .models import DURACIONES, MATERIALES, TOTAL_CLASES, Formato, Metodologia, Sesion
from .servicios import preferencias


class PreferenciasForm(forms.Form):
    formato = forms.ChoiceField(choices=Formato.choices, initial=Formato.CIRCUITO, label="Formato de clase")
    metodologia = forms.ChoiceField(choices=Metodologia.choices, initial=Metodologia.TAREAS, label="Metodología")
    periodo = forms.TypedChoiceField(choices=[(p, f"Período {p}") for p in range(1, 5)], coerce=int, initial=1, label="Período")
    duracion_min = forms.TypedChoiceField(choices=DURACIONES, coerce=int, initial=50, label="Duración de cada clase")
    total_clases = forms.TypedChoiceField(choices=TOTAL_CLASES, coerce=int, initial=12, label="Número de clases")
    materiales = forms.MultipleChoiceField(choices=[(m, m) for m in MATERIALES], initial=["Conos", "Aros", "Balones"],
                                           widget=forms.CheckboxSelectMultiple, required=False, label="Materiales disponibles")

    def preferencias(self):
        return preferencias(**self.cleaned_data)


class SesionForm(forms.ModelForm):
    class Meta:
        model = Sesion
        fields = ["titulo", "objetivo", "distribucion", "actividad_inicial", "actividad_central", "actividad_final",
                  "consigna", "criterio_eval"]
        labels = {"distribucion": "Montaje y distribución del espacio", "actividad_inicial": "Parte inicial (activación)",
                  "actividad_central": "Parte central (desarrollo)", "actividad_final": "Parte final (vuelta a la calma)",
                  "consigna": "Consigna para los estudiantes", "criterio_eval": "Indicador de evaluación"}
        widgets = {c: forms.Textarea(attrs={"rows": 3}) for c in fields if c != "titulo"}
