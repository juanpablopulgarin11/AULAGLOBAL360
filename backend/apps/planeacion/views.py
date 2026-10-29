import re
from typing import Any, Dict, List

from django.contrib import messages
from django.contrib.auth.decorators import login_required
from django.http import HttpResponse, JsonResponse
from django.shortcuts import get_object_or_404, redirect, render
from django.urls import reverse
from django.views.decorators.http import require_http_methods, require_POST

from apps.evaluaciones.models import Evaluacion
from apps.reportes.servicios import documento_de_unidad

from .forms import PreferenciasForm, SesionForm
from .models import Sesion, UnidadDidactica
from .montaje import construir_escena, construir_escena_parte
from .servicios import unidad_para_evaluacion

DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
ESTUDIANTES_POR_DEFECTO = 24
MAX_BYTES_FOTO = 3 * 1024 * 1024                 # una foto JPEG de 1200×750 pesa ~150 KB
FIRMAS_IMAGEN = (b"\xff\xd8\xff", b"\x89PNG\r\n\x1a\n")
CAMPO_FOTO = re.compile(r"montaje-(\d+)-(\d+|planta|inicial|final)")
PARTES = ("inicial", "central", "final")


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
    if request.POST.get("descargar"):
        # La página de la unidad arma el Word con las fotos del montaje 3D (capturas3d.js)
        return redirect(f"{reverse('unidad', args=[ud.pk])}?descargar=1")
    return redirect("unidad", pk=ud.pk)


@login_required
def lista(request):
    unidades = UnidadDidactica.objects.filter(docente=request.user).select_related("habilidad", "evaluacion__estudiante",
                                                                                   "evaluacion_grupal__grupo")
    return render(request, "planeacion/lista.html", {"unidades": unidades})


@login_required
def detalle(request, pk):
    ud = get_object_or_404(UnidadDidactica.objects.select_related("habilidad"), pk=pk, docente=request.user)
    return render(request, "planeacion/detalle.html", {"u": ud, "c": ud.contenido,
                                                    "sesiones": ud.sesiones.select_related("unidad__habilidad")})


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


def _escena_de(ud: UnidadDidactica, sesion: Sesion, estudiantes: int, parte: str = "central") -> Dict[str, Any]:
    """Modelado 3D de una parte de la sesión: la central es el montaje; la inicial y la final, su juego o tarea."""
    if parte in ("inicial", "final"):
        return construir_escena_parte(sesion.actividad_con_material(parte), parte, estudiantes=estudiantes,
                                      materiales=ud.materiales, habilidad=ud.habilidad.nombre)
    central = (ud.contenido.get("duraciones", {}).get("central") or "").split(" ")[0]
    return construir_escena(sesion.distribucion, estudiantes=estudiantes, materiales=ud.materiales,
                            minutos_central=int(central) if central.isdigit() else None, habilidad=ud.habilidad.nombre)


@login_required
def montaje(request, pk, numero):
    sesion = get_object_or_404(Sesion.objects.select_related("unidad"), unidad__pk=pk, unidad__docente=request.user,
                               numero=numero)
    ud = sesion.unidad
    try:
        estudiantes = max(6, min(45, int(request.GET["estudiantes"])))
    except (KeyError, ValueError):
        estudiantes = _estudiantes_del_salon(ud)
    parte = request.GET.get("parte") if request.GET.get("parte") in PARTES else "central"
    escena = _escena_de(ud, sesion, estudiantes, parte)
    numeros = list(ud.sesiones.values_list("numero", flat=True))
    i = numeros.index(sesion.numero)
    return render(request, "planeacion/montaje.html", {
        "u": ud, "sesion": sesion, "escena": escena, "estudiantes": estudiantes, "parte": parte, "partes": PARTES,
        "anterior": numeros[i - 1] if i > 0 else None, "siguiente": numeros[i + 1] if i + 1 < len(numeros) else None,
    })


@login_required
def escenas(request, pk):
    """Escenas 3D de todas las sesiones, para que el navegador tome las fotos del Word."""
    ud = get_object_or_404(UnidadDidactica, pk=pk, docente=request.user)
    estudiantes = _estudiantes_del_salon(ud)
    return JsonResponse({"sesiones": [{"numero": s.numero, "titulo": s.titulo, "escena": _escena_de(ud, s, estudiantes),
                                       "partes": {p: _escena_de(ud, s, estudiantes, p) for p in ("inicial", "final")}}
                                      for s in ud.sesiones.all()]})


def _fotos_de_montaje(request, ud: UnidadDidactica) -> Dict[int, Dict[str, Any]]:
    """Fotos enviadas como ``montaje-<sesión>-<k>`` (k=0: montaje completo en 3D; ``planta``: vista
    desde arriba con medidas; ``inicial`` y ``final``: modelado de esas partes; k≥1: paso k).

    Devuelve ``{número: {"completo": bytes | None, "planta": bytes | None, "pasos": [(texto del paso, bytes), ...]}}``.
    Se ignora lo que no corresponda a una sesión o paso real, lo que pese demasiado o no sea JPEG/PNG.
    """
    recibidas: Dict[int, Dict[Any, bytes]] = {}
    for campo, archivo in request.FILES.items():
        m = CAMPO_FOTO.fullmatch(campo)
        if not m or archivo.size > MAX_BYTES_FOTO:
            continue
        datos = archivo.read()
        if datos.startswith(FIRMAS_IMAGEN):
            k = m.group(2)
            recibidas.setdefault(int(m.group(1)), {})[int(k) if k.isdigit() else k] = datos
    if not recibidas:
        return {}
    estudiantes = _estudiantes_del_salon(ud)
    montajes: Dict[int, Dict[str, Any]] = {}
    for sesion in ud.sesiones.filter(numero__in=recibidas):
        fotos = recibidas[sesion.numero]
        pasos: List[str] = _escena_de(ud, sesion, estudiantes)["pasos"]
        montajes[sesion.numero] = {
            "completo": fotos.get(0),
            "planta": fotos.get("planta"),
            "inicial": fotos.get("inicial"),
            "final": fotos.get("final"),
            "pasos": [(texto, fotos[k]) for k, texto in enumerate(pasos, start=1) if k in fotos],
        }
    return montajes


@login_required
@require_http_methods(["GET", "POST"])
def documento(request, pk):
    """Word de la unidad. Por POST llegan las fotos del montaje 3D de cada sesión (capturas3d.js)."""
    ud = get_object_or_404(UnidadDidactica, pk=pk, docente=request.user)
    montajes = _fotos_de_montaje(request, ud) if request.method == "POST" else None

    sesiones_filtro = None
    if request.method == "POST":
        raw = request.POST.get("sesiones_elegidas") or request.POST.get("sesiones")
    else:
        raw = request.GET.get("sesiones_elegidas") or request.GET.get("sesiones")

    if raw:
        try:
            sesiones_filtro = [int(x.strip()) for x in str(raw).split(",") if x.strip().isdigit()]
        except (ValueError, TypeError):
            sesiones_filtro = None

    contenido, nombre = documento_de_unidad(ud, montajes=montajes, sesiones_filtro=sesiones_filtro)
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
