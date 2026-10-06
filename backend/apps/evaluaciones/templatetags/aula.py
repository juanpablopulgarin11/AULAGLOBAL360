import re

from django import template
from django.utils.html import escape
from django.utils.safestring import mark_safe

register = template.Library()

ICONOS = {"Carrera": "🏃", "Salto Horizontal": "🦘", "Marcha": "🚶", "Salto Unipodal": "🦿",
          "Lanzamiento Sobre Hombro": "⚾", "Recepción y Atrape": "🧤", "Patear": "⚽",
          "Equilibrio Dinámico": "🧘", "Equilibrio Estático Unipodal": "🦩"}


@register.filter
def negritas(texto):
    """Escapa el texto y convierte **así** en <strong> (el resumen del motor usa ese marcado)."""
    seguro = escape(texto or "")
    return mark_safe(re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", seguro))


@register.filter
def icono(habilidad):
    nombre = getattr(habilidad, "nombre", habilidad) or ""
    return ICONOS.get(nombre, "🔍")


@register.filter
def get(dic, clave):
    return (dic or {}).get(clave)


@register.simple_tag(takes_context=True)
def activo(context, *prefijos):
    ruta = context["request"].path
    return "activo" if any(ruta.startswith(p) for p in prefijos) else ""
