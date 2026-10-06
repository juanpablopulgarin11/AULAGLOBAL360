"""Funciones trigonométricas (port de ``script.js:961-995`` y ``1347``).

El orden de las operaciones es el mismo del JS (``x * 180 / pi``) para no introducir
diferencias de redondeo en el último bit.
"""
from __future__ import annotations

import math
from typing import Optional

from .jsutil import js_round
from .landmarks import Punto


def calculate_angle_3d(a: Optional[Punto], b: Optional[Punto], c: Optional[Punto]) -> int:
    """Ángulo (grados, entero) en el vértice ``b``, usando x, y, z."""
    if not a or not b or not c:
        return 180
    v1 = (a.x - b.x, a.y - b.y, (a.z or 0) - (b.z or 0))
    v2 = (c.x - b.x, c.y - b.y, (c.z or 0) - (b.z or 0))
    dot = v1[0] * v2[0] + v1[1] * v2[1] + v1[2] * v2[2]
    mag1 = math.sqrt(v1[0] * v1[0] + v1[1] * v1[1] + v1[2] * v1[2])
    mag2 = math.sqrt(v2[0] * v2[0] + v2[1] * v2[1] + v2[2] * v2[2])
    if mag1 == 0 or mag2 == 0:
        return 180
    cos_theta = max(-1.0, min(1.0, dot / (mag1 * mag2)))
    return js_round(math.acos(cos_theta) * 180 / math.pi)


def angulo_2d(a: Optional[Punto], b: Optional[Punto], c: Optional[Punto]) -> int:
    """Ángulo planar en ``b`` (equivalente a la versión NumPy con ``arctan2``)."""
    if not a or not b or not c:
        return 180
    radianes = math.atan2(c.y - b.y, c.x - b.x) - math.atan2(a.y - b.y, a.x - b.x)
    angulo = abs(radianes * 180.0 / math.pi)
    if angulo > 180.0:
        angulo = 360.0 - angulo
    return js_round(angulo)


def inclinacion_horizontal(p1: Optional[Punto], p2: Optional[Punto]) -> float:
    """Inclinación de la línea p1→p2 respecto a la horizontal (0° = nivelada)."""
    if not p1 or not p2:
        return 0
    angulo = math.atan2(p2.y - p1.y, p2.x - p1.x) * 180.0 / math.pi
    inclinacion = abs(angulo)
    if inclinacion > 90:
        inclinacion = abs(180.0 - inclinacion)
    return inclinacion
