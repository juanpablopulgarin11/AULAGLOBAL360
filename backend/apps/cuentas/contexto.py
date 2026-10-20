"""Datos del panel «Configurar clase» y del selector de motor, presentes en todas las páginas."""
from apps.ia import cliente as ia

from .forms import ConfiguracionClaseForm


def configuracion_clase(request):
    docente = getattr(request, "user", None)
    if docente is None or not docente.is_authenticated:
        return {}
    config = docente.configuracion_clase
    return {
        "form_config": ConfiguracionClaseForm(initial=config or None, auto_id="config_%s"),
        "motor_preferido": config.get("motor", "local"),
        "modo_preferido": config.get("modo", "individual"),
        "ia_disponible": ia.disponible_para(docente),
        "ia_clave_servidor": bool(ia.settings.GEMINI_API_KEY),
    }
