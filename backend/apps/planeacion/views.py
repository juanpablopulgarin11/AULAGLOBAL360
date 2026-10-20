from django.contrib import messages
from django.contrib.auth.decorators import login_required
from django.http import HttpResponse
from django.shortcuts import get_object_or_404, redirect, render
from django.views.decorators.http import require_POST

from apps.evaluaciones.models import Evaluacion
from apps.reportes.servicios import documento_de_unidad

from .forms import PreferenciasForm, SesionForm
from .models import Sesion, UnidadDidactica
from .montaje import construir_escena
from .servicios import unidad_para_evaluacion

DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
ESTUDIANTES_POR_DEFECTO = 24


@login_required
@require_POST
def crear_desde_evaluacion(request, evaluacion_pk):
    ev = get_object_or_404(Evaluacion, pk=evaluacion_pk, docente=request.user, estado=Evaluacion.Estado.LISTA)
    form = PreferenciasForm(request.POST)
    if not form.is_valid():
        messages.error(request, "Revisa las preferencias de la clase.")
        return redirect("evaluacion", pk=ev.pk)
    request.user.recordar_preferencias(form.cleaned_data)
    d = form.cleaned_data
    ud = ev.unidades.filter(formato=d["formato"], metodologia=d["metodologia"], periodo=d["periodo"],
                            duracion_min=d["duracion_min"], total_clases=d["total_clases"],
                            materiales=d["materiales"]).first() or unidad_para_evaluacion(ev, request.user, form.preferencias())
    return redirect("unidad_docx" if request.POST.get("descargar") else "unidad", pk=ud.pk)


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


def _estudiantes_del_salon(ud: UnidadDidactica) -> int:
    """Estudiantes registrados en el salón de la unidad; si hay muy pocos, un grupo típico."""
    grupo = None
    if ud.evaluacion_grupal:
        grupo = ud.evaluacion_grupal.grupo
    elif ud.evaluacion and ud.evaluacion.estudiante:
        grupo = ud.evaluacion.estudiante.grupo
    cantidad = grupo.estudiantes.count() if grupo else 0
    return cantidad if cantidad >= 6 else ud.docente.configuracion_clase.get("estudiantes", ESTUDIANTES_POR_DEFECTO)


@login_required
def montaje(request, pk, numero):
    sesion = get_object_or_404(Sesion.objects.select_related("unidad"), unidad__pk=pk, unidad__docente=request.user,
                               numero=numero)
    ud = sesion.unidad
    try:
        estudiantes = max(6, min(45, int(request.GET["estudiantes"])))
    except (KeyError, ValueError):
        estudiantes = _estudiantes_del_salon(ud)
    central = (ud.contenido.get("duraciones", {}).get("central") or "").split(" ")[0]
    escena = construir_escena(sesion.distribucion, estudiantes=estudiantes, materiales=ud.materiales,
                              minutos_central=int(central) if central.isdigit() else None)
    numeros = list(ud.sesiones.values_list("numero", flat=True))
    i = numeros.index(sesion.numero)
    return render(request, "planeacion/montaje.html", {
        "u": ud, "sesion": sesion, "escena": escena, "estudiantes": estudiantes,
        "anterior": numeros[i - 1] if i > 0 else None, "siguiente": numeros[i + 1] if i + 1 < len(numeros) else None,
    })


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
