"""Representación de los 33 landmarks de MediaPipe Pose.

Coordenadas normalizadas a [0, 1]; ``y`` crece hacia abajo (menor ``y`` = más arriba).
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Iterable, List, Optional

NUM_LANDMARKS = 33

NARIZ = 0
HOMBRO_IZQ, HOMBRO_DER = 11, 12
CODO_IZQ, CODO_DER = 13, 14
MUNECA_IZQ, MUNECA_DER = 15, 16
CADERA_IZQ, CADERA_DER = 23, 24
RODILLA_IZQ, RODILLA_DER = 25, 26
TOBILLO_IZQ, TOBILLO_DER = 27, 28


@dataclass(frozen=True)
class Punto:
    x: float
    y: float
    z: Optional[float] = None
    visibility: Optional[float] = None


def a_punto(p: Any) -> Punto:
    """Acepta un landmark de MediaPipe, un dict ``{x, y, z}`` o una secuencia ``[x, y, z, vis]``."""
    if isinstance(p, Punto):
        return p
    if isinstance(p, dict):
        return Punto(p["x"], p["y"], p.get("z"), p.get("visibility"))
    if hasattr(p, "x") and hasattr(p, "y"):
        return Punto(p.x, p.y, getattr(p, "z", None), getattr(p, "visibility", None))
    seq = list(p)
    return Punto(seq[0], seq[1], seq[2] if len(seq) > 2 else None, seq[3] if len(seq) > 3 else None)


def normalizar(landmarks: Optional[Iterable[Any]]) -> Optional[List[Punto]]:
    if landmarks is None:
        return None
    return [a_punto(p) for p in landmarks]
