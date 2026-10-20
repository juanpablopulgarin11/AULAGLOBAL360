from django.contrib import messages
from django.contrib.auth.decorators import login_required
from django.core.paginator import Paginator
from django.db import transaction
from django.db.models import Count
from django.http import FileResponse, Http404, HttpResponse, JsonResponse
from django.shortcuts import get_object_or_404, redirect, render
from django.urls import reverse
from django.utils import timezone
from django.views.decorators.http import require_POST

from apps.cuentas.models import Institucion
from apps.estudiantes.forms import EvaluacionGrupalForm
from apps.estudiantes.models import Grupo
from apps.planeacion.forms import PreferenciasForm
from apps.planeacion.servicios import unidad_para_grupo, vista_previa_para_evaluacion
from apps.reportes.servicios import reporte_de_evaluacion

from .forms import EvaluarForm
from .models import Evaluacion, EvaluacionGrupal, Fotograma
from .servicios import borrar_fotogramas, consolidar_grupo, habilidad_mas_debil
from .tasks import procesar_evaluacion

DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"


def _evaluacion(request, pk):
    return get_object_or_404(Evaluacion.objects.select_related("estudiante__grupo", "habilidad_detectada",
                                                               "habilidad_solicitada"), pk=pk, docente=request.user)


def _grupal_activa(request):
    """Registro colectivo en curso: el de la URL o el que quedó abierto en «Configurar clase»."""
    pk = request.GET.get("grupal") or request.POST.get("evaluacion_grupal") or request.user.configuracion_clase.get("grupal_activa")
    if not pk or not str(pk).isdigit():
        return None
    return EvaluacionGrupal.objects.filter(pk=pk, docente=request.user).select_related("grupo").first()


@login_required
def evaluar(request):
    inicial = {"grado": request.user.configuracion_clase["grado"]} if "grado" in request.user.configuracion_clase else {}
    if request.GET.get("estudiante"):
        inicial["estudiante"] = request.GET["estudiante"]
    modo_colectivo = request.user.configuracion_clase.get("modo") == "colectivo" or bool(request.GET.get("grupal"))
    grupal = _grupal_activa(request) if modo_colectivo else None
    if grupal:
        inicial["evaluacion_grupal"] = grupal.pk
    form = EvaluarForm(request.POST or None, request.FILES or None, docente=request.user, initial=inicial)
    por_fetch = request.headers.get("x-requested-with") == "fetch"
    if request.method == "POST":
        if form.is_valid():
            ev = form.crear_evaluacion(request.user)
            transaction.on_commit(lambda: procesar_evaluacion.delay(ev.pk))
            if por_fetch:
                return JsonResponse({"url": reverse("evaluacion", args=[ev.pk]),
                                     "estado_url": reverse("evaluacion_estado", args=[ev.pk])})
            return redirect("evaluacion", pk=ev.pk)
        if por_fetch:
            return JsonResponse({"errores": [str(e) for errores in form.errors.values() for e in errores]}, status=400)
    contexto = {"form": form, "modo_colectivo": modo_colectivo, "grupal": grupal,
                "grupos": Grupo.objects.filter(docente=request.user).annotate(n=Count("estudiantes"))}
    if grupal:
        contexto["consolidado"] = consolidar_grupo(grupal)
    return render(request, "evaluaciones/evaluar.html", contexto)


@login_required
@require_POST
def grupal_iniciar(request):
    """«Iniciar registro» de la barra del modo colectivo (como en la web): número de estudiantes y salón."""
    form = EvaluacionGrupalForm(request.POST)
    if not form.is_valid():
        messages.error(request, "Por favor ingresa un número válido de estudiantes (entre 1 y 60).")
        return redirect("evaluar")
    config = request.user.configuracion_clase
    grupo = Grupo.objects.filter(pk=request.POST.get("grupo") or 0, docente=request.user).first()
    if grupo is None:   # sin salón elegido: uno nuevo con el grado de «Configurar clase»
        if request.user.institucion is None:
            request.user.institucion = Institucion.objects.create(nombre=f"Institución de {request.user}")
            request.user.save(update_fields=["institucion"])
        hoy = timezone.localdate()
        nombre = request.POST.get("nombre_grupo", "").strip()[:60] or f"Salón del {hoy:%d/%m/%Y}"
        base, n = nombre, 2
        while Grupo.objects.filter(institucion=request.user.institucion, nombre=nombre, anio=hoy.year).exists():
            nombre, n = f"{base} ({n})", n + 1
        grupo = Grupo.objects.create(institucion=request.user.institucion, docente=request.user, nombre=nombre,
                                     grado=config.get("grado", "7_anos"), anio=hoy.year)
    grupal = EvaluacionGrupal.objects.create(grupo=grupo, docente=request.user, **form.cleaned_data)
    request.user.configuracion_clase = {**config, "modo": "colectivo", "grupal_activa": grupal.pk}
    request.user.save(update_fields=["configuracion_clase"])
    return redirect(f"{reverse('evaluar')}?grupal={grupal.pk}")


@login_required
@require_POST
def grupal_reiniciar(request):
    """«Reiniciar» del registro colectivo: cierra el registro en curso (las evaluaciones se conservan)."""
    config = {k: v for k, v in request.user.configuracion_clase.items() if k != "grupal_activa"}
    request.user.configuracion_clase = config
    request.user.save(update_fields=["configuracion_clase"])
    return redirect("evaluar")


