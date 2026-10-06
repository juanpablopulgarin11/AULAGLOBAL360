from django.contrib import admin
from django.contrib.auth import views as auth_views
from django.urls import path

from apps.cuentas import views as cuentas
from apps.estudiantes import views as estudiantes
from apps.evaluaciones import views as evaluaciones
from apps.planeacion import views as planeacion

admin.site.site_header = "AULA GLOBAL 360 · Administración"
admin.site.site_title = "AULA GLOBAL 360"

urlpatterns = [
    path("", cuentas.inicio, name="inicio"),
    path("panel/", cuentas.panel, name="panel"),
    path("cuentas/ingresar/", auth_views.LoginView.as_view(), name="ingresar"),
    path("cuentas/salir/", auth_views.LogoutView.as_view(), name="salir"),
    path("cuentas/registro/", cuentas.registro, name="registro"),
    path("cuentas/clave/", auth_views.PasswordChangeView.as_view(success_url="/panel/"), name="cambiar_clave"),

    path("evaluar/", evaluaciones.evaluar, name="evaluar"),
    path("evaluaciones/", evaluaciones.lista, name="evaluaciones"),
    path("evaluaciones/<int:pk>/", evaluaciones.detalle, name="evaluacion"),
    path("evaluaciones/<int:pk>/estado/", evaluaciones.estado, name="evaluacion_estado"),
    path("evaluaciones/<int:pk>/fotogramas/<int:orden>/<str:tipo>.jpg", evaluaciones.imagen_fotograma, name="fotograma"),
    path("evaluaciones/<int:pk>/reporte.docx", evaluaciones.reporte, name="reporte"),
    path("evaluaciones/<int:pk>/eliminar/", evaluaciones.eliminar, name="evaluacion_eliminar"),
    path("evaluaciones/<int:pk>/reprocesar/", evaluaciones.reprocesar, name="evaluacion_reprocesar"),
    path("evaluaciones/<int:evaluacion_pk>/unidad/", planeacion.crear_desde_evaluacion, name="unidad_crear"),

    path("unidades/", planeacion.lista, name="unidades"),
    path("unidades/<int:pk>/", planeacion.detalle, name="unidad"),
    path("unidades/<int:pk>/sesiones/<int:numero>/", planeacion.editar_sesion, name="sesion_editar"),
    path("unidades/<int:pk>/plan.docx", planeacion.documento, name="unidad_docx"),
    path("unidades/<int:pk>/eliminar/", planeacion.eliminar, name="unidad_eliminar"),

    path("grupos/", estudiantes.grupos, name="grupos"),
    path("grupos/<int:pk>/", estudiantes.grupo, name="grupo"),
    path("grupos/<int:grupo_pk>/evaluacion-grupal/", evaluaciones.grupal_crear, name="grupal_crear"),
    path("evaluaciones-grupales/<int:pk>/", evaluaciones.grupal_detalle, name="grupal"),
    path("evaluaciones-grupales/<int:pk>/plan/", evaluaciones.grupal_plan, name="grupal_plan"),
    path("estudiantes/<int:pk>/", estudiantes.estudiante, name="estudiante"),
    path("estudiantes/<int:pk>/editar/", estudiantes.estudiante_editar, name="estudiante_editar"),

    path("admin/", admin.site.urls),
]
