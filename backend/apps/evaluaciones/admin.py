from django.contrib import admin

from .models import Evaluacion, EvaluacionGrupal, Fotograma, ResultadoCriterio


class ResultadoInline(admin.TabularInline):
    model = ResultadoCriterio
    extra = 0
    fields = ["orden", "fase", "texto", "puntaje", "medido", "umbral", "observacion"]
    readonly_fields = fields
    can_delete = False


class FotogramaInline(admin.TabularInline):
    model = Fotograma
    extra = 0
    fields = ["orden", "tiempo_s", "hito_tipo", "hito_titulo", "hito_desc"]
    readonly_fields = fields
    can_delete = False


@admin.register(Evaluacion)
class EvaluacionAdmin(admin.ModelAdmin):
    list_display = ["creado", "estudiante", "habilidad_detectada", "estadio_gallahue", "porcentaje_madurez", "estado", "motor"]
    list_filter = ["estado", "estadio_gallahue", "motor", "habilidad_detectada"]
    search_fields = ["estudiante__nombres", "estudiante__apellidos"]
    readonly_fields = ["telemetria", "fases_fsm", "analisis_articular", "errores_criticos", "version_motor", "creado", "actualizado"]
    inlines = [ResultadoInline, FotogramaInline]


@admin.register(EvaluacionGrupal)
class EvaluacionGrupalAdmin(admin.ModelAdmin):
    list_display = ["grupo", "habilidad", "estudiantes_objetivo", "creado"]
