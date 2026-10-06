from django.contrib import admin

from .models import CriterioHMB, Habilidad, PlantillaSesion


class CriterioInline(admin.TabularInline):
    model = CriterioHMB
    extra = 0
    fields = ["orden", "fase", "texto", "umbral_texto", "error_titulo"]
    readonly_fields = fields   # la lógica vive en biomecanica.reglas; se sincroniza con cargar_catalogo
    can_delete = False


@admin.register(Habilidad)
class HabilidadAdmin(admin.ModelAdmin):
    list_display = ["orden", "icono", "nombre", "codigo", "componente", "prueba_nro", "n_plantillas"]
    list_display_links = ["nombre"]
    inlines = [CriterioInline]

    @admin.display(description="plantillas")
    def n_plantillas(self, obj):
        return obj.plantillas.count()


@admin.register(PlantillaSesion)
class PlantillaSesionAdmin(admin.ModelAdmin):
    list_display = ["habilidad", "orden", "titulo", "fase_pedagogica"]
    list_filter = ["habilidad", "fase_pedagogica"]
    search_fields = ["titulo", "objetivo", "actividad_central"]
