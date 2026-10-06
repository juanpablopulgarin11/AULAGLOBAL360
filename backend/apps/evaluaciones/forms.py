from django import forms
from django.conf import settings

from apps.catalogo.models import GRADO_CHOICES, Habilidad
from apps.estudiantes.models import Estudiante

from .models import Evaluacion, EvaluacionGrupal, Motor
from .validadores import validar_evidencia


class EvaluarForm(forms.Form):
    habilidad = forms.ChoiceField(widget=forms.RadioSelect, initial="auto")
    archivo = forms.FileField(label="Video o foto del estudiante", validators=[validar_evidencia],
                              widget=forms.ClearableFileInput(attrs={"accept": "video/*,image/*"}))
    estudiante = forms.ModelChoiceField(queryset=Estudiante.objects.none(), required=False,
                                        empty_label="— Sin asociar a un estudiante —")
    grado = forms.ChoiceField(choices=GRADO_CHOICES, initial="7_anos", label="Edad / grado")
    observaciones = forms.CharField(required=False, widget=forms.Textarea(attrs={"rows": 3}),
                                    label="Observaciones (opcional)",
                                    help_text='Ej.: "aterriza con fuerza en talón", "usa calzado plano". '
                                              'Si mencionas la habilidad ("patea", "salto largo") ayuda a la detección automática.')
    motor = forms.ChoiceField(choices=Motor.choices, initial=Motor.LOCAL, widget=forms.RadioSelect,
                              label="Motor de análisis")
    evaluacion_grupal = forms.ModelChoiceField(queryset=EvaluacionGrupal.objects.none(), required=False,
                                               widget=forms.HiddenInput)

    def __init__(self, *args, docente=None, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields["habilidad"].choices = [("auto", "Detección automática")] + [
            (h.codigo, h.nombre) for h in Habilidad.objects.order_by("orden")]
        self.habilidades = list(Habilidad.objects.order_by("orden"))
        if docente is not None:
            self.fields["estudiante"].queryset = (Estudiante.objects.filter(grupo__docente=docente)
                                                  .select_related("grupo").order_by("grupo__nombre", "apellidos", "nombres"))
            self.fields["evaluacion_grupal"].queryset = EvaluacionGrupal.objects.filter(docente=docente)
        if not settings.GEMINI_API_KEY:
            self.fields["motor"].choices = [(Motor.LOCAL, Motor.LOCAL.label)]
            self.fields["motor"].widget = forms.HiddenInput()

    def clean(self):
        datos = super().clean()
        archivo = datos.get("archivo")
        if archivo and datos.get("habilidad") == "auto" and not archivo.content_type.startswith("video"):
            self.add_error("habilidad", "Con una foto la detección automática no es fiable: elige la habilidad que se evalúa.")
        return datos

    def crear_evaluacion(self, docente) -> Evaluacion:
        d = self.cleaned_data
        ev = Evaluacion(
            docente=docente, estudiante=d.get("estudiante"), evaluacion_grupal=d.get("evaluacion_grupal"),
            habilidad_solicitada=None if d["habilidad"] == "auto" else Habilidad.objects.get(codigo=d["habilidad"]),
            grado=d["estudiante"].grupo.grado if d.get("estudiante") else d["grado"],
            observaciones_docente=d.get("observaciones", ""), motor=d.get("motor") or Motor.LOCAL,
        )
        ev.archivo.save(d["archivo"].name, d["archivo"], save=False)
        from biomecanica.extraccion import tipo_de_archivo

        ev.tipo_archivo = tipo_de_archivo(d["archivo"].name) or ""
        ev.save()
        return ev
