from django.contrib import messages
from django.contrib.auth.decorators import login_required
from django.db.models import Count
from django.shortcuts import get_object_or_404, redirect, render

from apps.cuentas.models import Institucion
from apps.evaluaciones.models import Evaluacion

from .forms import EstudianteForm, EstudiantesMasivoForm, EvaluacionGrupalForm, GrupoForm
from .models import Estudiante, Grupo


@login_required
def grupos(request):
    form = GrupoForm(request.POST or None)
    if request.method == "POST" and form.is_valid():
        if request.user.institucion is None:   # docente independiente: institución propia
            request.user.institucion = Institucion.objects.create(nombre=f"Institución de {request.user}")
            request.user.save(update_fields=["institucion"])
        grupo = form.save(commit=False)
        grupo.docente, grupo.institucion = request.user, request.user.institucion
        grupo.save()
        return redirect("grupo", pk=grupo.pk)
    lista = Grupo.objects.filter(docente=request.user).annotate(n=Count("estudiantes"))
    return render(request, "estudiantes/grupos.html", {"grupos": lista, "form": form})


@login_required
def grupo(request, pk):
    g = get_object_or_404(Grupo, pk=pk, docente=request.user)
    form = EstudiantesMasivoForm(request.POST or None)
    if request.method == "POST" and form.is_valid():
        filas = form.estudiantes()
        Estudiante.objects.bulk_create([Estudiante(grupo=g, nombres=n, apellidos=a) for n, a in filas])
        messages.success(request, f"Se agregaron {len(filas)} estudiantes.")
        return redirect("grupo", pk=g.pk)
    estudiantes = g.estudiantes.annotate(n_eval=Count("evaluaciones"))
    return render(request, "estudiantes/grupo.html", {
        "g": g, "estudiantes": estudiantes, "form": form,
        "form_grupal": EvaluacionGrupalForm(initial={"estudiantes_objetivo": estudiantes.count() or 30}),
        "grupales": g.evaluaciones_grupales.all()[:5],
    })


@login_required
def estudiante(request, pk):
    est = get_object_or_404(Estudiante.objects.select_related("grupo"), pk=pk, grupo__docente=request.user)
    evaluaciones = est.evaluaciones.filter(estado=Evaluacion.Estado.LISTA).select_related("habilidad_detectada").order_by("creado")
    por_habilidad = {}
    for ev in evaluaciones:
        por_habilidad.setdefault(ev.habilidad_detectada, []).append(ev)
    return render(request, "estudiantes/estudiante.html", {"est": est, "por_habilidad": por_habilidad,
                                                           "evaluaciones": evaluaciones.reverse()})


@login_required
def estudiante_editar(request, pk):
    est = get_object_or_404(Estudiante, pk=pk, grupo__docente=request.user)
    form = EstudianteForm(request.POST or None, instance=est)
    if request.method == "POST" and form.is_valid():
        form.save()
        messages.success(request, "Datos del estudiante actualizados.")
        return redirect("estudiante", pk=est.pk)
    return render(request, "estudiantes/estudiante_editar.html", {"form": form, "est": est})
