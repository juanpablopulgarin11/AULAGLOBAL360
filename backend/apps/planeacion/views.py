from django.contrib import messages
from django.contrib.auth.decorators import login_required
from django.http import HttpResponse
from django.shortcuts import get_object_or_404, redirect, render
from django.views.decorators.http import require_POST

from apps.evaluaciones.models import Evaluacion
from apps.reportes.servicios import documento_de_unidad

from .forms import PreferenciasForm, SesionForm
from .models import Sesion, UnidadDidactica
from .servicios import unidad_para_evaluacion

DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"


@login_required
@require_POST
def crear_desde_evaluacion(request, evaluacion_pk):
    ev = get_object_or_404(Evaluacion, pk=evaluacion_pk, docente=request.user, estado=Evaluacion.Estado.LISTA)
    form = PreferenciasForm(request.POST)
    if not form.is_valid():
        messages.error(request, "Revisa las preferencias de la clase.")
        return redirect("evaluacion", pk=ev.pk)
    request.session["preferencias_unidad"] = form.cleaned_data
    ud = unidad_para_evaluacion(ev, request.user, form.preferencias())
    return redirect("unidad", pk=ud.pk)


@login_required
def lista(request):
    unidades = UnidadDidactica.objects.filter(docente=request.user).select_related("habilidad", "evaluacion__estudiante",
                                                                                   "evaluacion_grupal__grupo")
    return render(request, "planeacion/lista.html", {"unidades": unidades})


@login_required
def detalle(request, pk):
    ud = get_object_or_404(UnidadDidactica.objects.select_related("habilidad"), pk=pk, docente=request.user)
    return render(request, "planeacion/detalle.html", {"u": ud, "c": ud.contenido, "sesiones": ud.sesiones.all()})


@login_required
def editar_sesion(request, pk, numero):
    sesion = get_object_or_404(Sesion, unidad__pk=pk, unidad__docente=request.user, numero=numero)
    form = SesionForm(request.POST or None, instance=sesion)
    if request.method == "POST" and form.is_valid():
        form.save()
        messages.success(request, f"Sesión {numero} actualizada.")
        return redirect(f"{sesion.unidad.get_absolute_url()}#sesion-{numero}")
    return render(request, "planeacion/editar_sesion.html", {"form": form, "sesion": sesion, "u": sesion.unidad})


@login_required
def documento(request, pk):
    ud = get_object_or_404(UnidadDidactica, pk=pk, docente=request.user)
    contenido, nombre = documento_de_unidad(ud)
    respuesta = HttpResponse(contenido, content_type=DOCX)
    respuesta["Content-Disposition"] = f'attachment; filename="{nombre}"'
    return respuesta


@login_required
@require_POST
def eliminar(request, pk):
    ud = get_object_or_404(UnidadDidactica, pk=pk, docente=request.user)
    ud.delete()
    messages.success(request, "Unidad didáctica eliminada.")
    return redirect("unidades")
