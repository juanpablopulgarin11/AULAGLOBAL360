from django.contrib import messages
from django.contrib.auth import login
from django.contrib.auth.decorators import login_required
from django.db.models import Count
from django.shortcuts import redirect, render

from apps.estudiantes.models import Grupo
from apps.evaluaciones.models import Evaluacion
from apps.planeacion.models import UnidadDidactica

from .forms import RegistroForm


def inicio(request):
    return render(request, "landing.html")


def registro(request):
    if request.user.is_authenticated:
        return redirect("panel")
    form = RegistroForm(request.POST or None)
    if request.method == "POST" and form.is_valid():
        docente = form.save()
        login(request, docente)
        messages.success(request, "¡Bienvenido! Ya puedes evaluar tu primer video.")
        return redirect("panel")
    return render(request, "registration/registro.html", {"form": form})


@login_required
def panel(request):
    evaluaciones = Evaluacion.objects.filter(docente=request.user).select_related("estudiante", "habilidad_detectada")
    listas = evaluaciones.filter(estado=Evaluacion.Estado.LISTA)
    contexto = {
        "recientes": evaluaciones[:6],
        "total": evaluaciones.count(),
        "por_estadio": dict(listas.values_list("estadio_gallahue").annotate(n=Count("id"))),
        "grupos": Grupo.objects.filter(docente=request.user).annotate(n=Count("estudiantes"))[:6],
        "unidades": UnidadDidactica.objects.filter(docente=request.user).select_related("habilidad")[:5],
    }
    return render(request, "cuentas/panel.html", contexto)
