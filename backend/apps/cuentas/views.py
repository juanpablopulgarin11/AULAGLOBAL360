from django.contrib import messages
from django.contrib.auth import login
from django.contrib.auth.decorators import login_required
from django.db.models import Count
from django.shortcuts import redirect, render

from apps.estudiantes.models import Grupo
from apps.evaluaciones.models import Evaluacion
from apps.planeacion.models import UnidadDidactica

from django.http import JsonResponse
from django.views.decorators.http import require_GET, require_POST

from apps.ia import cliente as ia

from .forms import ConfiguracionClaseForm, GeminiForm, RegistroForm


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


def _ruta_interna(ruta: str) -> str:
    return ruta if ruta.startswith("/") and not ruta.startswith("//") else ""


def _quiere_json(request) -> bool:
    return request.headers.get("x-requested-with") == "fetch"


@login_required
def configurar_clase(request):
    form = ConfiguracionClaseForm(request.POST or None, initial=request.user.configuracion_clase or None, auto_id="config_%s")
    siguiente = _ruta_interna(request.POST.get("siguiente") or request.GET.get("siguiente", ""))
    if request.method == "POST":
        if form.is_valid():
            request.user.configuracion_clase = {**request.user.configuracion_clase, **form.cleaned_data}
            request.user.save(update_fields=["configuracion_clase"])
            if _quiere_json(request):
                return JsonResponse({"ok": True})
            messages.success(request, "Configuración de clase guardada.")
            return redirect(siguiente or "panel")
        if _quiere_json(request):
            return JsonResponse({"ok": False, "errores": form.errors}, status=400)
    return render(request, "cuentas/configurar_clase.html", {"form_config": form, "siguiente": siguiente})


@login_required
@require_POST
def elegir_motor(request):
    """Selector de la cabecera: «Análisis rápido» o «Análisis detallado (con IA)»."""
    motor = request.POST.get("motor")
    siguiente = _ruta_interna(request.POST.get("siguiente", "")) or "panel"
    if motor in ("local", "gemini"):
        request.user.configuracion_clase = {**request.user.configuracion_clase, "motor": motor}
        request.user.save(update_fields=["configuracion_clase"])
        if motor == "gemini" and not ia.disponible_para(request.user):
            messages.info(request, "Para el análisis con IA conecta tu clave de Google AI Studio en «Configurar clase».")
    return redirect(siguiente)


@login_required
@require_POST
def configurar_gemini(request):
    form = GeminiForm(request.POST)
    siguiente = _ruta_interna(request.POST.get("siguiente", "")) or "configurar_clase"
    docente = request.user
    error = ""
    if not form.is_valid():
        error = next(iter(form.errors.values()))[0]
    elif form.cleaned_data["accion"] == "conectar":
        clave = form.cleaned_data["clave"]
        try:
            modelos = ia.listar_modelos(ia.crear_cliente(clave), clave, refrescar=True)
        except Exception as exc:   # noqa: BLE001 - cualquier rechazo de Google se informa al docente
            error = f"Google no aceptó la clave ({str(exc)[:120]})."
        else:
            if not modelos:
                error = "La cuenta de Google no tiene modelos Gemini con visión disponibles."
            else:
                docente.gemini_clave = clave
                docente.configuracion_clase = {**docente.configuracion_clase, "motor": "gemini"}
                docente.save(update_fields=["gemini_clave_cifrada", "configuracion_clase"])
    elif form.cleaned_data["accion"] == "modelo":
        docente.gemini_modelo = "" if form.cleaned_data["modelo"] in ("", "auto") else form.cleaned_data["modelo"]
        docente.save(update_fields=["gemini_modelo"])
    else:
        docente.gemini_clave = ""
        docente.gemini_modelo = ""
        docente.save(update_fields=["gemini_clave_cifrada", "gemini_modelo"])
    if _quiere_json(request):
        return JsonResponse({"ok": not error, "error": error, "clave": docente.gemini_clave_oculta,
                             "modelo": docente.gemini_modelo or "auto"}, status=400 if error else 200)
    if error:
        messages.error(request, error)
    else:
        messages.success(request, "Configuración de Gemini actualizada.")
    return redirect(siguiente)


@login_required
@require_GET
def modelos_gemini(request):
    """Modelos con visión de la cuenta del docente (botón «Actualizar» del panel)."""
    clave = ia.clave_para(request.user)
    if not clave:
        return JsonResponse({"modelos": [], "error": "Conecta primero tu clave de Google AI Studio."}, status=400)
    try:
        modelos = ia.listar_modelos(ia.crear_cliente(clave), clave, refrescar=request.GET.get("refrescar") == "1")
    except Exception as exc:   # noqa: BLE001
        return JsonResponse({"modelos": [], "error": f"No se pudo consultar Google ({str(exc)[:120]})."}, status=502)
    return JsonResponse({"modelos": modelos, "elegido": request.user.gemini_modelo or "auto"})


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
