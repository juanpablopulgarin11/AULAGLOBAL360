"""Utilidades para reproducir exactamente la aritmética y el formateo de JavaScript.

El motor original vive en ``script.js``; mientras dure la migración, Python debe dar
los mismos números y los mismos textos. Aquí se concentran las diferencias de lenguaje.
"""
from __future__ import annotations

import math
from typing import Any


def js_round(x: float) -> int:
    """``Math.round`` de JS: redondea .5 hacia +infinito (Python usa redondeo bancario)."""
    return int(math.floor(x + 0.5))


def round1(x: float) -> float:
    """``Math.round(x * 10) / 10``."""
    return js_round(x * 10) / 10


def js_str(v: Any) -> str:
    """Convierte un valor a texto como lo haría una plantilla literal de JS (`${v}`)."""
    if v is None:
        return "undefined"
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, int):
        return str(v)
    if isinstance(v, float):
        if math.isnan(v):
            return "NaN"
        if math.isinf(v):
            return "Infinity" if v > 0 else "-Infinity"
        if v.is_integer() and abs(v) < 1e21:
            return str(int(v))
        return repr(v)
    if isinstance(v, (list, tuple)):
        return ",".join(js_str(x) for x in v)
    return str(v)


def js_or(*valores: Any) -> Any:
    """Operador ``a || b || c`` de JS (0, '', None y False son falsos)."""
    for v in valores[:-1]:
        if v:
            return v
    return valores[-1]


def media(valores: list) -> float:
    """Suma secuencial como ``reduce`` de JS dividida por ``len || 1``."""
    total = 0
    for v in valores:
        total += v
    return total / (len(valores) or 1)
