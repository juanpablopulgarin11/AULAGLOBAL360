from django.contrib import admin

from .models import Estudiante, Grupo


class EstudianteInline(admin.TabularInline):
    model = Estudiante
    extra = 0
    fields = ["nombres", "apellidos", "documento", "consentimiento_video", "consentimiento_ia_nube"]


@admin.register(Grupo)
class GrupoAdmin(admin.ModelAdmin):
    list_display = ["nombre", "grado", "anio", "institucion", "docente"]
    list_filter = ["anio", "grado", "institucion"]
    inlines = [EstudianteInline]


@admin.register(Estudiante)
class EstudianteAdmin(admin.ModelAdmin):
    list_display = ["__str__", "grupo", "consentimiento_video", "consentimiento_ia_nube"]
    list_filter = ["grupo", "consentimiento_video", "consentimiento_ia_nube"]
    search_fields = ["nombres", "apellidos", "documento"]
