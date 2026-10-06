from django import forms
from django.contrib.auth.forms import UserCreationForm

from .models import Docente, Institucion


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
