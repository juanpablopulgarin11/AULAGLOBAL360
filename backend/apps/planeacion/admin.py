from django.contrib import admin

from .models import Sesion, UnidadDidactica


class SesionInline(admin.StackedInline):
    model = Sesion
    extra = 0


@admin.register(UnidadDidactica)
class UnidadDidacticaAdmin(admin.ModelAdmin):
    list_display = ["habilidad", "periodo", "total_clases", "formato", "docente", "creado"]
    list_filter = ["habilidad", "periodo", "formato"]
    inlines = [SesionInline]
