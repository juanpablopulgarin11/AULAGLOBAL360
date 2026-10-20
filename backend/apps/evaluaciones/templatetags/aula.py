import re

from django import template
from django.utils.html import escape
from django.utils.safestring import mark_safe

register = template.Library()

ICONOS = {"Carrera": "🏃", "Salto Horizontal": "🦘", "Marcha": "🚶", "Salto Unipodal": "🦿",
          "Lanzamiento Sobre Hombro": "⚾", "Recepción y Atrape": "🧤", "Patear": "⚽",
          "Equilibrio Dinámico": "🧘", "Equilibrio Estático Unipodal": "🦩"}


# Rótulos cortos de las tarjetas de habilidad de la web (index.html)
NOMBRES_CORTOS = {"Salto Horizontal": "Salto horizontal", "Salto Unipodal": "Salto unipodal",
                  "Lanzamiento Sobre Hombro": "Lanzamiento", "Recepción y Atrape": "Recepción",
                  "Equilibrio Dinámico": "Equilibrio dinámico", "Equilibrio Estático Unipodal": "Equilibrio estático"}
COMPONENTES_CORTOS = {"HMB-L": "Locomoción", "HMB-M": "Manipulación", "HMB-E": "Estabilidad"}


@register.filter
def nombre_corto(habilidad):
    nombre = getattr(habilidad, "nombre", habilidad) or ""
    return NOMBRES_CORTOS.get(nombre, nombre)


@register.filter
def componente_corto(codigo):
    return COMPONENTES_CORTOS.get(codigo, codigo)


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