@login_required
def lista(request):
    qs = Evaluacion.objects.filter(docente=request.user).select_related("estudiante__grupo", "habilidad_detectada")
    if request.GET.get("estadio"):
        qs = qs.filter(estadio_gallahue=request.GET["estadio"])
    if request.GET.get("habilidad"):
        qs = qs.filter(habilidad_detectada__codigo=request.GET["habilidad"])
    pagina = Paginator(qs, 20).get_page(request.GET.get("pagina"))
    return render(request, "evaluaciones/lista.html", {"pagina": pagina})


@login_required
def detalle(request, pk):
    ev = _evaluacion(request, pk)
    contexto = {"ev": ev, "procesando": ev.estado in (Evaluacion.Estado.PENDIENTE, Evaluacion.Estado.PROCESANDO)}
    if ev.estado == Evaluacion.Estado.LISTA:
        guardadas = PreferenciasForm.guardadas(request.user)
        contexto.update({
            "resultados": ev.resultados.all(),
            "fotogramas": ev.fotogramas.all(),
            "plan": vista_previa_para_evaluacion(ev, guardadas.preferencias()) if guardadas.is_valid() else None,
            "form_unidad": PreferenciasForm(initial=request.user.preferencias_unidad or None),
            "unidades": ev.unidades.all(),
            "t": ev.telemetria,
        })
    return render(request, "evaluaciones/detalle.html", contexto)


@login_required
def estado(request, pk):
    ev = _evaluacion(request, pk)
    return JsonResponse({"estado": ev.estado, "mensaje": ev.mensaje_error})


@login_required
def imagen_fotograma(request, pk, orden, tipo):
    ev = _evaluacion(request, pk)
    foto = get_object_or_404(Fotograma, evaluacion=ev, orden=orden)
    campo = foto.imagen_esqueleto if tipo == "esqueleto" else foto.imagen
    if not campo:
        raise Http404("Imagen no disponible (puede haberse borrado por la política de retención)")
    respuesta = FileResponse(campo.open("rb"), content_type="image/jpeg")
    respuesta["Cache-Control"] = "private, max-age=3600"
    return respuesta


@login_required
def reporte(request, pk):
    ev = _evaluacion(request, pk)
    if ev.estado != Evaluacion.Estado.LISTA:
        raise Http404("La evaluación aún no tiene diagnóstico")
    contenido, nombre = reporte_de_evaluacion(ev)
    respuesta = HttpResponse(contenido, content_type=DOCX)
    respuesta["Content-Disposition"] = f'attachment; filename="{nombre}"'
    return respuesta


@login_required
@require_POST
def eliminar(request, pk):
    ev = _evaluacion(request, pk)
    borrar_fotogramas(ev)
    if ev.archivo:
        ev.archivo.delete(save=False)
    ev.delete()
    messages.success(request, "La evaluación y sus imágenes se eliminaron.")
    return redirect("evaluaciones")


@login_required
@require_POST
def reprocesar(request, pk):
    ev = _evaluacion(request, pk)
    if not ev.archivo:
        messages.error(request, "El video ya se borró por la política de retención; no se puede reprocesar.")
        return redirect("evaluacion", pk=pk)
    ev.estado = Evaluacion.Estado.PENDIENTE
    ev.advertencias = []
    ev.save(update_fields=["estado", "advertencias", "actualizado"])
    transaction.on_commit(lambda: procesar_evaluacion.delay(ev.pk))
    return redirect("evaluacion", pk=pk)


# ---------------------------------------------------------------------------------------
# Modo grupal (salón)
# ---------------------------------------------------------------------------------------
@login_required
@require_POST
def grupal_crear(request, grupo_pk):
    grupo = get_object_or_404(Grupo, pk=grupo_pk, docente=request.user)
    form = EvaluacionGrupalForm(request.POST)
    if not form.is_valid():
        messages.error(request, "Indica cuántos estudiantes vas a evaluar (1 a 60).")
        return redirect("grupo", pk=grupo.pk)
    grupal = EvaluacionGrupal.objects.create(grupo=grupo, docente=request.user, **form.cleaned_data)
    return redirect("grupal", pk=grupal.pk)


@login_required
def grupal_detalle(request, pk):
    grupal = get_object_or_404(EvaluacionGrupal.objects.select_related("grupo"), pk=pk, docente=request.user)
    evaluaciones = grupal.evaluaciones.select_related("estudiante", "habilidad_detectada")
    evaluados = {e.estudiante_id: e for e in evaluaciones if e.estudiante_id}
    estudiantes = [(est, evaluados.get(est.pk)) for est in grupal.grupo.estudiantes.all()]
    contexto = {
        "grupal": grupal, "estudiantes": estudiantes, "evaluaciones": evaluaciones,
        "consolidado": consolidar_grupo(grupal), "debil": habilidad_mas_debil(grupal),
        "form_unidad": PreferenciasForm(initial=request.user.preferencias_unidad or None),
        "unidades": grupal.unidades.all(),
    }
    return render(request, "evaluaciones/grupal.html", contexto)


@login_required
@require_POST
def grupal_plan(request, pk):
    grupal = get_object_or_404(EvaluacionGrupal, pk=pk, docente=request.user)
    form = PreferenciasForm(request.POST)
    if not form.is_valid() or not consolidar_grupo(grupal)["evaluados"]:
        messages.error(request, "Evalúa al menos un estudiante y revisa las preferencias antes de generar el plan.")
        return redirect("grupal", pk=pk)
    request.user.recordar_preferencias(form.cleaned_data)
    ud = unidad_para_grupo(grupal, request.user, form.preferencias())
    messages.success(request, f"Plan del salón generado con {ud.total_clases} sesiones.")
    return redirect("unidad", pk=ud.pk)
